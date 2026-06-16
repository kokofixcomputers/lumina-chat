import { AuthHandler, AuthConfig } from './index';
import { isTauri } from '../../utils/tauri';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTH_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPES = 'org:create_api_key user:profile user:inference';

function generatePKCE(): { verifier: string; challenge: string } {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(verifier)).then(buf => {
    const challenge = btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return { verifier, challenge };
  }) as any;
}

async function generatePKCEAsync(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { verifier, challenge };
}

async function exchangeCode(code: string, verifier: string): Promise<AuthConfig> {
  const codeParts = code.split('#');
  const authCode = codeParts[0];
  const state = codeParts[1] || null;

  const payload: Record<string, string> = {
    code: authCode,
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  };
  if (state) payload.state = state;

  const text = await invoke<string>('anthropic_oauth_token', { body: JSON.stringify(payload) });
  const data = JSON.parse(text);
  return {
    type: 'oauth',
    credentials: {
      apiKey: data.access_token,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    },
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

async function refreshAccessToken(config: AuthConfig): Promise<AuthConfig> {
  const text = await invoke<string>('anthropic_oauth_token', {
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: config.credentials.refresh_token,
      client_id: CLIENT_ID,
    }),
  });
  const data = JSON.parse(text);
  return {
    ...config,
    credentials: {
      apiKey: data.access_token,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    },
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

export const anthropicSubscriptionAuthHandler: AuthHandler = {
  id: 'anthropic-subscription',
  name: 'Anthropic Subscription',
  description: 'Sign in with your Claude.ai subscription',

  async startAuth(): Promise<{ url: string; verifier: string }> {
    const pkce = await generatePKCEAsync();
    const params = new URLSearchParams({
      code: 'true',
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state: pkce.verifier,
    });
    const authUrl = `${AUTH_URL}?${params.toString()}`;
    if (isTauri) {
      try { await openUrl(authUrl); } catch (e) { console.error('[ANTHROPIC-OAUTH] Failed to open browser:', e); }
    } else {
      window.open(authUrl, '_blank');
    }
    return { url: authUrl, verifier: pkce.verifier };
  },

  async completeAuth(code: string, verifier: string): Promise<AuthConfig> {
    const config = await exchangeCode(code.trim(), verifier);
    this.saveAuthConfig(config);
    return config;
  },

  async configure(): Promise<AuthConfig> {
    const { verifier } = await this.startAuth!();
    const code = prompt(
      'After authorizing in the browser, paste the authorization code here.\n\n' +
      'The code appears after "?code=" in the redirect URL, or is shown directly on the page.'
    );
    if (!code) throw new Error('Authorization cancelled');
    return this.completeAuth!(code, verifier);
  },

  async getApiKey(config: AuthConfig): Promise<string> {
    let current = config;
    const now = Math.floor(Date.now() / 1000);

    if ((current.expiresAt ?? 0) <= now + 300) {
      try {
        current = await refreshAccessToken(current);
        this.saveAuthConfig(current);
      } catch (e) {
        console.warn('[ANTHROPIC-OAUTH] Refresh failed, using existing token');
      }
    }

    if (!current.credentials.access_token) throw new Error('No access token');
    return current.credentials.access_token;
  },

  async refreshToken(config: AuthConfig): Promise<AuthConfig> {
    const refreshed = await refreshAccessToken(config);
    this.saveAuthConfig(refreshed);
    return refreshed;
  },

  getAuthConfig(): AuthConfig | null {
    try {
      const stored = localStorage.getItem(`lumina_auth_${this.id}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  saveAuthConfig(config: AuthConfig): void {
    localStorage.setItem(`lumina_auth_${this.id}`, JSON.stringify(config));
  },
};
