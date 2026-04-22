// Handle URL fragments for OAuth redirects
export function handleOAuthRedirect() {
  // Check if URL has a fragment with api_key
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    const apiKey = urlParams.get('api_key');
    
    if (apiKey) {
      console.log('[OAUTH] Found API key in URL fragment:', apiKey);
      
      // Find which provider this API key belongs to
      const providers = ['pollinations', 'openai', 'anthropic']; // Add more as needed
      
      for (const providerId of providers) {
        const stored = localStorage.getItem(`lumina_auth_${providerId}`);
        if (stored) {
          try {
            const config = JSON.parse(stored);
            if (config.type === 'oauth' && config.credentials.apiKey === apiKey) {
              console.log(`[OAUTH] Successfully authenticated ${providerId} via URL fragment`);
              
              // Clear the URL fragment
              window.history.replaceState(null, '');
              window.location.hash = '';
              
              return;
            }
          } catch {}
        }
      }
      
      // If no matching provider found, save as new OAuth config for pollinations
      console.log('[OAUTH] No matching provider found, creating new config for pollinations');
      const newConfig = {
        type: 'oauth' as const,
        autoAuth: 'pollinations' as const,
        credentials: { apiKey }
      };
      localStorage.setItem('lumina_auth_pollinations', JSON.stringify(newConfig));
      
      // Clear the URL fragment
      window.history.replaceState(null, '');
      window.location.hash = '';
      
      return;
    }
    
    console.log('[OAUTH] No API key found in URL fragment');
  }
}

// Listen for URL changes (for OAuth redirects)
export function initOAuthRedirectHandler() {
  const handleHashChange = () => {
    handleOAuthRedirect();
  };
  
  window.addEventListener('hashchange', handleHashChange);
  
  // Also check immediately on load
  handleOAuthRedirect();
  
  // Cleanup function
  return () => {
    window.removeEventListener('hashchange', handleHashChange);
  };
}
