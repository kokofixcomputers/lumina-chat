/**
 * Centralized Tauri utilities
 * Avoids repetitive Tauri detection and integration code
 */

import { getVersion } from '@tauri-apps/api/app';
import { openUrl as openUrlTauri } from '@tauri-apps/plugin-opener';

// Centralized Tauri detection
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Get Tauri version with caching
let cachedVersion: string | null = null;
export async function getTauriVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  
  try {
    const version = await getVersion();
    cachedVersion = version;
    console.log('Tauri version:', version);
    return version;
  } catch {
    // Not running in Tauri
    return '';
  }
}

// Check if current environment is Tauri
export function checkIsTauri(): boolean {
  return isTauri;
}

// Open URL in external browser
export async function openUrl(url: string): Promise<void> {
  if (isTauri) {
    try {
      await openUrlTauri(url);
    } catch (error) {
      console.error('Error opening URL in Tauri:', error);
      // Fallback to window.open
      window.open(url, '_blank');
    }
  } else {
    window.open(url, '_blank');
  }
}

// Tauri-specific utilities
export const tauriUtils = {
  isTauri,
  getVersion: getTauriVersion,
  checkIsTauri,
  openUrl,
};
