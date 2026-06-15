// AWS SigV4 signing + S3 operations.
// On Tauri: direct fetch via the HTTP plugin (no CORS restrictions).
// On web:   route through /api/proxy to bypass browser CORS.

import { isTauri } from './tauri';
import { universalFetch } from './tauriFetch';

const PROXY_URL = '/api/proxy';

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

function strToBuffer(str: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(str);
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}
async function hmac(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, strToBuffer(msg));
}
async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', strToBuffer(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SigV4 ────────────────────────────────────────────────────────────────────

async function sigV4(
  cfg: S3Config,
  method: string,
  objectKey: string,
  body: string,
  extraQuery = '',      // pre-encoded query string e.g. "list-type=2&prefix=foo"
): Promise<{ headers: Record<string, string>; url: string }> {
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzdate   = datestamp + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';

  const endpoint = (cfg.endpoint || 'https://s3.amazonaws.com').replace(/\/$/, '');
  const region   = cfg.region || 'us-east-1';
  const host     = new URL(endpoint).host;

  const isPut = method === 'PUT';
  const pathSegments = `/${cfg.bucket}/${objectKey}`.split('/').map(s =>
    encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  );
  const canonicalUri = pathSegments.join('/');
  const url = `${endpoint}${canonicalUri}${extraQuery ? '?' + extraQuery : ''}`;

  const payloadHash = await sha256Hex(isPut ? body : '');

  const canonicalHeaders = isPut
    ? `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzdate}\n`
    : `host:${host}\nx-amz-date:${amzdate}\n`;
  const signedHeaders = isPut
    ? 'content-type;host;x-amz-content-sha256;x-amz-date'
    : 'host;x-amz-date';

  const canonicalRequest = [method, canonicalUri, extraQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credScope = `${datestamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzdate, credScope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate    = await hmac(strToBuffer(`AWS4${cfg.secretAccessKey}`), datestamp);
  const kRegion  = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bufToHex(await hmac(kSigning, stringToSign));

  const headers: Record<string, string> = {
    'Authorization': `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-date': amzdate,
    'x-amz-content-sha256': payloadHash,
  };
  if (isPut) headers['content-type'] = 'application/json';
  return { headers, url };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function s3Fetch(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
  if (isTauri) {
    return universalFetch(url, { method, headers, body });
  }
  return fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, method, headers, body }),
  });
}

// ── Key helpers ──────────────────────────────────────────────────────────────

function prefix(cfg: S3Config): string {
  return cfg.keyPrefix ? cfg.keyPrefix.replace(/\/$/, '') + '/' : '';
}
function mainKey(cfg: S3Config): string { return `${prefix(cfg)}lumina-backup.json`; }
function imageKey(cfg: S3Config, id: string): string { return `${prefix(cfg)}lumina-images/${id}.json`; }
function imagePrefix(cfg: S3Config): string { return `${prefix(cfg)}lumina-images/`; }

// ── Public API ───────────────────────────────────────────────────────────────

export async function s3PutMain(cfg: S3Config, data: object): Promise<void> {
  const body = JSON.stringify(data);
  const { headers, url } = await sigV4(cfg, 'PUT', mainKey(cfg), body);
  const res = await s3Fetch(url, 'PUT', headers, body);
  if (!res.ok) throw new Error(`S3 PUT failed: ${res.status} ${await res.text()}`);
}

export async function s3GetMain(cfg: S3Config): Promise<object> {
  const { headers, url } = await sigV4(cfg, 'GET', mainKey(cfg), '');
  const res = await s3Fetch(url, 'GET', headers);
  if (!res.ok) throw new Error(`S3 GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function s3PutImage(cfg: S3Config, id: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  const { headers, url } = await sigV4(cfg, 'PUT', imageKey(cfg, id), body);
  const res = await s3Fetch(url, 'PUT', headers, body);
  if (!res.ok) throw new Error(`S3 PUT image failed: ${res.status} ${await res.text()}`);
}

export async function s3GetImage(cfg: S3Config, id: string): Promise<object> {
  const { headers, url } = await sigV4(cfg, 'GET', imageKey(cfg, id), '');
  const res = await s3Fetch(url, 'GET', headers);
  if (!res.ok) throw new Error(`S3 GET image failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Returns image IDs currently stored in the lumina-images/ prefix. */
export async function s3ListImageIds(cfg: S3Config): Promise<string[]> {
  const pfx = imagePrefix(cfg);
  // ListObjectsV2: query params must be sorted alphabetically
  const query = `list-type=2&prefix=${encodeURIComponent(pfx)}`;
  // ListObjectsV2 is a GET on the bucket root (no object key)
  const { headers, url } = await sigV4(cfg, 'GET', '', '', query);
  const res = await s3Fetch(url, 'GET', headers);
  if (!res.ok) throw new Error(`S3 ListObjects failed: ${res.status} ${await res.text()}`);
  const xml = await res.text();
  // Parse <Key> elements from the XML response
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
  return keys
    .filter(k => k.startsWith(pfx) && k.endsWith('.json'))
    .map(k => k.slice(pfx.length, -5)); // strip prefix and .json → bare id
}

// Legacy aliases so existing callers still work
export const s3Put = s3PutMain;
export const s3Get = s3GetMain;
