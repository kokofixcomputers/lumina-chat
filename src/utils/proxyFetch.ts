/**
 * Wraps fetch with automatic CORS-proxy fallback via /api/proxy.
 *
 * If the direct fetch fails with a network error (TypeError – typical for CORS
 * blocks) it retries through the proxy endpoint.  When the proxy succeeds the
 * optional `onProxySuccess` callback is called so callers can persist the flag.
 */
export async function fetchWithProxyFallback(
  url: string,
  options: RequestInit,
  useProxy: boolean,
  onProxySuccess?: () => void,
): Promise<Response> {
  if (useProxy) {
    return proxyFetch(url, options);
  }

  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    // TypeError is thrown for network failures / CORS blocks
    if (err instanceof TypeError) {
      const res = await proxyFetch(url, options);
      onProxySuccess?.();
      return res;
    }
    throw err;
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
