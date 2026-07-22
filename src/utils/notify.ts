import { isTauri } from './tauri';

let permissionChecked = false;
let permissionGranted = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const result = await requestPermission();
      permissionGranted = result === 'granted';
    }
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

// Whether the OS has already granted permission, without prompting for it.
export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
    const granted = await isPermissionGranted();
    permissionChecked = true;
    permissionGranted = granted;
    return granted;
  } catch {
    return false;
  }
}

// Explicitly triggers the native OS permission prompt — call this from a user gesture
// (e.g. clicking "Allow" on an in-app banner), not automatically on load.
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri) return false;
  return ensurePermission();
}

const BANNER_DISMISSED_KEY = 'lumina_notification_banner_dismissed';
export function wasNotificationBannerDismissed(): boolean {
  try { return localStorage.getItem(BANNER_DISMISSED_KEY) === '1'; } catch { return false; }
}
export function dismissNotificationBanner(): void {
  try { localStorage.setItem(BANNER_DISMISSED_KEY, '1'); } catch { /* ignore */ }
}

// Send a native OS notification. No-ops outside Tauri, if permission is denied, or while the
// app window is already focused (the user is already looking at it — no need to interrupt).
export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const focused = await getCurrentWindow().isFocused().catch(() => false);
    if (focused) return;

    const granted = await ensurePermission();
    if (!granted) return;

    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    sendNotification({ title, body });
  } catch {
    /* ignore — notifications are a nice-to-have, never block on them */
  }
}
