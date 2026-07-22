/**
 * GitHub OAuth token exchange proxy.
 *
 * Keeps GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET server-side.
 * The frontend calls this at /api/github-oauth (relative, works on any domain).
 *
 * Set these env vars in the Vercel dashboard, and register a GitHub OAuth App
 * (https://github.com/settings/developers) with an Authorization callback URL
 * of `lumina://oauth/github` for the desktop app, plus your web origin's
 * `/oauth/github/callback` if you also want the web/browser flow to work:
 *   GITHUB_OAUTH_CLIENT_ID
 *   GITHUB_OAUTH_CLIENT_SECRET
 */

export const config = { runtime: 'edge' };

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

  const clientId = (globalThis as any).process?.env?.GITHUB_OAUTH_CLIENT_ID ?? '';
  const clientSecret = (globalThis as any).process?.env?.GITHUB_OAUTH_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'GitHub OAuth app not configured on server' }), { status: 500, headers: cors() });
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

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: body.code,
        redirect_uri: body.redirect_uri,
      }),
    });
    const data: any = await tokenRes.json();
    if (!tokenRes.ok || data.error) {
      throw new Error(data.error_description || data.error || `Token request failed: ${tokenRes.status}`);
    }
    return new Response(JSON.stringify({ access_token: data.access_token, scope: data.scope, token_type: data.token_type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Token exchange failed' }), { status: 502, headers: cors() });
  }
}
