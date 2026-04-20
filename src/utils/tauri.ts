/**
 * Centralized Tauri utilities
 * Avoids repetitive Tauri detection and integration code
 */

import { getVersion } from '@tauri-apps/api/app';

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

// Tauri-specific utilities
export const tauriUtils = {
  isTauri,
  getVersion: getTauriVersion,
  checkIsTauri,
};
