export interface AuthHandler {
  id: string;
  name: string;
  description: string;
  configure(): Promise<AuthConfig>;
  getApiKey(config: AuthConfig): Promise<string>;
  refreshToken?(config: AuthConfig): Promise<AuthConfig>;
  getAuthConfig(): AuthConfig | null;
  saveAuthConfig(config: AuthConfig): void;
}

export interface AuthConfig {
  type: 'oauth' | 'api_key' | 'custom';
  credentials: Record<string, any>;
  expiresAt?: number;
  apiKey?: string;
  autoAuth?: string;
}

export interface AuthHandlers {
  [key: string]: AuthHandler;
}

// Import and register all auth handlers
import { pollinationsAuthHandler } from './pollinations';

export const authHandlers: AuthHandlers = {
  pollinations: pollinationsAuthHandler,
};

export function getAuthHandler(id: string): AuthHandler | undefined {
  return authHandlers[id];
}

export function getAllAuthHandlers(): AuthHandlers {
  return authHandlers;
}
