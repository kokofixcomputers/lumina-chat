import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Rendered inside the OAuth popup window.
 * Reads `code` + `state` from the URL, postMessages them to the opener, then closes.
 */
export default function OAuthOneDriveCallback() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDesc = params.get('error_description');

    if (window.opener) {
      window.opener.postMessage(
        { type: 'onedrive_oauth', code, state, error, errorDesc },
        window.location.origin,
      );
    }
    window.close();
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <p>Signing in… this window will close automatically.</p>
    </div>
  );
}
