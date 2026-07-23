import { AuthHandler, AuthConfig } from './index';
import { isTauri } from '../../utils/tauri';

// OAuth 2.0 Authorization Code + PKCE — Pollinations' documented flow for web/app integrations.
// (Previously this used the Device Authorization Grant, meant for devices without a good way
// to receive a redirect — clunkier UX and not what Pollinations recommends for apps like this.)

const CLIENT_ID = 'pk_kZfJKWyF3JDyqwY5';
export const POLLINATIONS_OAUTH_STORAGE_KEY = 'lumina_pollinations_oauth_result';

function randomState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function generateVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function deriveChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<{ access_token: string; expires_in?: number; scope?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const res = await fetch('https://enter.pollinations.ai/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Token exchange failed: ${res.status}`);
  return JSON.parse(text);
}

function toAuthConfig(token: { access_token: string; expires_in?: number }): AuthConfig {
  return {
    type: 'oauth',
    autoAuth: 'pollinations',
    credentials: { apiKey: token.access_token },
    expiresAt: token.expires_in ? Math.floor(Date.now() / 1000) + token.expires_in : undefined,
  };
}

// ── Web: popup + localStorage "storage" event bounce (same pattern as 1minRelay v4) ──────────

function waitForCallback(expectedState: string, timeoutMs = 120_000): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Authorization timed out. Please try again.'));
    }, timeoutMs);

    function onStorage(e: StorageEvent) {
      if (e.key !== POLLINATIONS_OAUTH_STORAGE_KEY || !e.newValue) return;
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
      try { localStorage.removeItem(POLLINATIONS_OAUTH_STORAGE_KEY); } catch { /* ignore */ }
    }

    window.addEventListener('storage', onStorage);
  });
}

async function authorizeWeb(): Promise<AuthConfig> {
  const state = randomState();
  const verifier = generateVerifier();
  const challenge = await deriveChallenge(verifier);
  const redirectUri = `${window.location.origin}/oauth/pollinations/callback`;

  // "Generation needs no scope" per Pollinations' docs — spending is bounded by the
  // budget/expiry the user approves on the consent screen, so we don't request one.
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `https://enter.pollinations.ai/authorize?${params.toString()}`;
  const popup = window.open(authUrl, 'pollinations_oauth', 'width=520,height=640');
  if (!popup) throw new Error('Popup blocked — please allow popups for this site.');

  const { code } = await waitForCallback(state);
  const token = await exchangeCode(code, redirectUri, verifier);
  return toAuthConfig(token);
}

// ── Tauri: loopback HTTP redirect, not a custom URI scheme ────────────────────────────────────
// Pollinations (like most OAuth providers) rejects redirect_uris that aren't https:// or,
// for a loopback host, http:// — a custom scheme like lumina://... doesn't qualify, since any
// app on the system could register the same scheme. Instead the Rust side (start_oauth_loopback
// in src-tauri/src/lib.rs) spins up a one-shot local HTTP server on a fixed port — 17540, or
// 5317 if that's already taken — and emits the redirect's path+query back once it arrives; if
// neither port is free it rejects rather than falling back to a random one. Both
// "http://localhost:17540/oauth/pollinations/callback" and
// "http://localhost:5317/oauth/pollinations/callback" need to be registered as redirect URIs
// on the app key.

async function authorizeTauri(): Promise<AuthConfig> {
  const state = randomState();
  const verifier = generateVerifier();
  const challenge = await deriveChallenge(verifier);

  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const { openUrl } = await import('@tauri-apps/plugin-opener');

  const eventName = `oauth-loopback-pollinations-${state}`;
  const port = await invoke<number>('start_oauth_loopback', { eventName });
  const redirectUri = `http://localhost:${port}/oauth/pollinations/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const authUrl = `https://enter.pollinations.ai/authorize?${params.toString()}`;

  const { code } = await new Promise<{ code: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      unlisten?.();
      reject(new Error('Authorization timed out. Please try again.'));
    }, 120_000);
    let unlisten: (() => void) | undefined;

    listen<string>(eventName, (event) => {
      clearTimeout(timer);
      unlisten?.();
      try {
        const url = new URL(event.payload, `http://localhost:${port}`);
        const returnedCode = url.searchParams.get('code');
        const retState = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDesc = url.searchParams.get('error_description');

        if (error) { reject(new Error(errorDesc ?? error)); return; }
        if (retState !== state) { reject(new Error('OAuth state mismatch')); return; }
        if (!returnedCode) { reject(new Error('No code received')); return; }
        resolve({ code: returnedCode });
      } catch (e: any) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }).then(fn => { unlisten = fn; }).catch(reject);

    openUrl(authUrl).catch(reject);
  });

  const token = await exchangeCode(code, redirectUri, verifier);
  return toAuthConfig(token);
}

export const pollinationsAuthHandler: AuthHandler = {
  id: 'pollinations',
  name: 'Pollinations.ai',
  description: 'AI image generation with various models',

  async configure(): Promise<AuthConfig> {
    const existingConfig = this.getAuthConfig();
    if (existingConfig && existingConfig.type === 'oauth') {
      return existingConfig;
    }

    const config = isTauri ? await authorizeTauri() : await authorizeWeb();
    this.saveAuthConfig(config);
    return config;
  },

  async getApiKey(config: AuthConfig): Promise<string> {
    if (config.type === 'oauth' && config.credentials.apiKey) {
      return config.credentials.apiKey;
    }
    throw new Error('No API key available');
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
  }
};
