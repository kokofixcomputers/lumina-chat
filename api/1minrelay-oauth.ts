/**
 * 1minRelay v4 OAuth token exchange proxy.
 *
 * Keeps ONEMINRELAY_V4_CLIENT_ID and ONEMINRELAY_V4_CLIENT_SECRET server-side.
 * The frontend calls this at /api/1minrelay-oauth (relative, works on any domain).
 *
 * Set these env vars in Vercel dashboard:
 *   ONEMINRELAY_V4_CLIENT_ID      — your OAuth app's client_id (oac_…)
 *   ONEMINRELAY_V4_CLIENT_SECRET  — your OAuth app's client_secret (oas_…)
 */

export const config = { runtime: 'edge' };

const RELAY_BASE = 'https://v4.kokodev.cc';

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors() });
  }

  const clientId = (globalThis as any).process?.env?.ONEMINRELAY_V4_CLIENT_ID ?? '';
  const clientSecret = (globalThis as any).process?.env?.ONEMINRELAY_V4_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'OAuth app not configured on server' }), { status: 500, headers: cors() });
  }

  let body: { code: string; redirect_uri?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: cors() });
  }

  if (!body.code) {
    return new Response(JSON.stringify({ error: 'Missing code' }), { status: 400, headers: cors() });
  }

  // Derive redirect_uri from the request origin if not supplied
  const origin = new URL(req.url).origin;
  const redirectUri = body.redirect_uri ?? `${origin}/oauth/1minrelay/callback`;

  try {
    const tokenRes = await fetch(`${RELAY_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) throw new Error(text || `Token request failed: ${tokenRes.status}`);
    return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', ...cors() } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Token exchange failed' }), { status: 502, headers: cors() });
  }
}
