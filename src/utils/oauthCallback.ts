// OAuth callback handler for popup windows
export function handleOAuthCallback() {
  // Check if we're in a popup window (not the main app)
  if (window.opener) {
    console.log('[OAUTH-CALLBACK] Detected popup window');
    
    // Check for API key in URL fragment
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    const apiKey = urlParams.get('api_key');
    
    if (apiKey) {
      console.log('[OAUTH-CALLBACK] Found API key in URL fragment:', apiKey);
      
      // Send the API key back to parent window
      window.opener.postMessage({
        type: 'POLLINATIONS_AUTH_SUCCESS',
        url: window.location.href,
        apiKey: apiKey
      }, 'https://enter.pollinations.ai');
      
      // Close the popup after sending the message
      setTimeout(() => {
        window.close();
      }, 100);
    } else {
      console.log('[OAUTH-CALLBACK] No API key found in URL fragment');
      
      // Send error back to parent
      window.opener.postMessage({
        type: 'POLLINATIONS_AUTH_ERROR',
        error: 'No API key found in redirect'
      }, 'https://enter.pollinations.ai');
      
      setTimeout(() => {
        window.close();
      }, 100);
    }
  } else {
    console.log('[OAUTH-CALLBACK] Not in popup window, ignoring');
  }
}

// Initialize OAuth callback handler
export function initOAuthCallback() {
  // Check immediately on load
  handleOAuthCallback();
  
  // Also listen for hash changes
  const handleHashChange = () => {
    handleOAuthCallback();
  };
  
  window.addEventListener('hashchange', handleHashChange);
  
  return () => {
    window.removeEventListener('hashchange', handleHashChange);
  };
}
