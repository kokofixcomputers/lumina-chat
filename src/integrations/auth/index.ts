export interface AuthHandler {
  id: string;
  name: string;
  description: string;
  configure(): Promise<AuthConfig>;
  startAuth?(): Promise<{ url: string; verifier: string }>;
  completeAuth?(code: string, verifier: string): Promise<AuthConfig>;
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
import { anthropicSubscriptionAuthHandler } from './anthropicSubscription';

export const authHandlers: AuthHandlers = {
  pollinations: pollinationsAuthHandler,
  'anthropic-subscription': anthropicSubscriptionAuthHandler,
};

export function getAuthHandler(id: string): AuthHandler | undefined {
  return authHandlers[id];
}

export function getAllAuthHandlers(): AuthHandlers {
  return authHandlers;
}
