import { useState, useEffect, useId } from 'react';
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, Wifi, WifiOff, Loader, AlertCircle, CheckCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { AppSettings, McpServerConfig } from '../../types';
import { mcpRegistry, McpServerState } from '../../utils/mcpRegistry';

interface MCPTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

const emptyConfig = (): McpServerConfig => ({
  id: uuidv4(),
  name: '',
  transport: 'streamable-http',
  url: '',
  headers: {},
  enabled: true,
});

function StatusIcon({ status }: { status: McpServerState['status'] }) {
  if (status === 'connecting') return <Loader size={14} className="animate-spin text-[rgb(var(--muted))]" />;
  if (status === 'connected') return <CheckCircle size={14} className="text-green-500" />;
  if (status === 'error') return <AlertCircle size={14} className="text-red-500" />;
  return <WifiOff size={14} className="text-[rgb(var(--muted))]" />;
}

export default function MCPTab({ settings, onUpdateSettings }: MCPTabProps) {
  const servers = settings.mcpServers ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [headerKey, setHeaderKey] = useState('');
  const [headerVal, setHeaderVal] = useState('');
  const [states, setStates] = useState<Map<string, McpServerState>>(() => {
    const m = new Map<string, McpServerState>();
    mcpRegistry.getServers().forEach(s => m.set(s.config.id, s));
    return m;
  });

  useEffect(() => {
    const unsub = mcpRegistry.subscribe(() => {
      const m = new Map<string, McpServerState>();
      mcpRegistry.getServers().forEach(s => m.set(s.config.id, s));
      setStates(new Map(m));
    });
    return unsub;
  }, []);

  const save = (cfg: McpServerConfig) => {
    const next = isNew
      ? [...servers, cfg]
      : servers.map(s => (s.id === cfg.id ? cfg : s));
    onUpdateSettings({ mcpServers: next });
    setEditing(null);
    if (cfg.enabled) mcpRegistry.connect(cfg);
  };

  const remove = (id: string) => {
    onUpdateSettings({ mcpServers: servers.filter(s => s.id !== id) });
    mcpRegistry.remove(id);
  };

  const reconnect = (cfg: McpServerConfig) => {
    mcpRegistry.connect(cfg);
  };

  const toggleEnabled = (cfg: McpServerConfig) => {
    const next = { ...cfg, enabled: !cfg.enabled };
    onUpdateSettings({ mcpServers: servers.map(s => (s.id === cfg.id ? next : s)) });
    if (next.enabled) mcpRegistry.connect(next);
    else mcpRegistry.disconnect(cfg.id);
  };

  const toggle = (id: string) =>
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-semibold text-base">MCP Servers</h3>
          <p className="text-sm text-[rgb(var(--muted))] mt-0.5">
            Connect Model Context Protocol servers to add tools to your chat.
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-1.5 text-sm"
          onClick={() => { setEditing(emptyConfig()); setIsNew(true); }}
        >
          <Plus size={15} /> Add Server
        </button>
      </div>

      {servers.length === 0 && !editing && (
        <div className="border border-dashed border-[rgb(var(--border))] rounded-xl p-8 text-center text-[rgb(var(--muted))] text-sm">
          No MCP servers configured yet.
        </div>
      )}

      {servers.map(cfg => {
        const state = states.get(cfg.id);
        const isExpanded = expanded.has(cfg.id);
        return (
          <div key={cfg.id} className="border border-[rgb(var(--border))] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-[rgb(var(--panel))]">
              <button onClick={() => toggle(cfg.id)} className="text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]">
                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <StatusIcon status={state?.status ?? 'disconnected'} />
              <span className="font-medium text-sm flex-1 truncate">{cfg.name || 'Unnamed'}</span>
              <span className="text-xs text-[rgb(var(--muted))] truncate max-w-[200px] hidden sm:block">{cfg.url}</span>
              <button
                onClick={() => toggleEnabled(cfg)}
                title={cfg.enabled ? 'Disable' : 'Enable'}
                className={`btn-icon ${cfg.enabled ? 'text-[rgb(var(--accent))]' : 'text-[rgb(var(--muted))]'}`}
              >
                <Wifi size={15} />
              </button>
              {cfg.enabled && (
                <button onClick={() => reconnect(cfg)} title="Reconnect" className="btn-icon">
                  <RefreshCw size={14} />
                </button>
              )}
              <button onClick={() => { setEditing({ ...cfg }); setIsNew(false); }} className="btn-icon">
                Edit
              </button>
              <button onClick={() => remove(cfg.id)} className="btn-icon text-red-500">
                <Trash2 size={14} />
              </button>
            </div>

            {isExpanded && state && (
              <div className="px-4 py-3 border-t border-[rgb(var(--border))] bg-[rgb(var(--bg))]">
                {state.status === 'error' && (
                  <p className="text-sm text-red-500 mb-2">Error: {state.error}</p>
                )}
                {state.status === 'connecting' && (
                  <p className="text-sm text-[rgb(var(--muted))]">Connecting…</p>
                )}
                {state.status === 'connected' && state.tools.length === 0 && (
                  <p className="text-sm text-[rgb(var(--muted))]">No tools available from this server.</p>
                )}
                {state.tools.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[rgb(var(--muted))] uppercase tracking-wide mb-2">
                      {state.tools.length} tool{state.tools.length !== 1 ? 's' : ''}
                    </p>
                    {state.tools.map(tool => (
                      <div key={tool.name} className="flex flex-col gap-0.5">
                        <span className="text-sm font-mono font-medium">{tool.name}</span>
                        {tool.description && (
                          <span className="text-xs text-[rgb(var(--muted))]">{tool.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Edit/Add modal */}
      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="font-semibold text-base">{isNew ? 'Add MCP Server' : 'Edit MCP Server'}</h3>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-[rgb(var(--muted))] uppercase tracking-wide">Name</span>
                <input
                  className="input mt-1 w-full"
                  placeholder="My MCP Server"
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="text-xs text-[rgb(var(--muted))] uppercase tracking-wide">URL</span>
                <input
                  className="input mt-1 w-full font-mono text-sm"
                  placeholder="https://example.com/mcp"
                  value={editing.url}
                  onChange={e => setEditing({ ...editing, url: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="text-xs text-[rgb(var(--muted))] uppercase tracking-wide">Transport</span>
                <select
                  className="input mt-1 w-full"
                  value={editing.transport}
                  onChange={e => setEditing({ ...editing, transport: e.target.value as McpServerConfig['transport'] })}
                >
                  <option value="streamable-http">Streamable HTTP</option>
                  <option value="sse">SSE (legacy)</option>
                </select>
              </label>

              {/* Headers */}
              <div>
                <span className="text-xs text-[rgb(var(--muted))] uppercase tracking-wide">Headers</span>
                {Object.entries(editing.headers ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-mono flex-1 truncate">{k}: {v}</span>
                    <button
                      className="btn-icon text-red-500"
                      onClick={() => {
                        const h = { ...editing.headers };
                        delete h[k];
                        setEditing({ ...editing, headers: h });
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input
                    className="input flex-1 text-sm font-mono"
                    placeholder="Header name"
                    value={headerKey}
                    onChange={e => setHeaderKey(e.target.value)}
                  />
                  <input
                    className="input flex-1 text-sm font-mono"
                    placeholder="Value"
                    value={headerVal}
                    onChange={e => setHeaderVal(e.target.value)}
                  />
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => {
                      if (!headerKey.trim()) return;
                      setEditing({ ...editing, headers: { ...editing.headers, [headerKey.trim()]: headerVal } });
                      setHeaderKey(''); setHeaderVal('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={!editing.name.trim() || !editing.url.trim()}
                onClick={() => save(editing)}
              >
                {isNew ? 'Add Server' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
