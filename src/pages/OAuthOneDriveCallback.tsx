import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isTauri } from '../utils/tauri';

/**
 * Rendered inside the OAuth popup window.
 * Reads `code` + `state` from the URL, notifies the opener, then closes.
 *
 * Web:   postMessage to window.opener
 * Tauri: emits 'onedrive_oauth_callback' Tauri event (window.open is not available)
 */
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
      if (window.opener) {
        window.opener.postMessage(
          { type: 'onedrive_oauth', ...payload },
          window.location.origin,
        );
        // Don't close here — main window closes the popup after handling the message,
        // so the interval check doesn't see it closed before onMessage fires.
      } else {
        window.close();
      }
    }
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <p>Signing in… this window will close automatically.</p>
    </div>
  );
}
