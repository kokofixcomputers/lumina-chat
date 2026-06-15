// OneDrive sync via Microsoft Graph API — Auth Code + PKCE flow.
//
// Web:   token exchange goes through /api/onedrive-token (Vercel keeps the secret).
// Tauri: if VITE_ONEDRIVE_CLIENT_ID + VITE_ONEDRIVE_CLIENT_SECRET are baked in,
//        calls Microsoft directly — no Vercel proxy needed.
//        Uses WebviewWindow instead of window.open() (popups blocked in Tauri).

import { isTauri } from './tauri';
import { universalFetch } from './tauriFetch';

const GRAPH   = 'https://graph.microsoft.com/v1.0';
const MS_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPE   = 'Files.ReadWrite offline_access User.Read';
const FOLDER  = 'Lumina';
const TOKEN_KEY   = 'lumina_onedrive_auth';
const VERIFIER_KEY = 'lumina_onedrive_pkce_verifier'; // sessionStorage

// ── Credential strategy ───────────────────────────────────────────────────────
const BAKED_CLIENT_ID     = (import.meta.env.VITE_ONEDRIVE_CLIENT_ID     as string | undefined) ?? '';
const BAKED_CLIENT_SECRET = (import.meta.env.VITE_ONEDRIVE_CLIENT_SECRET as string | undefined) ?? '';
const USE_DIRECT = !!(BAKED_CLIENT_ID && BAKED_CLIENT_SECRET);

const APP_BASE    = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_PROXY = `${APP_BASE}/api/onedrive-token`;

// ── Token storage ─────────────────────────────────────────────────────────────

export interface OneDriveToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function getStoredToken(): OneDriveToken | null {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch { return null; }
}
function saveToken(t: OneDriveToken | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  else   localStorage.removeItem(TOKEN_KEY);
}
export function isOneDriveConnected(): boolean { return !!getStoredToken(); }
export function disconnectOneDrive(): void { saveToken(null); }

// ── PKCE helpers ──────────────────────────────────────────────────────────────

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

// ── Redirect URI ──────────────────────────────────────────────────────────────
// Derived at runtime so it works for both web (https://...) and Tauri (tauri://localhost).

function getRedirectUri(): string {
  return `${window.location.origin}/oauth/onedrive/callback`;
}

// ── Auth proxy / direct helpers ───────────────────────────────────────────────

async function proxyPost(body: Record<string, string>): Promise<Response> {
  const opts = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
  if (isTauri) return universalFetch(TOKEN_PROXY, opts);
  return fetch(TOKEN_PROXY, opts);
}

async function msFormPost(url: string, params: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams(params).toString();
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (isTauri) return universalFetch(url, { method: 'POST', headers, body });
  return fetch(url, { method: 'POST', headers, body });
}

// ── Tauri OAuth via external browser + deep link ──────────────────────────────
// Tauri webviews block window.open(). Instead:
//   1. Open the Microsoft auth URL in the system browser via opener.
//   2. Microsoft redirects to lumina://oauth/callback?code=...
//   3. The OS triggers the deep link; the app receives it via onOpenUrl.
//   4. We extract the code, exchange it, and resolve.

const TAURI_REDIRECT_URI = 'lumina://oauth/callback';

async function openOAuthDeepLinkTauri(
  authUrl: string,
  expectedState: string,
  verifier: string,
): Promise<OneDriveToken> {
  const { openUrl }  = await import('@tauri-apps/plugin-opener');
  const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

  return new Promise((resolve, reject) => {
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
        if (url.protocol !== 'lumina:' || url.pathname !== '/oauth/callback') continue;

        const code     = url.searchParams.get('code') ?? undefined;
        const retState = url.searchParams.get('state') ?? undefined;
        const error    = url.searchParams.get('error') ?? undefined;
        const errorDesc = url.searchParams.get('error_description') ?? undefined;

        if (error) { settle(() => reject(new Error(errorDesc ?? error))); return; }
        if (retState !== expectedState) { settle(() => reject(new Error('OAuth state mismatch'))); return; }
        if (!code) { settle(() => reject(new Error('No code in deep link'))); return; }

        exchangeCode(code, TAURI_REDIRECT_URI, verifier)
          .then(token => settle(() => resolve(token)))
          .catch(e    => settle(() => reject(e)));
        return;
      }
    }).then(fn => { unlisten = fn; }).catch(reject);

    // Open auth URL in the system browser
    openUrl(authUrl).catch(reject);
  });
}

// ── OAuth: start flow ─────────────────────────────────────────────────────────

/**
 * Opens the Microsoft sign-in popup and returns a Promise that resolves with
 * the saved OneDriveToken once the user completes the flow.
 */
