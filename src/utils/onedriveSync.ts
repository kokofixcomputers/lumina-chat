// OneDrive sync via Microsoft Graph API.
//
// Auth (device code flow) is proxied through Vercel so CLIENT_ID and
// CLIENT_SECRET never ship to the frontend or the Tauri binary.
//
// Token proxy:  /api/onedrive-token  (web)
//               $VITE_APP_URL/api/onedrive-token  (Tauri — set in .env)
//
// Graph API calls go directly to graph.microsoft.com (it supports CORS).
// On Tauri, Graph calls use the native HTTP plugin via universalFetch.

import { isTauri } from './tauri';
import { universalFetch } from './tauriFetch';

// ── Proxy URL ─────────────────────────────────────────────────────────────────
// On web: relative path works because we're on the same Vercel deployment.
// On Tauri: needs the absolute Vercel URL — set VITE_APP_URL in .env.
const APP_BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_PROXY = `${APP_BASE}/api/onedrive-token`;

const GRAPH = 'https://graph.microsoft.com/v1.0';
const FOLDER = 'Lumina';
const TOKEN_KEY = 'lumina_onedrive_auth';

// ── Token storage ─────────────────────────────────────────────────────────────

export interface OneDriveToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export function getStoredToken(): OneDriveToken | null {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch { return null; }
}

function saveToken(t: OneDriveToken | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  else   localStorage.removeItem(TOKEN_KEY);
}

export function isOneDriveConnected(): boolean {
  return !!getStoredToken();
}

export function disconnectOneDrive(): void {
  saveToken(null);
}

// ── Auth proxy calls ──────────────────────────────────────────────────────────

async function proxyPost(body: Record<string, string>): Promise<Response> {
  // Both web and Tauri can POST to the Vercel function over HTTPS.
  // We use universalFetch so Tauri's native HTTP plugin handles it.
  if (isTauri) {
    return universalFetch(TOKEN_PROXY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return fetch(TOKEN_PROXY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Device Code flow ──────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const res = await proxyPost({ action: 'devicecode' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Device code request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Poll once. Returns saved token on success, null if still pending.
 * Throws on real errors (expired, declined, server error).
 */
export async function pollDeviceToken(deviceCode: string): Promise<OneDriveToken | null> {
  const res = await proxyPost({ action: 'poll', device_code: deviceCode });
  const data = await res.json();

  // 202 = authorization_pending or slow_down → keep waiting
  if (res.status === 202) return null;

  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `Token poll failed (${res.status})`);
  }

  const token: OneDriveToken = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000,
  };
  saveToken(token);
  return token;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<string> {
  const stored = getStoredToken();
  if (!stored) throw new Error('Not authenticated with OneDrive');

  const res = await proxyPost({ action: 'refresh', refresh_token: stored.refreshToken });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Refresh token revoked / expired — force re-auth
    saveToken(null);
    throw new Error(err.error ?? `Token refresh failed (${res.status})`);
  }
  const data = await res.json();
  const token: OneDriveToken = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? stored.refreshToken,
    expiresAt:    Date.now() + data.expires_in * 1000,
  };
  saveToken(token);
  return token.accessToken;
}

/** Returns a valid access token, refreshing silently if needed. */
async function getAccessToken(): Promise<string> {
  const stored = getStoredToken();
  if (!stored) throw new Error('Not authenticated with OneDrive');
  // Refresh 5 min before expiry
  if (Date.now() > stored.expiresAt - 5 * 60 * 1000) return refreshAccessToken();
  return stored.accessToken;
}

// ── Graph API helpers ─────────────────────────────────────────────────────────

async function graphFetch(path: string, method: string, body?: string): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (isTauri) return universalFetch(`${GRAPH}${path}`, { method, headers, body });
  // Microsoft Graph supports CORS — call directly from browser
  return fetch(`${GRAPH}${path}`, { method, headers, body });
}

// ── File paths ────────────────────────────────────────────────────────────────
// OneDrive creates intermediate folders automatically on first PUT.

const mainPath      = () => `/me/drive/root:/${FOLDER}/lumina-backup.json:/content`;
const imagePath     = (id: string) => `/me/drive/root:/${FOLDER}/lumina-images/${id}.json:/content`;
const imageDirPath  = () => `/me/drive/root:/${FOLDER}/lumina-images:/children?$select=name&$top=1000`;

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
