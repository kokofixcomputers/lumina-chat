import type { AppSettings } from '../types';

export interface GitHubTool {
  name: string;
  label: string;
  description: string;
  requiresAuth: boolean;
  enabled: boolean;
}

// GitHub tools that become available when integration is configured
export const getGitHubTools = (settings: AppSettings): GitHubTool[] => {
  const isConfigured = settings.integrations?.github?.configured;
  
  return [
    {
      name: 'github_list_repos',
      label: 'List Repositories',
      description: 'List all repositories for the authenticated user',
      requiresAuth: true,
      enabled: isConfigured || false
    },
    {
      name: 'github_get_repo',
      label: 'Get Repository',
      description: 'Get detailed information about a specific repository',
      requiresAuth: true,
      enabled: isConfigured || false
    },
    {
      name: 'github_list_files',
      label: 'List Repository Files',
      description: 'List files and directories in a repository',
      requiresAuth: true,
      enabled: isConfigured || false
    },
    {
      name: 'github_get_file',
      label: 'Get File Content',
      description: 'Get the content of a specific file from a repository',
      requiresAuth: true,
      enabled: isConfigured || false
    },
    {
      name: 'github_search_repos',
      label: 'Search Repositories',
      description: 'Search for repositories based on criteria',
      requiresAuth: true,
      enabled: isConfigured || false
    },
    {
      name: 'github_get_issues',
      label: 'Get Issues',
      description: 'Get issues from a repository',
      requiresAuth: true,
      enabled: isConfigured || false
    }
  ];
};

// GitHub API client
export class GitHubApiClient {
  private patToken: string;

  constructor(patToken: string) {
    this.patToken = patToken;
  }

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
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

  async listRepos(): Promise<any[]> {
    const response = await this.makeRequest('/user/repos');
    return response.json();
  }

  async getRepo(owner: string, repo: string): Promise<any> {
    const response = await this.makeRequest(`/repos/${owner}/${repo}`);
    return response.json();
  }

  async listFiles(owner: string, repo: string, path: string = ''): Promise<any[]> {
    const url = path ? `/repos/${owner}/${repo}/contents/${path}` : `/repos/${owner}/${repo}/contents`;
    const response = await this.makeRequest(url);
    return response.json();
  }

  async getFile(owner: string, repo: string, path: string): Promise<any> {
    const response = await this.makeRequest(`/repos/${owner}/${repo}/contents/${path}`);
    return response.json();
  }

  async searchRepos(query: string, sort = 'updated', order = 'desc'): Promise<any> {
    const response = await this.makeRequest(`/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=${order}`);
    return response.json();
  }

  async getIssues(owner: string, repo: string, state = 'open'): Promise<any[]> {
    const response = await this.makeRequest(`/repos/${owner}/${repo}/issues?state=${state}`);
    return response.json();
  }
}

// Get GitHub client if configured
export const getGitHubClient = (settings: AppSettings): GitHubApiClient | null => {
  const patToken = settings.integrations?.github?.patToken;
  if (!patToken) return null;
  
  return new GitHubApiClient(patToken);
};
