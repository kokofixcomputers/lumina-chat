/**
 * OneDrive OAuth token proxy.
 *
 * Keeps ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET server-side.
 * The frontend sends only device_code / refresh_token — the secret never leaves Vercel.
 *
 * Supported actions (POST JSON body):
 *   { action: 'devicecode' }
 *   { action: 'poll',    device_code: string }
 *   { action: 'refresh', refresh_token: string }
 */

export const config = { runtime: 'edge' };

const MS = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPE = 'Files.ReadWrite offline_access User.Read';

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const clientId     = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return json({ error: 'OneDrive credentials not configured on server' }, 503);
  }

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { action } = body;

  // ── Start device code flow ────────────────────────────────────────────────
  if (action === 'devicecode') {
    const res = await fetch(`${MS}/devicecode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: SCOPE }).toString(),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data.error_description ?? data.error }, res.status);
    return json(data);
  }

  // ── Poll for token after device code ─────────────────────────────────────
  if (action === 'poll') {
    const { device_code } = body;
    if (!device_code) return json({ error: 'Missing device_code' }, 400);
    const res = await fetch(`${MS}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'urn:ietf:params:oauth:grant-type:device_code',
        device_code,
      }).toString(),
    });
    const data = await res.json();
    // Pass through pending/slow_down as 202 so the frontend can distinguish
    if (!res.ok) {
      const pending = data.error === 'authorization_pending' || data.error === 'slow_down';
      return json(data, pending ? 202 : res.status);
    }
    return json(data);
  }

  // ── Refresh access token ──────────────────────────────────────────────────
  if (action === 'refresh') {
    const { refresh_token } = body;
    if (!refresh_token) return json({ error: 'Missing refresh_token' }, 400);
    const res = await fetch(`${MS}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
        refresh_token,
        scope:         SCOPE,
      }).toString(),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data.error_description ?? data.error }, res.status);
    return json(data);
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}
