export type SyncStatus = 'synced' | 'syncing' | 'error' | 'disabled';

const SYNC_STATUS_KEY = 'lumina_sync_status';

export function getSyncStatus(): SyncStatus {
  try {
    const status = localStorage.getItem(SYNC_STATUS_KEY);
    return (status as SyncStatus) || 'disabled';
  } catch {
    return 'disabled';
  }
}

export function setSyncStatus(status: SyncStatus) {
  try {
    localStorage.setItem(SYNC_STATUS_KEY, status);
    window.dispatchEvent(new CustomEvent('syncStatusChange', { detail: status }));
  } catch {}
}

export function subscribeSyncStatus(callback: (status: SyncStatus) => void) {
  const handler = (e: Event) => {
    callback((e as CustomEvent).detail);
  };
  window.addEventListener('syncStatusChange', handler);
  return () => window.removeEventListener('syncStatusChange', handler);
}
