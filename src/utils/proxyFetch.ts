/**
 * Wraps fetch with automatic CORS-proxy fallback via /api/proxy.
 *
 * proxyMode:
 *   'on'   — always use proxy
 *   'off'  — never use proxy (direct only)
 *   'auto' — try direct first; on TypeError (CORS/network) fall back to proxy.
 *            Only calls onProxySuccess if the proxy request actually succeeds.
 */
export async function fetchWithProxyFallback(
  url: string,
  options: RequestInit,
  useProxy: boolean,           // legacy auto-detected flag
  onProxySuccess?: () => void,
  proxyMode?: 'auto' | 'on' | 'off',
): Promise<Response> {
  const mode = proxyMode ?? (useProxy ? 'on' : 'auto');

  if (mode === 'on') {
    return proxyFetch(url, options);
  }

  if (mode === 'off') {
    return fetch(url, options);
  }

  // mode === 'auto': try direct, fall back to proxy on network error
  try {
    return await fetch(url, options);
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

  return fetch('/api/proxy', {
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
