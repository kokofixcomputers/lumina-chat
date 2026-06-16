import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isTauri } from '../utils/tauri';

/**
 * Rendered inside the OAuth popup window.
 * Reads `code` + `state` from the URL, notifies the opener, then closes.
 *
 * Web:   postMessage to window.opener AND localStorage (storage event) —
 *        Microsoft's login pages send `Cross-Origin-Opener-Policy` headers
 *        that sever window.opener after navigating through them, so
 *        postMessage alone is unreliable. localStorage works regardless.
 * Tauri: emits 'onedrive_oauth_callback' Tauri event (window.open is not available)
 */
export const ONEDRIVE_OAUTH_STORAGE_KEY = 'lumina_onedrive_oauth_result';

export default function OAuthOneDriveCallback() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const payload = {
      code:      params.get('code')             ?? undefined,
      state:     params.get('state')            ?? undefined,
      error:     params.get('error')            ?? undefined,
      errorDesc: params.get('error_description') ?? undefined,
    };

    if (isTauri) {
      import('@tauri-apps/api/event').then(({ emit }) => {
        emit('onedrive_oauth_callback', payload).finally(() => {
          import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
            getCurrentWindow().close();
          });
        });
      });
    } else {
      // Primary channel: localStorage + storage event. This works even when
      // window.opener has been severed by Microsoft's COOP headers.
      try {
        localStorage.setItem(ONEDRIVE_OAUTH_STORAGE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
      } catch { /* ignore */ }

      // Best-effort secondary channel, in case opener is still intact.
      if (window.opener) {
        try {
          window.opener.postMessage(
            { type: 'onedrive_oauth', ...payload },
            window.location.origin,
          );
        } catch { /* ignore */ }
      }

      // Give the opener a moment to read the storage event / message before closing.
      setTimeout(() => window.close(), 300);
    }
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <p>Signing in… this window will close automatically.</p>
    </div>
  );
}
