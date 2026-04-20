import { universalFetch } from './tauriFetch';

/**
 * Wraps fetch with automatic CORS-proxy fallback via /api/proxy.
 * In Tauri, proxy is always disabled and universal fetch is used.
 *
 * proxyMode:
 *   'on'   - always use proxy (ignored in Tauri)
 *   'off'  - never use proxy (direct only)
 *   'auto' - try direct first; on TypeError (CORS/network) fall back to proxy (ignored in Tauri).
 *           Only calls onProxySuccess if the proxy request actually succeeds.
 */
export async function fetchWithProxyFallback(
  url: string,
  options: RequestInit,
  useProxy: boolean,           // legacy auto-detected flag
  onProxySuccess?: () => void,
  proxyMode?: 'auto' | 'on' | 'off',
): Promise<Response> {
  // Check if we're in Tauri - if so, always use universal fetch without proxy
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  
  if (isTauri) {
    // In Tauri, proxy is disabled and we use universal fetch
    return universalFetch(url, options);
  }

  const mode = proxyMode ?? (useProxy ? 'on' : 'auto');

  if (mode === 'on') {
    return proxyFetch(url, options);
  }

  if (mode === 'off') {
    return universalFetch(url, options);
  }

  // mode === 'auto': try direct, fall back to proxy on network error
  try {
    return await universalFetch(url, options);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    // Direct failed — try proxy, but only persist success if it works
    const res = await proxyFetch(url, options);
    onProxySuccess?.();
    return res;
  }
}

async function proxyFetch(url: string, options: RequestInit): Promise<Response> {
  let body: unknown;
  if (options.body) {
    try {
      body = JSON.parse(options.body as string);
    } catch {
      body = options.body;
    }
  }

  return fetch('https://lumina-chat-rho.vercel.app/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      body,
    }),
    signal: options.signal ?? undefined,
  });
}
