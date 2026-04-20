// Tauri deep link integration
import { isTauri } from './deepLink';

export async function registerDeepLinkHandler(): Promise<void> {
  if (!isTauri()) return;

  try {
    // Import Tauri plugins dynamically
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const { listen } = await import('@tauri-apps/api/event');
    
    // Listen for deep link events
    await listen('deep-link://new-url', (event) => {
      console.log('Deep link received:', event.payload);
      
      // Parse the URL and extract the view parameter
      const url = event.payload as string;
      const urlParams = new URLSearchParams(url.split('?')[1] || '');
      const viewCode = urlParams.get('view');
      
      if (viewCode) {
        // Update the window location to trigger the existing share handling
        window.location.href = `${window.location.origin}?view=${viewCode}`;
      }
    });
    
    console.log('Deep link handler registered successfully');
  } catch (error) {
    console.error('Failed to register deep link handler:', error);
  }
}

export async function checkForDeepLinkOnStartup(): Promise<void> {
  if (!isTauri()) return;

  try {
    // Import Tauri APIs
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    
    // Check if the app was launched via deep link
    const window = getCurrentWindow();
    
    // The deep link URL should be available in the window's label or through an event
    // This depends on how the Tauri deep link plugin handles the initial URL
    
    console.log('Checking for deep link on startup...');
  } catch (error) {
    console.error('Failed to check for deep link on startup:', error);
  }
}
