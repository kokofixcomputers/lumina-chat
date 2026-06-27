import { AuthHandler, AuthConfig } from './index';

const RELAY_BASE = 'https://v4.kokodev.cc';
export const MINRELAY_V4_OAUTH_STORAGE_KEY = 'lumina_1minrelay_v4_oauth_result';

function randomState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function waitForCallback(expectedState: string, timeoutMs = 120_000): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Authorization timed out. Please try again.'));
    }, timeoutMs);

    function onStorage(e: StorageEvent) {
      if (e.key !== MINRELAY_V4_OAUTH_STORAGE_KEY || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue);
        if (data.state !== expectedState) return;
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve({ code: data.code });
      } catch { /* ignore */ }
    }

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('storage', onStorage);
      try { localStorage.removeItem(MINRELAY_V4_OAUTH_STORAGE_KEY); } catch { /* ignore */ }
    }

    window.addEventListener('storage', onStorage);
  });
}

async function exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(`${window.location.origin}/api/1minrelay-oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
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

  async configure(): Promise<AuthConfig> {
    const state = randomState();
    const redirectUri = `${window.location.origin}/oauth/1minrelay/callback`;

    const clientId = (import.meta.env.VITE_1MINRELAY_V4_CLIENT_ID as string) ?? '';
    if (!clientId) throw new Error('1minRelay v4 OAuth app not configured (VITE_1MINRELAY_V4_CLIENT_ID missing)');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'relay_key',
      state,
    });

    const authUrl = `${RELAY_BASE}/oauth/authorize?${params.toString()}`;
    const popup = window.open(authUrl, 'minrelay_v4_oauth', 'width=520,height=640');
    if (!popup) throw new Error('Popup blocked — please allow popups for this site.');

    const { code } = await waitForCallback(state);

    const token = await exchangeCode(code, redirectUri);
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
