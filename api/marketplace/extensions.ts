export const config = { runtime: 'edge' };

import { redis, cors, json, err, getSession } from './_shared';
import type { MarketExt } from './_shared';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  // ── GET – list extensions ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const session = await getSession(req);
    const url = new URL(req.url);
    const mine = url.searchParams.get('mine') === '1';
    const status = url.searchParams.get('status') || 'approved';

    // Only mods can query pending/rejected; other users can query 'mine'
    if (status !== 'approved' && !mine) {
      if (!session || session.role !== 'moderator') return err('Forbidden', 403);
    }

    const keys = await redis.keys('market:ext:*');
    const extKeys = keys.filter(k => !k.startsWith('market:ext:dl:'));
    if (extKeys.length === 0) return json({ extensions: [] });

    const records = await redis.mget<MarketExt[]>(...extKeys);
    let exts = records.filter(Boolean) as MarketExt[];

    if (mine && session) {
      exts = exts.filter(e => e.submittedBy === session.username);
    } else {
      exts = exts.filter(e => e.status === status);
    }

    // Sort newest first
    exts.sort((a, b) => b.submittedAt - a.submittedAt);

    // Mods reviewing the queue get the code; everyone else gets it stripped
    const isMod = session?.role === 'moderator';
    const safe = isMod && status === 'pending'
      ? exts
      : exts.map(({ code: _code, ...rest }) => rest);
    return json({ extensions: safe });
  }

  // ── POST – submit extension ────────────────────────────────────────────
  if (req.method === 'POST') {
    const session = await getSession(req);
    if (!session) return err('Unauthorized', 401);

    const body = await req.json().catch(() => null);
    if (!body) return err('Invalid JSON');

    const { id, name, version, description, author, code, type } = body as Partial<MarketExt>;

    if (!id || !name || !version || !description || !author || !code) {
      return err('Missing required fields: id, name, version, description, author, code');
    }
    if (typeof code !== 'string' || code.length > 512_000) return err('Code too large');
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) return err('Extension ID may only contain letters, numbers, dots, underscores, and dashes');
    const extType = type === 'unsandboxed' ? 'unsandboxed' : 'sandboxed';

    // Check for duplicate
    const existing = await redis.get<MarketExt>(`market:ext:${id}`);
    if (existing && existing.submittedBy !== session.username) {
      return err('An extension with this ID already exists');
    }
    // If updating own extension, reset to pending
    const ext: MarketExt = {
      id, name, version, description, author,
      submittedBy: session.username,
      code,
      type: extType,
      status: 'pending',
      submittedAt: Date.now(),
      downloads: existing?.downloads ?? 0,
    };

    await redis.set(`market:ext:${id}`, ext);
    const { code: _c, ...safe } = ext;
    return json({ extension: safe }, 201);
  }

  return err('Method not allowed', 405);
}
