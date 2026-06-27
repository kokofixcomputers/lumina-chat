/**
 * 1minRelay v4 OAuth callback page.
 *
 * Registered redirect URI: https://lumina-chat-rho.vercel.app/api/1minrelay-callback
 *
 * On success: shows the authorization code in a copyable text box so the user
 *             can paste it back into the lumina-chat sign-in dialog.
 * On error:   shows the error message.
 */

export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  const html = code
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>1minRelay Authorization</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #0f0f0f; color: #e5e5e5; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 2rem; max-width: 480px; width: 90%; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { color: #aaa; font-size: 0.875rem; margin: 0 0 1.25rem; }
  input { width: 100%; background: #0f0f0f; border: 1px solid #444; border-radius: 8px; color: #e5e5e5;
          font-family: monospace; font-size: 0.85rem; padding: 0.6rem 0.75rem; box-sizing: border-box; text-align: center; }
  button { margin-top: 0.75rem; background: #5b5fc7; color: #fff; border: none; border-radius: 8px;
           padding: 0.55rem 1.25rem; font-size: 0.875rem; cursor: pointer; }
  button:active { opacity: 0.8; }
</style></head>
<body><div class="card">
  <h1>✅ Authorization successful</h1>
  <p>Copy this code and paste it back into lumina-chat to complete sign-in.</p>
  <input id="c" value="${code}" readonly onclick="this.select()" />
  <br/><button onclick="navigator.clipboard.writeText(document.getElementById('c').value).then(()=>{this.textContent='Copied!'})">Copy code</button>
</div></body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Authorization failed</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #0f0f0f; color: #e5e5e5; }
  .card { background: #1a1a1a; border: 1px solid #553; border-radius: 12px; padding: 2rem; max-width: 420px; width: 90%; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #f87171; }
  p { color: #aaa; font-size: 0.875rem; }
</style></head>
<body><div class="card">
  <h1>Authorization failed</h1>
  <p>${error ?? 'Unknown error'}</p>
</div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
