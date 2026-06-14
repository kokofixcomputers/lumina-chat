// Tauri deep link integration
import { isTauri } from './deepLink';

export async function registerDeepLinkHandler(): Promise<void> {
  if (!isTauri()) return;

  try {
    // Import Tauri plugins dynamically
    const { listen } = await import('@tauri-apps/api/event');

    // Listen for deep link events
    await listen('deep-link://new-url', (event) => {
      const url = event.payload as string;

      // Handle import deep link
      if (url.includes('lumina://import')) {
        try {
          // Extract the data parameter from the URL
          const match = url.match(/[?&]data=([^&]*)/);
          if (match && match[1]) {
            const base64Data = decodeURIComponent(match[1]);
            const jsonStr = atob(base64Data);
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
    });

  } catch (error) {
    console.error('Failed to register deep link handler:', error);
  }
}

export async function checkForDeepLinkOnStartup(): Promise<void> {
  if (!isTauri()) return;

  try {
    // Import Tauri APIs
    await import('@tauri-apps/api/window');

    // The deep link URL should be available through the listener
    // This is just a placeholder for additional startup checks

  } catch (error) {
    console.error('Failed to check for deep link on startup:', error);
  }
}
