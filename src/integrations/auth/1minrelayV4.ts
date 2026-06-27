import { AuthHandler, AuthConfig } from './index';
import { isTauri } from '../../utils/tauri';
import { openUrl } from '@tauri-apps/plugin-opener';

const RELAY_BASE = 'https://v4.kokodev.cc';
// Register this OAuth app in the v4.kokodev.cc dashboard → Developer.
// Set redirect URI to: https://lumina-chat-rho.vercel.app/api/1minrelay-callback
const CLIENT_ID = import.meta.env.VITE_1MINRELAY_V4_CLIENT_ID ?? '';
const REDIRECT_URI = 'https://lumina-chat-rho.vercel.app/api/1minrelay-callback';

function randomState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function exchangeCode(code: string, state: string): Promise<{ access_token: string; expires_in: number }> {
  // Token exchange goes through the Vercel proxy so client_secret stays server-side.
  const res = await fetch('https://lumina-chat-rho.vercel.app/api/1minrelay-oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state, redirect_uri: REDIRECT_URI }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Token exchange failed: ${res.status}`);
  return JSON.parse(text);
}

async function fetchRelayKey(accessToken: string): Promise<string> {
  const res = await fetch(`${RELAY_BASE}/oauth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch relay key: ${res.status}`);
  const data = await res.json();
  if (!data.relay_key) throw new Error('No relay_key in /oauth/me response');
  return data.relay_key;
}

export const minrelayV4AuthHandler: AuthHandler = {
  id: '1minrelay-v4',
  name: '1minRelay v4',
  description: 'Sign in with your 1minRelay v4 account to get your relay key automatically.',

  async startAuth(): Promise<{ url: string; verifier: string }> {
    if (!CLIENT_ID) throw new Error('1minRelay v4 OAuth app not configured (VITE_1MINRELAY_V4_CLIENT_ID missing)');
    const state = randomState();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'relay_key',
      state,
    });
    const authUrl = `${RELAY_BASE}/oauth/authorize?${params.toString()}`;
    if (isTauri) {
      try { await openUrl(authUrl); } catch (e) { console.error('[1MINRELAY-V4-OAUTH] Failed to open browser:', e); }
    } else {
      window.open(authUrl, '_blank');
    }
    return { url: authUrl, verifier: state };
  },

  async completeAuth(code: string, state: string): Promise<AuthConfig> {
    const token = await exchangeCode(code.trim(), state);
    const relayKey = await fetchRelayKey(token.access_token);
    const config: AuthConfig = {
      type: 'oauth',
      credentials: {
        apiKey: relayKey,
        access_token: token.access_token,
      },
      expiresAt: Math.floor(Date.now() / 1000) + (token.expires_in ?? 2592000),
    };
    this.saveAuthConfig(config);
    return config;
  },

  async configure(): Promise<AuthConfig> {
    const { verifier } = await this.startAuth!();
    const code = prompt(
      'After signing in, paste the authorization code here.\n\n' +
      'The code appears after "?code=" in the redirect URL.'
    );
    if (!code) throw new Error('Authorization cancelled');
    return this.completeAuth!(code, verifier);
  },

  async getApiKey(config: AuthConfig): Promise<string> {
    if (!config.credentials.apiKey) throw new Error('No relay key stored');
    return config.credentials.apiKey;
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
