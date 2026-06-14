export const config = { runtime: 'edge' };

import { redis, cors, json, err, getSession } from './_shared';
import type { MarketExt } from './_shared';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  const session = await getSession(req);
  if (!session || session.role !== 'moderator') return err('Forbidden', 403);

  if (req.method !== 'POST') return err('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { id, action, note } = body as { id: string; action: 'approve' | 'reject'; note?: string };

  if (!id || !action) return err('Missing id or action');
  if (action !== 'approve' && action !== 'reject') return err('Action must be approve or reject');

  const ext = await redis.get<MarketExt>(`market:ext:${id}`);
  if (!ext) return err('Extension not found', 404);

  const updated: MarketExt = {
    ...ext,
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewedAt: Date.now(),
    reviewNote: note,
  };

  await redis.set(`market:ext:${id}`, updated);
  const { code: _c, ...safe } = updated;
  return json({ extension: safe });
}
