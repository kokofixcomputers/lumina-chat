// WebDAV PUT/GET.
// On Tauri: direct fetch via the HTTP plugin (no CORS restrictions).
// On web:   route through /api/proxy to bypass browser CORS.

import { isTauri } from './tauri';
import { universalFetch } from './tauriFetch';

const PROXY_URL = '/api/proxy';

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
}

function basePath(cfg: WebDAVConfig): string {
  const base = cfg.url.replace(/\/$/, '');
  const path = cfg.path ? '/' + cfg.path.replace(/^\/|\/$/g, '') : '';
  return `${base}${path}`;
}

function basicAuth(cfg: WebDAVConfig): string {
  return 'Basic ' + btoa(`${cfg.username}:${cfg.password}`);
}

function authHeaders(cfg: WebDAVConfig, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (cfg.username) h['Authorization'] = basicAuth(cfg);
  return h;
}

async function davFetch(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
  if (isTauri) {
    return universalFetch(url, { method, headers, body });
  }
  return fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, method, headers, body }),
  });
}

// ── Main file ────────────────────────────────────────────────────────────────

export async function webdavPut(cfg: WebDAVConfig, data: object): Promise<void> {
  const url = `${basePath(cfg)}/lumina-backup.json`;
  const body = JSON.stringify(data);
  const res = await davFetch(url, 'PUT', authHeaders(cfg, { 'content-type': 'application/json' }), body);
  if (!res.ok) throw new Error(`WebDAV PUT failed: ${res.status} ${await res.text()}`);
}

export async function webdavGet(cfg: WebDAVConfig): Promise<object> {
  const url = `${basePath(cfg)}/lumina-backup.json`;
  const res = await davFetch(url, 'GET', authHeaders(cfg));
  if (!res.ok) throw new Error(`WebDAV GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Image files ──────────────────────────────────────────────────────────────

/** Ensure the lumina-images/ collection exists (MKCOL is idempotent on 405). */
async function ensureImageDir(cfg: WebDAVConfig): Promise<void> {
  const url = `${basePath(cfg)}/lumina-images`;
  const res = await davFetch(url, 'MKCOL', authHeaders(cfg));
  // 201 = created, 405 = already exists — both are fine
  if (!res.ok && res.status !== 405) {
    throw new Error(`WebDAV MKCOL failed: ${res.status} ${await res.text()}`);
  }
}

export async function webdavPutImage(cfg: WebDAVConfig, id: string, data: object): Promise<void> {
  await ensureImageDir(cfg);
  const url = `${basePath(cfg)}/lumina-images/${id}.json`;
  const body = JSON.stringify(data);
  const res = await davFetch(url, 'PUT', authHeaders(cfg, { 'content-type': 'application/json' }), body);
  if (!res.ok) throw new Error(`WebDAV PUT image failed: ${res.status} ${await res.text()}`);
}

export async function webdavGetImage(cfg: WebDAVConfig, id: string): Promise<object> {
  const url = `${basePath(cfg)}/lumina-images/${id}.json`;
  const res = await davFetch(url, 'GET', authHeaders(cfg));
  if (!res.ok) throw new Error(`WebDAV GET image failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Returns image IDs currently stored in lumina-images/ via PROPFIND depth:1. */
export async function webdavListImageIds(cfg: WebDAVConfig): Promise<string[]> {
  const url = `${basePath(cfg)}/lumina-images`;
  const res = await davFetch(url, 'PROPFIND', authHeaders(cfg, { 'Depth': '1', 'content-type': 'application/xml' }));
  if (!res.ok) {
    // 404 = directory doesn't exist yet → no images
    if (res.status === 404) return [];
    throw new Error(`WebDAV PROPFIND failed: ${res.status} ${await res.text()}`);
  }
  const xml = await res.text();
  // Parse <D:href> or <href> values and extract .json filenames
  const hrefs = [...xml.matchAll(/<[^:>]*:?href>([^<]+)<\//gi)].map(m => m[1].trim());
  return hrefs
    .filter(h => h.endsWith('.json') && !h.endsWith('/'))
    .map(h => {
      const name = h.split('/').pop()!;
      return name.slice(0, -5); // strip .json
    });
}
