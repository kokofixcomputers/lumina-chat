// GitHub OAuth App sign-in — deep link (Tauri) or popup+storage bounce (web).
//
// Result is written into settings.integrations.github using the exact same
// shape the existing manual-PAT flow uses ({ configured, patToken, username }),
// since an OAuth App user access token authenticates against the GitHub REST
// API identically to a PAT (`Authorization: token <token>`).
//
// Requires a GitHub OAuth App (https://github.com/settings/developers) with:
//   - Authorization callback URL: lumina://oauth/github  (for the desktop app)
//   - Authorization callback URL: <your web origin>/oauth/github/callback (for web)
// and these env vars:
//   VITE_GITHUB_OAUTH_CLIENT_ID       (frontend, not secret)
//   GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET (Vercel, server-side only)

import { isTauri } from '../utils/tauri';
import { universalFetch } from '../utils/tauriFetch';

export const GITHUB_OAUTH_STORAGE_KEY = 'lumina_github_oauth_result';

export interface GitHubOAuthResult {
  token: string;
  username: string;
}

// When both are set (Tauri desktop builds), exchange the code with GitHub directly —
// no Vercel proxy needed. Leave unset for web builds; the secret then lives only in
// Vercel's server-side env vars (see api/github-oauth.ts).
const BAKED_CLIENT_ID = (import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID as string | undefined) ?? '';
const BAKED_CLIENT_SECRET = (import.meta.env.VITE_GITHUB_OAUTH_CLIENT_SECRET as string | undefined) ?? '';
const USE_DIRECT = isTauri && !!(BAKED_CLIENT_ID && BAKED_CLIENT_SECRET);

function randomState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function getClientId(): string {
  if (!BAKED_CLIENT_ID) throw new Error('GitHub OAuth app not configured (VITE_GITHUB_OAUTH_CLIENT_ID missing)');
  return BAKED_CLIENT_ID;
}

async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  if (USE_DIRECT) {
    // Tauri's HTTP plugin is a native client, not the webview — it bypasses browser CORS,
    // so this direct call to GitHub works even though the token endpoint has no CORS headers.
    const res = await universalFetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: BAKED_CLIENT_ID,
        client_secret: BAKED_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || data.error || `Token exchange failed: ${res.status}`);
    if (!data.access_token) throw new Error('No access_token in response');
    return data.access_token as string;
  }

  const res = await fetch(`${window.location.origin}/api/github-oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Token exchange failed: ${res.status}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token as string;
}

async function fetchGitHubUser(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub user: ${res.status}`);
  const data = await res.json();
  return data.login as string;
}

// ── Web: popup + localStorage "storage" event bounce ──────────────────────

function waitForCallback(expectedState: string, timeoutMs = 120_000): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Authorization timed out. Please try again.'));
    }, timeoutMs);

    function onStorage(e: StorageEvent) {
      if (e.key !== GITHUB_OAUTH_STORAGE_KEY || !e.newValue) return;
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
      try { localStorage.removeItem(GITHUB_OAUTH_STORAGE_KEY); } catch { /* ignore */ }
    }

    window.addEventListener('storage', onStorage);
  });
}

async function authorizeWeb(): Promise<GitHubOAuthResult> {
  const state = randomState();
  const redirectUri = `${window.location.origin}/oauth/github/callback`;
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: redirectUri,
    scope: 'repo',
    state,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  const popup = window.open(authUrl, 'github_oauth', 'width=520,height=640');
  if (!popup) throw new Error('Popup blocked — please allow popups for this site.');

  const { code } = await waitForCallback(state);
  const token = await exchangeCode(code, redirectUri);
  const username = await fetchGitHubUser(token);
  return { token, username };
}

// ── Tauri: system browser + deep link ──────────────────────────────────────
// Uses a distinct path (lumina://oauth/github) from OneDrive's
// (lumina://oauth/callback) so the two onOpenUrl listeners don't collide.

const TAURI_REDIRECT_URI = 'lumina://oauth/github';

async function authorizeTauri(): Promise<GitHubOAuthResult> {
  const state = randomState();
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: TAURI_REDIRECT_URI,
    scope: 'repo',
    state,
  });
  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  const { openUrl } = await import('@tauri-apps/plugin-opener');
  const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

  const { code } = await new Promise<{ code: string }>((resolve, reject) => {
    let settled = false;
    let unlisten: (() => void) | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unlisten?.();
      fn();
    };

    onOpenUrl((urls: string[]) => {
      for (const raw of urls) {
        let url: URL;
        try { url = new URL(raw); } catch { continue; }
        if (url.protocol !== 'lumina:' || url.host !== 'oauth' || url.pathname !== '/github') continue;

        const returnedCode = url.searchParams.get('code') ?? undefined;
        const retState = url.searchParams.get('state') ?? undefined;
        const error = url.searchParams.get('error') ?? undefined;
        const errorDesc = url.searchParams.get('error_description') ?? undefined;

        if (error) { settle(() => reject(new Error(errorDesc ?? error))); return; }
        if (retState !== state) { settle(() => reject(new Error('OAuth state mismatch'))); return; }
        if (!returnedCode) { settle(() => reject(new Error('No code in deep link'))); return; }

        settle(() => resolve({ code: returnedCode }));
        return;
      }
    }).then(fn => { unlisten = fn; }).catch(reject);

    openUrl(authUrl).catch(reject);
  });

  const token = await exchangeCode(code, TAURI_REDIRECT_URI);
  const username = await fetchGitHubUser(token);
  return { token, username };
}

export async function authorizeGitHub(): Promise<GitHubOAuthResult> {
  return isTauri ? authorizeTauri() : authorizeWeb();
}