export async function startOAuthFlow(): Promise<OneDriveToken> {
  const verifier    = generateVerifier();
  const challenge   = await deriveChallenge(verifier);
  const state       = generateVerifier().slice(0, 16);
  const redirectUri = isTauri ? TAURI_REDIRECT_URI : getRedirectUri();

  // Persist verifier so the callback can retrieve it after the redirect
  sessionStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state }));

  const clientId = USE_DIRECT ? BAKED_CLIENT_ID : (
    // For web, we still need the client ID to build the auth URL.
    // Fetch it from the Vercel function.
    await proxyPost({ action: 'client_id' })
      .then(r => r.json())
      .then(d => d.client_id as string)
  );

  const authUrl = new URL(`${MS_AUTH}/authorize`);
  authUrl.searchParams.set('client_id',             clientId);
  authUrl.searchParams.set('response_type',         'code');
  authUrl.searchParams.set('redirect_uri',          redirectUri);
  authUrl.searchParams.set('scope',                 SCOPE);
  authUrl.searchParams.set('code_challenge',        challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state',                 state);
  authUrl.searchParams.set('response_mode',         'query');

  if (isTauri) {
    return openOAuthDeepLinkTauri(authUrl.toString(), state, verifier);
  }

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl.toString(), 'onedrive_oauth', 'width=520,height=680,left=200,top=100');
    if (!popup) { reject(new Error('Popup blocked — please allow popups for this site.')); return; }

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'onedrive_oauth') return;
      clearInterval(check);
      window.removeEventListener('message', onMessage);

      const { code, state: retState, error, errorDesc } = event.data;
      if (error) { reject(new Error(errorDesc ?? error)); return; }
      if (retState !== state) { reject(new Error('OAuth state mismatch')); return; }
      if (!code) { reject(new Error('No code returned')); return; }

      try {
        const token = await exchangeCode(code, redirectUri, verifier);
        resolve(token);
      } catch (e) {
        reject(e);
      }
    };

    window.addEventListener('message', onMessage);

    // Detect if the user closed the popup without completing the flow
    const check = setInterval(() => {
      if (popup.closed) {
        clearInterval(check);
        window.removeEventListener('message', onMessage);
        reject(new Error('Sign-in window was closed'));
      }
    }, 500);
  });
}

// ── OAuth: exchange code for token ────────────────────────────────────────────

async function exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<OneDriveToken> {
  let data: Record<string, unknown>;

  if (USE_DIRECT) {
    const res = await msFormPost(`${MS_AUTH}/token`, {
      client_id:     BAKED_CLIENT_ID,
      client_secret: BAKED_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
      scope:         SCOPE,
    });
    data = await res.json();
    if (!res.ok) throw new Error((data.error_description ?? data.error ?? `Exchange failed (${res.status})`) as string);
  } else {
    const res = await proxyPost({ action: 'exchange', code, redirect_uri: redirectUri, code_verifier: codeVerifier });
    data = await res.json();
    if (!res.ok) throw new Error((data.error ?? `Exchange failed (${res.status})`) as string);
  }

  const token: OneDriveToken = {
    accessToken:  data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt:    Date.now() + (data.expires_in as number) * 1000,
  };
  saveToken(token);
  return token;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<string> {
  const stored = getStoredToken();
  if (!stored) throw new Error('Not authenticated with OneDrive');

  let data: Record<string, unknown>;

  if (USE_DIRECT) {
    const res = await msFormPost(`${MS_AUTH}/token`, {
      client_id:     BAKED_CLIENT_ID,
      client_secret: BAKED_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: stored.refreshToken,
      scope:         SCOPE,
    });
    data = await res.json();
    if (!res.ok) { saveToken(null); throw new Error((data.error_description ?? data.error ?? `Refresh failed (${res.status})`) as string); }
  } else {
    const res = await proxyPost({ action: 'refresh', refresh_token: stored.refreshToken });
    data = await res.json();
    if (!res.ok) { saveToken(null); throw new Error((data.error ?? `Refresh failed (${res.status})`) as string); }
  }

  const token: OneDriveToken = {
    accessToken:  data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? stored.refreshToken,
    expiresAt:    Date.now() + (data.expires_in as number) * 1000,
  };
  saveToken(token);
  return token.accessToken;
}

async function getAccessToken(): Promise<string> {
  const stored = getStoredToken();
  if (!stored) throw new Error('Not authenticated with OneDrive');
  if (Date.now() > stored.expiresAt - 5 * 60 * 1000) return refreshAccessToken();
  return stored.accessToken;
}

// ── Graph API helpers ─────────────────────────────────────────────────────────

async function graphFetch(path: string, method: string, body?: string): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isTauri) return universalFetch(`${GRAPH}${path}`, { method, headers, body });
  return fetch(`${GRAPH}${path}`, { method, headers, body });
}

// ── File paths ────────────────────────────────────────────────────────────────

const mainPath     = () => `/me/drive/root:/${FOLDER}/lumina-backup.json:/content`;
const imagePath    = (id: string) => `/me/drive/root:/${FOLDER}/lumina-images/${id}.json:/content`;
const imageDirPath = () => `/me/drive/root:/${FOLDER}/lumina-images:/children?$select=name&$top=1000`;

// ── Public file API ───────────────────────────────────────────────────────────

export async function onedrivePutMain(data: object): Promise<void> {
  const res = await graphFetch(mainPath(), 'PUT', JSON.stringify(data));
  if (!res.ok) throw new Error(`OneDrive PUT failed: ${res.status} ${await res.text()}`);
}

export async function onedriveGetMain(): Promise<object> {
  const res = await graphFetch(mainPath(), 'GET');
  if (!res.ok) throw new Error(`OneDrive GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function onedrivePutImage(id: string, data: object): Promise<void> {
  const res = await graphFetch(imagePath(id), 'PUT', JSON.stringify(data));
  if (!res.ok) throw new Error(`OneDrive PUT image failed: ${res.status} ${await res.text()}`);
}

export async function onedriveGetImage(id: string): Promise<object> {
  const res = await graphFetch(imagePath(id), 'GET');
  if (!res.ok) throw new Error(`OneDrive GET image failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function onedriveListImageIds(): Promise<string[]> {
  const res = await graphFetch(imageDirPath(), 'GET');
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OneDrive list images failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.value as { name: string }[])
    .filter(f => f.name.endsWith('.json'))
    .map(f => f.name.slice(0, -5));
}

export async function getOneDriveUserInfo(): Promise<{ displayName: string; mail: string }> {
  const res = await graphFetch('/me?$select=displayName,mail', 'GET');
  if (!res.ok) throw new Error(`Graph /me failed: ${res.status}`);
  return res.json();
}
