export const config = { runtime: 'edge' };

import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

export function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ── Password hashing (PBKDF2, Web Crypto) ──────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256,
  );
  const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key, 256,
  );
  const newHex = Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, '0')).join('');
  return newHex === hashHex;
}

// ── Session helpers ────────────────────────────────────────────────────────

export interface UserRecord {
  username: string;
  passwordHash: string;
  role: 'user' | 'moderator';
  createdAt: number;
}

export interface SessionRecord {
  username: string;
  role: 'user' | 'moderator';
}

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export async function createSession(username: string, role: 'user' | 'moderator'): Promise<string> {
  const token = crypto.randomUUID();
  await redis.set<SessionRecord>(`market:token:${token}`, { username, role }, { ex: SESSION_TTL });
  return token;
}

export async function getSession(req: Request): Promise<SessionRecord | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const session = await redis.get<SessionRecord>(`market:token:${token}`);
  if (!session) return null;
  // Always re-derive role from the env var — never trust the value stored in the session.
  // This means adding/removing a mod username takes effect immediately without re-login,
  // and a leaked or tampered token can never claim privileges the username doesn't have.
  const role = isModUsername(session.username) ? 'moderator' : 'user';
  return { username: session.username, role };
}

export function isModUsername(username: string): boolean {
  const mods = (process.env.MARKETPLACE_MOD_USERNAMES || '').split(',').map(s => s.trim()).filter(Boolean);
  return mods.includes(username);
}

// ── Extension record ───────────────────────────────────────────────────────

export type ExtensionType = 'sandboxed' | 'unsandboxed';

export interface MarketExt {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;         // display name
  submittedBy: string;    // username
  code: string;
  type: ExtensionType;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: number;
  reviewedAt?: number;
  reviewNote?: string;
  downloads: number;
}
