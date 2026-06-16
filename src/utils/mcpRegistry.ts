import type { McpServerConfig } from '../types';
import type { Tool } from '../types/tools';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpServerState {
  config: McpServerConfig;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  tools: McpTool[];
}

type StateListener = () => void;

class McpRegistry {
  private servers: Map<string, McpServerState> = new Map();
  private listeners: Set<StateListener> = new Set();

  subscribe(fn: StateListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  getServers(): McpServerState[] {
    return Array.from(this.servers.values());
  }

  getServer(id: string): McpServerState | undefined {
    return this.servers.get(id);
  }

  async connect(config: McpServerConfig): Promise<void> {
    this.servers.set(config.id, {
      config,
      status: 'connecting',
      tools: [],
    });
    this.notify();

    try {
      const tools = await this.fetchTools(config);
      this.servers.set(config.id, {
        config,
        status: 'connected',
        tools,
      });
    } catch (e: any) {
      this.servers.set(config.id, {
        config,
        status: 'error',
        error: e?.message ?? String(e),
        tools: [],
      });
    }
    this.notify();
  }

  disconnect(id: string) {
    const state = this.servers.get(id);
    if (state) {
      this.servers.set(id, { ...state, status: 'disconnected', tools: [] });
      this.notify();
    }
  }

  remove(id: string) {
    this.servers.delete(id);
    this.notify();
  }

  private buildHeaders(config: McpServerConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(config.headers ?? {}),
    };
  }

  // Parses a response that may be application/json OR text/event-stream (SSE)
  private async parseJsonRpcResponse(res: Response): Promise<any> {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream')) {
      // Read SSE stream and find the first "data:" line that looks like a JSON-RPC response
      const text = await res.text();
      for (const line of text.split('\n')) {
        if (line.startsWith('data:')) {
          const json = line.slice(5).trim();
          if (json) return JSON.parse(json);
        }
      }
      throw new Error('No data in SSE response');
    }
    return res.json();
  }

  private async fetchTools(config: McpServerConfig): Promise<McpTool[]> {
    const headers = this.buildHeaders(config);

    // MCP initialize handshake
    const initRes = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'lumina-chat', version: '1.0' },
        },
      }),
    });

    if (!initRes.ok) throw new Error(`HTTP ${initRes.status}: ${initRes.statusText}`);
    await this.parseJsonRpcResponse(initRes).catch(() => {}); // consume body

    // Send initialized notification (fire and forget)
    fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => {});

    // List tools
    const listRes = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}: ${listRes.statusText}`);
    const listData = await this.parseJsonRpcResponse(listRes);

    if (listData.error) throw new Error(listData.error.message ?? 'MCP error');

    return (listData.result?.tools ?? []) as McpTool[];
  }

  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const state = this.servers.get(serverId);
    if (!state || state.status !== 'connected') throw new Error('MCP server not connected');

    const headers = this.buildHeaders(state.config);

    const res = await fetch(state.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await this.parseJsonRpcResponse(res);
    if (data.error) throw new Error(data.error.message ?? 'MCP tool error');

    const content = data.result?.content ?? [];
    return content.map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
  }

  // Returns Tool[] compatible with the app's tool system
  getTools(): Tool[] {
    const tools: Tool[] = [];
    for (const state of this.servers.values()) {
      if (state.status !== 'connected' || !state.config.enabled) continue;
      for (const mcpTool of state.tools) {
        const serverId = state.config.id;
        const safeName = `mcp__${state.config.id.replace(/[^a-zA-Z0-9]/g, '_')}__${mcpTool.name}`;
        tools.push({
          definition: {
            type: 'function',
            function: {
              name: safeName,
              description: `[${state.config.name}] ${mcpTool.description ?? mcpTool.name}`,
              parameters: mcpTool.inputSchema ?? { type: 'object', properties: {} },
            },
          },
          execute: (args: any) => this.callTool(serverId, mcpTool.name, args),
        });
      }
    }
    return tools;
  }

  // Load and connect all enabled servers from settings
  async syncFromSettings(servers: McpServerConfig[]): Promise<void> {
    const incomingIds = new Set(servers.map(s => s.id));

    // Remove servers no longer in settings
    for (const id of this.servers.keys()) {
      if (!incomingIds.has(id)) this.remove(id);
    }

    // Connect/reconnect enabled servers
    for (const cfg of servers) {
      const existing = this.servers.get(cfg.id);
      const urlChanged = existing?.config.url !== cfg.url;
      const becameEnabled = cfg.enabled && existing?.config.enabled === false;

      if (!cfg.enabled) {
        if (existing) this.disconnect(cfg.id);
        continue;
      }

      if (!existing || urlChanged || becameEnabled || existing.status === 'disconnected' || existing.status === 'error') {
        await this.connect(cfg);
      } else {
        // Update config in place
        this.servers.set(cfg.id, { ...existing, config: cfg });
        this.notify();
      }
    }
  }
}

export const mcpRegistry = new McpRegistry();
