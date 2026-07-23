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

// ── Approval notifications with Allow/Deny action buttons ────────────────────────────────────
// tauri-plugin-notification 2.3.3's desktop backend never actually implements action-button
// notifications (only its mobile backend does — see src-tauri/src/lib.rs for the confirmed
// source-level gap), so this goes through a custom Rust command instead: on macOS it wraps the
// legacy NSUserNotification API directly (via mac-notification-sys), which does support a main
// action button + close button and reports back which one was clicked. Not implemented for
// Windows/Linux yet — the command returns false there and callers fall back to plain notify().

export type ApprovalAction = 'allow' | 'deny';

let nextApprovalNotificationId = 1;
const approvalUnlisten = new Map<number, () => void>();

// Sends a notification with Allow/Deny buttons for a pending command. Returns null if this
// isn't usable right now — not Tauri, no permission, window already focused (the in-app popup
// is enough), or the current platform isn't supported (currently macOS only) — callers should
// fall back to a plain notify() in that case. If non-null, race the returned `wait` promise
// against your own in-app approval UI, and call cancelApprovalWait(id) once resolved via
// whichever path won.
export async function notifyApprovalRequest(title: string, body: string): Promise<{ id: number; wait: Promise<ApprovalAction> } | null> {
  if (!isTauri) return null;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const focused = await getCurrentWindow().isFocused().catch(() => false);
    if (focused) return null;

    const granted = await ensurePermission();
    if (!granted) return null;

    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    const id = nextApprovalNotificationId++;
    const eventName = `lumina-approval-${id}`;

    const wait = new Promise<ApprovalAction>((resolve) => {
      listen<string>(eventName, (event) => {
        approvalUnlisten.get(id)?.();
        approvalUnlisten.delete(id);
        resolve(event.payload === 'allow' ? 'allow' : 'deny');
      }).then(fn => { approvalUnlisten.set(id, fn); });
    });

    const supported = await invoke<boolean>('send_approval_notification', { title, body, eventName });
    if (!supported) {
      approvalUnlisten.get(id)?.();
      approvalUnlisten.delete(id);
      return null;
    }

    return { id, wait };
  } catch {
    return null;
  }
}

// Cleans up a pending approval-notification wait — call this once the request has been resolved
// through some other path (e.g. the in-app popup), so a leftover unclicked notification doesn't
// keep a stale event listener registered.
export function cancelApprovalWait(id: number): void {
  approvalUnlisten.get(id)?.();
  approvalUnlisten.delete(id);
}
