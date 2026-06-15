export type FileSyncStatus = 'idle' | 'connecting' | 'connected' | 'syncing' | 'error';

let current: FileSyncStatus = 'idle';
let lastSyncedAt: number | null = null;
const listeners = new Set<(s: FileSyncStatus, t: number | null) => void>();

export function getFileSyncStatus(): FileSyncStatus { return current; }
export function getFileSyncLastSyncedAt(): number | null { return lastSyncedAt; }

export function setFileSyncStatus(s: FileSyncStatus, ts?: number) {
  current = s;
  if (ts !== undefined) lastSyncedAt = ts;
  listeners.forEach(fn => fn(current, lastSyncedAt));
}

export function subscribeFileSyncStatus(fn: (s: FileSyncStatus, t: number | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
