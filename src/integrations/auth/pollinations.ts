import { AuthHandler, AuthConfig } from './index';
import { isTauri } from '../../utils/tauri';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';

export const pollinationsAuthHandler: AuthHandler = {
  id: 'pollinations',
  name: 'Pollinations.ai',
  description: 'AI image generation with various models',
  
  async configure(): Promise<AuthConfig> {
    console.log('[POLLINATIONS-OAUTH] Starting configuration...');
    
    // Check if provider already has OAuth configured
    const existingConfig = this.getAuthConfig();
    if (existingConfig && existingConfig.type === 'oauth') {
      console.log('[POLLINATIONS-OAUTH] Existing OAuth config found, returning it');
      return existingConfig;
    }
    
    // Check if we're in Tauri environment
    if (isTauri) {
      console.log('[POLLINATIONS-OAUTH] Tauri environment detected, using device code flow');
      
      // Use device code flow for Tauri
      try {
        const tauri = (window as any).__TAURI_INTERNALS__;
        //const invoke = tauri?.invoke;
        
        if (!invoke) {
          console.warn('[POLLINATIONS-OAUTH] Tauri invoke API not available, using fetch fallback');
          // Fallback to regular fetch without Tauri APIs
        }
        
        // Request device code
        console.log('[POLLINATIONS-OAUTH] Requesting device code...');
        const requestBody = JSON.stringify({
          client_id: "pk_luminachat",
          scope: "generate"
        });
        console.log('[POLLINATIONS-OAUTH] Request body:', requestBody);
        
        // Use Tauri fetch if available, otherwise regular fetch
        const fetchFn = (window as any).__TAURI_INTERNALS__?.tauri?.fetch || fetch;
        
        const codeResponse = await fetchFn('https://enter.pollinations.ai/api/device/code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: requestBody
        });
        
        console.log('[POLLINATIONS-OAUTH] Device code response status:', codeResponse.status);
        
        if (!codeResponse.ok) {
          const errorText = await codeResponse.text();
          console.error('[POLLINATIONS-OAUTH] Device code request failed:', errorText);
          throw new Error(`Failed to request device code: ${codeResponse.status} ${errorText}`);
        }
        
        const deviceData = await codeResponse.json();
        console.log('[POLLINATIONS-OAUTH] Raw device response:', deviceData);
        
        const { 
          device_code, 
          user_code, 
          verification_uri, 
          expires_in = 1800, 
          interval = 5 
        } = deviceData;
        
        console.log('[POLLINATIONS-OAUTH] Device data received:', deviceData);
        
        // Copy user code to clipboard and file
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(user_code);
            console.log('[POLLINATIONS-OAUTH] Code copied to clipboard');
          } else {
            console.log('[POLLINATIONS-OAUTH] Clipboard not available');
          }
        } catch (error) {
          console.error('[POLLINATIONS-OAUTH] Failed to copy to clipboard:', error);
        }
        
        // Open browser to device verification page
        try {
          await openUrl(`https://enter.pollinations.ai${verification_uri}?user_code=${user_code}`);
          console.log('[POLLINATIONS-OAUTH] Browser opened for device verification');
        } catch (error) {
          console.error('[POLLINATIONS-OAUTH] Failed to open browser:', error);
        }
        
        // Show user instructions
        let userConfirmed: boolean = false;
        try {
          if (typeof alert !== 'undefined') {
            userConfirmed = confirm(
              `Please go to the browser and enter the code:\n\n${user_code}\n\nThe code has been copied to your clipboard.\n\nThis window will close automatically once authentication is complete.`
            );
            if (userConfirmed) {
              console.log('[POLLINATIONS-OAUTH] User confirmed authentication');
            } else {
              console.log('[POLLINATIONS-OAUTH] User cancelled authentication');
              throw new Error('Authentication cancelled by user');
            }
          } else {
            console.log('[POLLINATIONS-OAUTH] Alert not available');
            throw new Error('Cannot show authentication dialog');
          }
        } catch (error) {
          console.error('[POLLINATIONS-OAUTH] Failed to show dialog:', error);
        }
        
        if (!userConfirmed) {
          throw new Error('Authentication cancelled by user');
        }
        
        // Poll for access token using the specified interval
        return new Promise((resolve, reject) => {
          const pollToken = async () => {
            try {
              const tokenResponse = await fetchFn('https://enter.pollinations.ai/api/device/token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  device_code: device_code
                })
              });
              
              if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                if (tokenData.access_token) {
                  clearInterval(pollInterval);
                  resolve({
                    type: 'oauth',
                    autoAuth: 'pollinations',
                    credentials: { apiKey: tokenData.access_token }
                  });
                } else if (tokenData.error !== 'authorization_pending') {
                  clearInterval(pollInterval);
                  reject(new Error(tokenData.error || 'Authentication failed'));
                }
              }
            } catch (error) {
              // Continue polling
            }
          };
          
          // Initial poll
          pollToken();
          
          // Continue polling every 5 seconds (or use interval from API)
          const pollInterval = setInterval(pollToken, (interval || 5) * 1000);
          
          // Timeout based on expires_in from API
          setTimeout(() => {
            clearInterval(pollInterval);
            reject(new Error('Authentication timed out'));
          }, (expires_in || 1800) * 1000);
        });
      } catch (error: any) {
        throw new Error(`Tauri OAuth failed: ${error?.message || error}`);
      }
    } else {
      // Use opener plugin for Tauri
      try {
        await openUrl(`${verification_uri}?user_code=${user_code}`);
        console.log('[POLLINATIONS-OAUTH] Browser opened for device verification');
      } catch (error) {
        console.error('[POLLINATIONS-OAUTH] Failed to open browser:', error);
        throw new Error(`Failed to open browser: ${error?.message || error}`);
      }
      
      // Show user instructions
      let userConfirmed: boolean = false;
      try {
        if (typeof alert !== 'undefined') {
          userConfirmed = confirm(
            `Please go to the browser and enter the code:\n\n${user_code}\n\nThe code has been copied to your clipboard.\n\nThis window will close automatically once authentication is complete.`
          );
        } else {
          console.log('[POLLINATIONS-OAUTH] Alert not available');
          throw new Error('Cannot show authentication dialog');
        }
      } catch (error) {
        console.error('[POLLINATIONS-OAUTH] Failed to show dialog:', error);
        throw new Error(`Failed to show dialog: ${error?.message || error}`);
      }
      
      if (!userConfirmed) {
        throw new Error('Authentication cancelled by user');
      }
      
      // Poll for access token using the specified interval
      const pollToken = async () => {
        try {
          const tokenResponse = await fetchFn('https://enter.pollinations.ai/api/device/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              device_code: device_code
            })
          });
          
          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            if (tokenData.access_token) {
              resolve({
                type: 'oauth',
                autoAuth: 'pollinations',
                credentials: { apiKey: tokenData.access_token }
              });
            } else if (tokenData.error !== 'authorization_pending') {
              reject(new Error(tokenData.error || 'Authentication failed'));
            }
          }
        } catch (error) {
          // Continue polling
        }
      };
      
      return new Promise((resolve, reject) => {
        // Initial poll
        pollToken();
        
        // Continue polling every 5 seconds (or use interval from API)
        const pollInterval = setInterval(pollToken, (interval || 5) * 1000);
        
        // Timeout based on expires_in from API
        setTimeout(() => {
          clearInterval(pollInterval);
          reject(new Error('Authentication timed out'));
        }, (expires_in || 1800) * 1000);
      });
    }
  },
  
  async getApiKey(config: AuthConfig): Promise<string> {
    if (config.type === 'oauth' && config.credentials.apiKey) {
      return config.credentials.apiKey;
    }
    throw new Error('No API key available');
  },
  
  getAuthConfig(): AuthConfig | null {
    try {
      const stored = localStorage.getItem(`lumina_auth_${this.id}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  
  saveAuthConfig(config: AuthConfig): void {
    localStorage.setItem(`lumina_auth_${this.id}`, JSON.stringify(config));
  },
  
  saveAuthConfig(config: AuthConfig): void {
    localStorage.setItem(`lumina_auth_${this.id}`, JSON.stringify(config));
  }
};
