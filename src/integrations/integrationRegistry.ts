import type { AppSettings } from '../types';

export interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  authType: 'api_key' | 'oauth' | 'none';
  configureComponent?: React.ComponentType<any>;
  validateToken?: (token: string) => Promise<{ valid: boolean; username?: string; error?: string }>;
  tools: IntegrationTool[];
}

export interface IntegrationTool {
  name: string;
  label: string;
  description: string;
  requiresAuth: boolean;
  enabled: boolean;
  handler?: (settings: AppSettings, ...args: any[]) => Promise<any>;
}

// Integration registry for extensions
class IntegrationRegistry {
  private integrations: Map<string, IntegrationDefinition> = new Map();

  // Register an integration (for extensions)
  register(integration: IntegrationDefinition) {
    this.integrations.set(integration.id, integration);
  }

  // Unregister an integration
  unregister(id: string) {
    this.integrations.delete(id);
  }

  // Get all registered integrations
  getAll(): IntegrationDefinition[] {
    return Array.from(this.integrations.values());
  }

  // Get integration by ID
  get(id: string): IntegrationDefinition | undefined {
    return this.integrations.get(id);
  }

  // Get tools for all configured integrations
  getTools(settings: AppSettings): IntegrationTool[] {
    const tools: IntegrationTool[] = [];
    
    // Add GitHub tools if configured
    if (settings.integrations?.github?.configured) {
      tools.push(...this.getGitHubTools(settings));
    }

    // Add tools from extension integrations
    for (const integration of this.integrations.values()) {
      if (settings.integrations?.[integration.id]?.configured) {
        tools.push(...integration.tools.map(tool => ({
          ...tool,
          enabled: true
        })));
      }
    }

    return tools;
  }

  // Get GitHub tools (built-in)
  private getGitHubTools(settings: AppSettings): IntegrationTool[] {
    return [
      {
        name: 'github_list_repos',
        label: 'List Repositories',
        description: 'List all repositories for the authenticated user',
        requiresAuth: true,
        enabled: true,
        handler: async () => {
          const client = this.getGitHubClient(settings);
          if (!client) throw new Error('GitHub not configured');
          return await client.listRepos();
        }
      },
      {
        name: 'github_get_repo',
        label: 'Get Repository',
        description: 'Get detailed information about a specific repository',
        requiresAuth: true,
        enabled: true,
        handler: async (owner: string, repo: string) => {
          const client = this.getGitHubClient(settings);
          if (!client) throw new Error('GitHub not configured');
          return await client.getRepo(owner, repo);
        }
      },
      {
        name: 'github_list_files',
        label: 'List Repository Files',
        description: 'List files and directories in a repository',
        requiresAuth: true,
        enabled: true,
        handler: async (owner: string, repo: string, path: string = '') => {
          const client = this.getGitHubClient(settings);
          if (!client) throw new Error('GitHub not configured');
          return await client.listFiles(owner, repo, path);
        }
      },
      {
        name: 'github_get_file',
        label: 'Get File Content',
        description: 'Get the content of a specific file from a repository',
        requiresAuth: true,
        enabled: true,
        handler: async (owner: string, repo: string, path: string) => {
          const client = this.getGitHubClient(settings);
          if (!client) throw new Error('GitHub not configured');
          return await client.getFile(owner, repo, path);
        }
      },
      {
        name: 'github_search_repos',
        label: 'Search Repositories',
        description: 'Search for repositories based on criteria',
        requiresAuth: true,
        enabled: true,
        handler: async (query: string, sort = 'updated', order = 'desc') => {
          const client = this.getGitHubClient(settings);
          if (!client) throw new Error('GitHub not configured');
          return await client.searchRepos(query, sort, order);
        }
      },
      {
        name: 'github_get_issues',
        label: 'Get Issues',
        description: 'Get issues from a repository',
        requiresAuth: true,
        enabled: true,
        handler: async (owner: string, repo: string, state = 'open') => {
          const client = this.getGitHubClient(settings);
          if (!client) throw new Error('GitHub not configured');
          return await client.getIssues(owner, repo, state);
        }
      }
    ];
  }

  // Get GitHub client
  private getGitHubClient(settings: AppSettings) {
    const patToken = settings.integrations?.github?.patToken;
    if (!patToken) return null;
    
    return new (class GitHubApiClient {
      private patToken: string;

      constructor(patToken: string) {
        this.patToken = patToken;
      }

      private async makeRequest(url: string, options: RequestInit = {}) {
        const response = await fetch(`https://api.github.com${url}`, {
          headers: {
            'Authorization': `token ${this.patToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            ...options.headers
          },
          ...options
        });

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        return response;
      }

      async listRepos() {
        const response = await this.makeRequest('/user/repos');
        return response.json();
      }

      async getRepo(owner: string, repo: string) {
        const response = await this.makeRequest(`/repos/${owner}/${repo}`);
        return response.json();
      }

      async listFiles(owner: string, repo: string, path: string = '') {
        const url = path ? `/repos/${owner}/${repo}/contents/${path}` : `/repos/${owner}/${repo}/contents`;
        const response = await this.makeRequest(url);
        return response.json();
      }

      async getFile(owner: string, repo: string, path: string) {
        const response = await this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`);
        return response.json();
      }

      async searchRepos(query: string, sort = 'updated', order = 'desc') {
        const response = await this.makeRequest(`/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=${order}`);
        return response.json();
      }

      async getIssues(owner: string, repo: string, state = 'open') {
        const response = await this.makeRequest(`/repos/${owner}/${repo}/issues?state=${state}`);
        return response.json();
      }
    })(patToken);
  }

  // Execute a tool
  async executeTool(toolName: string, settings: AppSettings, ...args: any[]): Promise<any> {
    const tools = this.getTools(settings);
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    if (!tool.enabled) {
      throw new Error(`Tool '${toolName}' is not enabled`);
    }

    if (tool.handler) {
      return await tool.handler(settings, ...args);
    }

    throw new Error(`Tool '${toolName}' has no handler`);
  }
}

// Global registry instance
export const integrationRegistry = new IntegrationRegistry();

// Helper function for extensions to register integrations
export function registerIntegration(integration: IntegrationDefinition) {
  integrationRegistry.register(integration);
}

// Helper function for extensions to unregister integrations
export function unregisterIntegration(id: string) {
  integrationRegistry.unregister(id);
}
