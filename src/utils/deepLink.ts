import type { Conversation } from '../types';

export const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export interface ShareData {
  conversation: Conversation;
  expiresAt: string;
}

export async function loadSharedConversation(code: string): Promise<ShareData> {
  const response = await fetch(`https://my-ai-chat.kokofixcomputers.workers.dev/share?code=${code.trim()}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to load shared conversation');
  }

  return {
    conversation: data.conversation,
    expiresAt: data.expiresAt
  };
}

export function getShareCodeFromURL(): string | null {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('view');
}

export function cleanShareCodeFromURL(): void {
  if (typeof window === 'undefined') return;
  
  window.history.replaceState({}, '', window.location.pathname);
}

export function openDeepLink(code: string): void {
  if (isTauri()) {
    // In Tauri, the deep link should already be handled by the app protocol
    console.log('Deep link should be handled by Tauri protocol registration');
  } else {
    // In web, try to open the lumina:// protocol
    const deepLink = `lumina://view?code=${code}`;
    
    // Try to open the deep link
    window.location.href = deepLink;
    
    // Fallback: if the deep link doesn't work, open in current tab after a short delay
    setTimeout(() => {
      if (window.location.href === deepLink) {
        // Deep link didn't work, fallback to web URL
        window.location.href = `${window.location.origin}?view=${code}`;
      }
    }, 1000);
  }
}

export async function handleDeepLinkOrShare(
  onLoadConversation: (conversation: Conversation) => void
): Promise<{ loaded: boolean; error?: string }> {
  try {
    const shareCode = getShareCodeFromURL();
    
    if (!shareCode) {
      return { loaded: false };
    }

    // Load the shared conversation
    const { conversation } = await loadSharedConversation(shareCode);
    
    // Load it into the app
    onLoadConversation(conversation);
    
    // Clean up the URL
    cleanShareCodeFromURL();
    
    return { loaded: true };
  } catch (error) {
    console.error('Failed to handle share/deep link:', error);
    return { 
      loaded: false, 
      error: error instanceof Error ? error.message : 'Failed to load shared conversation' 
    };
  }
}

export function registerDeepLinkProtocol(): void {
  if (!isTauri()) return;
  
  // This would typically be handled in Tauri's configuration (tauri.conf.json)
  // but we can provide a fallback for manual registration
  console.log('Deep link protocol should be registered in tauri.conf.json:');
  console.log('"tauri": { "deepLinkProtocols": [{ "name": "lumina", "schemes": ["lumina"] }] }');
}
