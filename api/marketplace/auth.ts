export const config = { runtime: 'edge' };

import { redis, cors, json, err, hashPassword, verifyPassword, createSession, getSession, isModUsername } from './_shared';
import type { UserRecord } from './_shared';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  // GET /api/marketplace/auth  → return current session user
  if (req.method === 'GET') {
    const session = await getSession(req);
    if (!session) return err('Unauthorized', 401);
    return json({ username: session.username, role: session.role });
  }

  if (req.method !== 'POST') return err('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { action, username, password } = body as { action: string; username: string; password: string };

  if (!action) return err('Missing action');

  // ── Sign up ────────────────────────────────────────────────────────────
  if (action === 'signup') {
    if (!username || !password) return err('Username and password required');
    if (username.length < 3 || username.length > 32) return err('Username must be 3–32 characters');
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return err('Username may only contain letters, numbers, _ and -');
    if (password.length < 8) return err('Password must be at least 8 characters');

    const existing = await redis.get<UserRecord>(`market:user:${username}`);
    if (existing) return err('Username already taken');

    const role = isModUsername(username) ? 'moderator' : 'user';
    const user: UserRecord = {
      username,
      passwordHash: await hashPassword(password),
      role,
      createdAt: Date.now(),
    };
    await redis.set(`market:user:${username}`, user);

    const token = await createSession(username, role);
    return json({ token, username, role });
  }

  // ── Log in ─────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!username || !password) return err('Username and password required');

    const user = await redis.get<UserRecord>(`market:user:${username}`);
    if (!user) return err('Invalid username or password', 401);

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return err('Invalid username or password', 401);

    // Always re-derive role in case env changed
    const role = isModUsername(username) ? 'moderator' : user.role;
    if (role !== user.role) {
      await redis.set(`market:user:${username}`, { ...user, role });
    }

    const token = await createSession(username, role);
    return json({ token, username, role });
  }

  // ── Log out ────────────────────────────────────────────────────────────
  if (action === 'logout') {
    const session = await getSession(req);
    if (session) {
      const auth = req.headers.get('authorization') || '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      await redis.del(`market:token:${token}`);
    }
    return json({ ok: true });
  }

  return err('Unknown action');
}
