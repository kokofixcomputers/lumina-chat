// Tauri deep link integration
import { isTauri } from './deepLink';

// Parse a single lumina:// deep link URL and act on it.
function handleDeepLinkUrl(url: string): void {
  if (!url) return;

  // Handle import deep link
  if (url.includes('lumina://import')) {
    // Import triggers window.location.reload(); on reload, getCurrent() still
    // returns this same launch URL, which would re-open the import prompt in a
    // loop. Dedupe per session so each deep link is only processed once.
    try {
      const handled = sessionStorage.getItem('lumina_handled_import_url');
      if (handled === url) return;
      sessionStorage.setItem('lumina_handled_import_url', url);
    } catch {
      // sessionStorage unavailable — fall through and process normally.
    }

    try {
      // Extract the data parameter from the URL
      const match = url.match(/[?&]data=([^&]*)/);
      if (match && match[1]) {
        const base64Data = decodeURIComponent(match[1]);
        // Decode base64 to UTF-8 bytes, then to string
        const binaryString = atob(base64Data);
        const utf8Bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          utf8Bytes[i] = binaryString.charCodeAt(i);
        }
        const jsonStr = new TextDecoder().decode(utf8Bytes);
        const data = JSON.parse(jsonStr);

        // Fire a custom event with the import data
        window.dispatchEvent(new CustomEvent('lumina-import-data', { detail: data }));
      }
    } catch (error) {
      console.error('Failed to parse import deep link:', error);
    }
  } else if (url.includes('lumina://view')) {
    // Handle existing share/view deep link
    const match = url.match(/[?&]code=([^&]*)/);
    if (match && match[1]) {
      const viewCode = match[1];
      // Update the window location to trigger the existing share handling
      window.location.href = `${window.location.origin}?view=${viewCode}`;
    }
  }
}

export async function registerDeepLinkHandler(): Promise<void> {
  if (!isTauri()) return;

  try {
    const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

    // Fires whenever a lumina:// link is opened while the app is running.
    await onOpenUrl((urls) => {
      for (const url of urls) {
        handleDeepLinkUrl(url);
      }
    });
  } catch (error) {
    console.error('Failed to register deep link handler:', error);

    // Fallback: listen for the raw plugin event if onOpenUrl is unavailable.
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen('deep-link://new-url', (event) => {
        const payload = event.payload;
        const urls = Array.isArray(payload) ? payload : [payload as string];
        for (const url of urls) {
          handleDeepLinkUrl(url as string);
        }
      });
    } catch (fallbackError) {
      console.error('Failed to register deep link fallback listener:', fallbackError);
    }
  }
}

export async function checkForDeepLinkOnStartup(): Promise<void> {
  if (!isTauri()) return;

  try {
    const { getCurrent } = await import('@tauri-apps/plugin-deep-link');

    // When the app is launched (cold start) by clicking a lumina:// link,
    // the URL is delivered here rather than via the onOpenUrl listener,
    // which registers too late to catch the launch event.
    const urls = await getCurrent();
    if (urls && urls.length > 0) {
      for (const url of urls) {
        handleDeepLinkUrl(url);
      }
    }
  } catch (error) {
    console.error('Failed to check for deep link on startup:', error);
  }
}
