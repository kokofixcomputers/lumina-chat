import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { POLLINATIONS_OAUTH_STORAGE_KEY } from '../integrations/auth/pollinations';

/**
 * Rendered inside the OAuth popup window.
 * Writes code + state to localStorage (storage event picked up by the opener), then closes.
 */
export default function OAuthPollinationsCallback() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payload = {
      code: params.get('code') ?? undefined,
      state: params.get('state') ?? undefined,
      error: params.get('error') ?? undefined,
      ts: Date.now(),
    };

    try {
      localStorage.setItem(POLLINATIONS_OAUTH_STORAGE_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }

    setTimeout(() => window.close(), 300);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <p>Signing in… this window will close automatically.</p>
    </div>
  );
}
