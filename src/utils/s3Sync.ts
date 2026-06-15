// AWS SigV4 signing + S3 PUT/GET.
// On Tauri: direct fetch via the HTTP plugin (no CORS restrictions).
// On web:   route through /api/proxy to bypass browser CORS.

import { isTauri } from './tauri';
import { universalFetch } from './tauriFetch';

const PROXY_URL = '/api/proxy';

// Set to true temporarily to log canonical request + string-to-sign to console
const S3_SIGV4_DEBUG = true;

function strToBuffer(str: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(str);
  // Copy into a fresh ArrayBuffer so byteOffset is always 0
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
  return bufToHex(buf);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
}

async function sigV4Sign(
  cfg: S3Config,
  method: 'GET' | 'PUT',
  key: string,
  body: string,
): Promise<{ headers: Record<string, string>; url: string }> {
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');       // YYYYMMDD
  const amzdate   = datestamp + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'; // YYYYMMDDTHHmmssZ

  const endpoint = (cfg.endpoint || 'https://s3.amazonaws.com').replace(/\/$/, '');
  const region = cfg.region || 'us-east-1';
  const parsed = new URL(endpoint);
  const host = parsed.host; // includes port if non-default

  const isPut = method === 'PUT';

  // Canonical URI: just percent-encode each segment (leave slashes and safe chars alone)
  const pathSegments = `/${cfg.bucket}/${key}`.split('/').map(s =>
    encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  );
  const canonicalUri = pathSegments.join('/');
  const url = `${endpoint}${canonicalUri}`;

  const payloadHash = await sha256Hex(isPut ? body : '');

  // For GET: sign host + x-amz-date only (x-amz-content-sha256 is extra/unsigned)
  // For PUT: sign content-type + host + x-amz-content-sha256 + x-amz-date
  let canonicalHeaders: string;
  let signedHeadersList: string[];

  if (isPut) {
    canonicalHeaders =
      `content-type:application/json\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzdate}\n`;
    signedHeadersList = ['content-type', 'host', 'x-amz-content-sha256', 'x-amz-date'];
  } else {
    canonicalHeaders =
      `host:${host}\n` +
      `x-amz-date:${amzdate}\n`;
    signedHeadersList = ['host', 'x-amz-date'];
  }

  const signedHeaders = signedHeadersList.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',               // empty query string
    canonicalHeaders, // already ends with \n
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credScope = `${datestamp}/${region}/s3/aws4_request`;
  const hashOfCanonical = await sha256Hex(canonicalRequest);
  const stringToSign = ['AWS4-HMAC-SHA256', amzdate, credScope, hashOfCanonical].join('\n');

  if (S3_SIGV4_DEBUG) {
    console.group('[S3 SigV4 Debug]');
    console.log('method:', method);
    console.log('url:', url);
    console.log('host:', host);
    console.log('amzdate:', amzdate);
    console.log('datestamp:', datestamp);
    console.log('canonicalUri:', canonicalUri);
    console.log('payloadHash:', payloadHash);
    console.log('canonicalRequest:\n' + canonicalRequest);
    console.log('stringToSign:\n' + stringToSign);
    console.groupEnd();
  }

  const kDate    = await hmac(strToBuffer(`AWS4${cfg.secretAccessKey}`), datestamp);
  const kRegion  = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bufToHex(await hmac(kSigning, stringToSign));

  const reqHeaders: Record<string, string> = {
    'Authorization': `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-date': amzdate,
    'x-amz-content-sha256': payloadHash, // send always, signed on PUT only
  };
  if (isPut) reqHeaders['content-type'] = 'application/json';

  return { headers: reqHeaders, url };
}

function objectKey(cfg: S3Config): string {
  const prefix = cfg.keyPrefix ? cfg.keyPrefix.replace(/\/$/, '') + '/' : '';
  return `${prefix}lumina-backup.json`;
}

export async function s3Put(cfg: S3Config, data: object): Promise<void> {
  const body = JSON.stringify(data);
  const key = objectKey(cfg);
  const { headers, url } = await sigV4Sign(cfg, 'PUT', key, body);

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
  if (!res.ok) throw new Error(`S3 PUT failed: ${res.status} ${await res.text()}`);
}

export async function s3Get(cfg: S3Config): Promise<object> {
  const key = objectKey(cfg);
  const { headers, url } = await sigV4Sign(cfg, 'GET', key, '');

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
  if (!res.ok) throw new Error(`S3 GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}
