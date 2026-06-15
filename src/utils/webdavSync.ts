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

function fileUrl(cfg: WebDAVConfig): string {
  const base = cfg.url.replace(/\/$/, '');
  const path = cfg.path ? '/' + cfg.path.replace(/^\/|\/$/g, '') : '';
  return `${base}${path}/lumina-backup.json`;
}

function basicAuth(cfg: WebDAVConfig): string {
  return 'Basic ' + btoa(`${cfg.username}:${cfg.password}`);
}

export async function webdavPut(cfg: WebDAVConfig, data: object): Promise<void> {
  const body = JSON.stringify(data);
  const url = fileUrl(cfg);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.username) headers['Authorization'] = basicAuth(cfg);

  let res: Response;
  if (isTauri) {
    res = await universalFetch(url, { method: 'PUT', headers, body });
  } else {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, method: 'PUT', headers, body }),
    });
  }
  if (!res.ok) throw new Error(`WebDAV PUT failed: ${res.status} ${await res.text()}`);
}

export async function webdavGet(cfg: WebDAVConfig): Promise<object> {
  const url = fileUrl(cfg);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.username) headers['Authorization'] = basicAuth(cfg);

  let res: Response;
  if (isTauri) {
    res = await universalFetch(url, { method: 'GET', headers });
  } else {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, method: 'GET', headers }),
    });
  }
  if (!res.ok) throw new Error(`WebDAV GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}
