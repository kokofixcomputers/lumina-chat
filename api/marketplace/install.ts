export const config = { runtime: 'edge' };

import { redis, cors, json, err } from './_shared';
import type { MarketExt } from './_shared';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return err('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { id } = body as { id: string };
  if (!id) return err('Missing id');

  const ext = await redis.get<MarketExt>(`market:ext:${id}`);
  if (!ext) return err('Extension not found', 404);
  if (ext.status !== 'approved') return err('Extension not available', 403);

  // Increment download counter
  await redis.incr(`market:ext:dl:${id}`);
  const dl = await redis.get<number>(`market:ext:dl:${id}`);
  await redis.set(`market:ext:${id}`, { ...ext, downloads: dl ?? ext.downloads + 1 });

  return json({ extension: ext });
}
