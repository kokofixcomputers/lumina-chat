import { useState, useEffect, useRef } from 'react';
import {
  Upload, Download, Trash2, Wifi, WifiOff, ChevronDown,
  Cloud, Database, Server, Check, RefreshCw, LogIn, LogOut,
} from 'lucide-react';
import type { AppSettings } from '../../types';
import { getSyncManager, destroySyncManager } from '../../utils/syncManager';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../../utils/syncStatus';
import type { SyncActionTypes } from '../../types/sync';
import { getFileSyncStatus, getFileSyncLastSyncedAt, subscribeFileSyncStatus, type FileSyncStatus } from '../../utils/fileSyncStatus';
import {
  startOAuthFlow, disconnectOneDrive,
  isOneDriveConnected, getOneDriveUserInfo,
} from '../../utils/onedriveSync';

type Provider = 'lumina' | 's3' | 'webdav' | 'onedrive';

function dispatchForceSync(action: 'push' | 'pull' | 'both') {
  window.dispatchEvent(new CustomEvent('fileSyncForce', { detail: { action } }));
}

function ForceSyncButtons({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState<'push' | 'pull' | 'both' | null>(null);
  if (!enabled) return null;
  const run = (action: 'push' | 'pull' | 'both') => {
    setBusy(action);
    dispatchForceSync(action);
    setTimeout(() => setBusy(null), 3000);
  };
  return (
    <div className="form-group">
      <label className="form-label">Force Sync</label>
      <div className="flex gap-2">
        <button
          className="btn btn-secondary text-xs flex items-center gap-1.5 flex-1"
          onClick={() => run('push')}
          disabled={busy !== null}
        >
          <Upload size={12} />
          {busy === 'push' ? 'Pushing…' : 'Push'}
        </button>
        <button
          className="btn btn-secondary text-xs flex items-center gap-1.5 flex-1"
          onClick={() => run('pull')}
          disabled={busy !== null}
        >
          <Download size={12} />
          {busy === 'pull' ? 'Pulling…' : 'Pull'}
        </button>
        <button
          className="btn btn-secondary text-xs flex items-center gap-1.5 flex-1"
          onClick={() => run('both')}
          disabled={busy !== null}
        >
          <RefreshCw size={12} className={busy === 'both' ? 'animate-spin' : ''} />
          {busy === 'both' ? 'Syncing…' : 'Sync'}
        </button>
      </div>
      <p className="form-help">Push overwrites remote. Pull overwrites local. Sync does both.</p>
    </div>
  );
}

interface CloudSyncTabProps {
  settings: AppSettings;
  conversations: any[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onImportData: (data: any) => void;
  onSyncAction?: (action: SyncActionTypes) => void;
}

// ── Custom dropdown ──────────────────────────────────────────────────────────

const PROVIDERS: { id: Provider; label: string; icon: typeof Cloud; desc: string; comingSoon?: boolean }[] = [
  { id: 'lumina', label: 'Lumina Sync', icon: Cloud, desc: 'Real-time sync via Lumina servers' },
  { id: 's3', label: 'Amazon S3 / S3-Compatible', icon: Database, desc: 'Sync to any S3-compatible bucket' },
  { id: 'webdav', label: 'WebDAV', icon: Server, desc: 'Sync to any WebDAV server' },
  { id: 'onedrive', label: 'OneDrive', icon: Cloud, desc: 'Microsoft OneDrive (OAuth)' },
];

function ProviderDropdown({ value, onChange }: { value: Provider; onChange: (v: Provider) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = PROVIDERS.find(p => p.id === value)!;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input w-full flex items-center gap-2 text-sm text-left cursor-pointer select-none"
      >
        <current.icon size={15} className="text-[rgb(var(--accent))] shrink-0" />
        <span className="flex-1 font-medium">{current.label}</span>
        <ChevronDown size={14} className={`text-[rgb(var(--muted))] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl shadow-xl overflow-hidden">
          {PROVIDERS.map(p => (
            <button
              key={`${p.id}-${p.comingSoon}`}
              type="button"
              disabled={p.comingSoon}
              onClick={() => { if (!p.comingSoon) { onChange(p.id); setOpen(false); } }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${p.comingSoon ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.05]'}`}
            >
              <p.icon size={15} className={p.id === value && !p.comingSoon ? 'text-[rgb(var(--accent))]' : 'text-[rgb(var(--muted))]'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium flex items-center gap-2">
                  {p.label}
                  {p.comingSoon && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] px-1.5 py-0.5 rounded-full">
                      Coming soon
                    </span>
                  )}
                </p>
                <p className="text-xs text-[rgb(var(--muted))]">{p.desc}</p>
              </div>
              {p.id === value && !p.comingSoon && <Check size={13} className="text-[rgb(var(--accent))] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File sync status badge ───────────────────────────────────────────────────

function FileSyncStatusBadge() {
  const [status, setStatus] = useState<FileSyncStatus>(getFileSyncStatus());
  const [lastSynced, setLastSynced] = useState<number | null>(getFileSyncLastSyncedAt());

  useEffect(() => subscribeFileSyncStatus((s, t) => { setStatus(s); setLastSynced(t); }), []);

  const statusMap: Record<FileSyncStatus, { icon: typeof Wifi; label: string; color: string }> = {
    idle:       { icon: WifiOff,   label: 'Not connected',  color: 'text-[rgb(var(--muted))]' },
    connecting: { icon: RefreshCw, label: 'Connecting…',    color: 'text-[rgb(var(--warning))]' },
    connected:  { icon: Wifi,      label: 'Connected',      color: 'text-[rgb(var(--success))]' },
    syncing:    { icon: RefreshCw, label: 'Syncing…',       color: 'text-[rgb(var(--accent))]' },
    error:      { icon: WifiOff,   label: 'Sync error',     color: 'text-[rgb(var(--danger))]' },
  };

  const { icon: Icon, label, color } = statusMap[status];

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={16} className={`${color} ${status === 'syncing' || status === 'connecting' ? 'animate-spin' : ''}`} />
        <span className={`text-sm font-medium ${color}`}>{label}</span>
      </div>
      {lastSynced && (
        <span className="text-xs text-[rgb(var(--muted))]">
          Last synced {new Date(lastSynced).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// ── S3 section ───────────────────────────────────────────────────────────────

function S3Section({
  cfg,
  enabled,
  onChangeCfg,
  onToggleEnabled,
}: {
  cfg: NonNullable<AppSettings['cloudSync']>['s3'];
  enabled: boolean;
  onChangeCfg: (patch: Partial<NonNullable<NonNullable<AppSettings['cloudSync']>['s3']>>) => void;
  onToggleEnabled: (v: boolean) => void;
}) {
  const s3 = {
    endpoint: cfg?.endpoint ?? 'https://s3.amazonaws.com',
    bucket: cfg?.bucket ?? '',
    region: cfg?.region ?? 'us-east-1',
    accessKeyId: cfg?.accessKeyId ?? '',
    secretAccessKey: cfg?.secretAccessKey ?? '',
    keyPrefix: cfg?.keyPrefix ?? '',
  };
  const ready = !!(s3.bucket && s3.accessKeyId && s3.secretAccessKey);

  return (
    <section className="space-y-4">
      {/* Connection status */}
      <FileSyncStatusBadge />

      <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">S3 Configuration</h3>

      <div className="form-group">
        <label className="form-label">Endpoint</label>
        <input
          className="input text-sm font-mono"
          value={s3.endpoint}
          onChange={e => onChangeCfg({ endpoint: e.target.value })}
          placeholder="https://s3.amazonaws.com"
          disabled={enabled}
        />
        <p className="form-help">
          AWS S3 default, or any S3-compatible URL (MinIO, Cloudflare R2, Backblaze B2, etc.)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="form-group">
          <label className="form-label">Bucket</label>
          <input className="input text-sm" value={s3.bucket} onChange={e => onChangeCfg({ bucket: e.target.value })} placeholder="my-bucket" disabled={enabled} />
        </div>
        <div className="form-group">
          <label className="form-label">Region</label>
          <input className="input text-sm" value={s3.region} onChange={e => onChangeCfg({ region: e.target.value })} placeholder="us-east-1" disabled={enabled} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Access Key ID</label>
        <input className="input text-sm font-mono" value={s3.accessKeyId} onChange={e => onChangeCfg({ accessKeyId: e.target.value })} placeholder="AKIAIOSFODNN7EXAMPLE" disabled={enabled} />
      </div>

      <div className="form-group">
        <label className="form-label">Secret Access Key</label>
        <input className="input text-sm font-mono" type="password" value={s3.secretAccessKey} onChange={e => onChangeCfg({ secretAccessKey: e.target.value })} placeholder="••••••••" disabled={enabled} />
      </div>

      <div className="form-group">
        <label className="form-label">Key Prefix <span className="text-[rgb(var(--muted))] font-normal">(optional)</span></label>
        <input className="input text-sm font-mono" value={s3.keyPrefix} onChange={e => onChangeCfg({ keyPrefix: e.target.value })} placeholder="lumina/" disabled={enabled} />
        <p className="form-help">
          Sync file stored at <code className="text-xs bg-black/10 dark:bg-white/10 px-1 rounded">{(s3.keyPrefix || '') + 'lumina-backup.json'}</code>
        </p>
      </div>

      <ForceSyncButtons enabled={enabled} />

      <div className="form-group">
        <div className="flex items-center justify-between">
          <div>
            <label className="form-label mb-0">Enable Sync</label>
            <p className="form-help mt-0.5">Pushes changes every 5 s · pulls remote every 60 s</p>
          </div>
          <button
            disabled={!ready}
            onClick={() => onToggleEnabled(!enabled)}
            className={`toggle ${enabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'} disabled:opacity-40`}
          >
            <span className={`toggle-thumb ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── WebDAV section ───────────────────────────────────────────────────────────

function WebDAVSection({
  cfg,
  enabled,
  onChangeCfg,
  onToggleEnabled,
}: {
  cfg: NonNullable<AppSettings['cloudSync']>['webdav'];
  enabled: boolean;
  onChangeCfg: (patch: Partial<NonNullable<NonNullable<AppSettings['cloudSync']>['webdav']>>) => void;
  onToggleEnabled: (v: boolean) => void;
}) {
  const dav = {
    url: cfg?.url ?? '',
    username: cfg?.username ?? '',
    password: cfg?.password ?? '',
    path: cfg?.path ?? '/lumina-chat',
  };
  const ready = !!dav.url;

  return (
    <section className="space-y-4">
      {/* Connection status */}
      <FileSyncStatusBadge />

      <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">WebDAV Configuration</h3>

      <div className="form-group">
        <label className="form-label">Server URL</label>
        <input
          className="input text-sm font-mono"
          value={dav.url}
          onChange={e => onChangeCfg({ url: e.target.value })}
          placeholder="https://dav.example.com/remote.php/webdav"
          disabled={enabled}
        />
        <p className="form-help">
          Nextcloud example: <code className="text-xs bg-black/10 dark:bg-white/10 px-1 rounded">.../remote.php/dav/files/username</code>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="form-group">
          <label className="form-label">Username</label>
          <input className="input text-sm" value={dav.username} onChange={e => onChangeCfg({ username: e.target.value })} placeholder="admin" disabled={enabled} />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="input text-sm" type="password" value={dav.password} onChange={e => onChangeCfg({ password: e.target.value })} placeholder="••••••••" disabled={enabled} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Path <span className="text-[rgb(var(--muted))] font-normal">(optional)</span></label>
        <input className="input text-sm font-mono" value={dav.path} onChange={e => onChangeCfg({ path: e.target.value })} placeholder="/lumina-chat" disabled={enabled} />
        <p className="form-help">
          Sync file stored at <code className="text-xs bg-black/10 dark:bg-white/10 px-1 rounded">{(dav.path || '') + '/lumina-backup.json'}</code>
        </p>
      </div>

      <ForceSyncButtons enabled={enabled} />

      <div className="form-group">
        <div className="flex items-center justify-between">
          <div>
            <label className="form-label mb-0">Enable Sync</label>
            <p className="form-help mt-0.5">Pushes changes every 5 s · pulls remote every 60 s</p>
          </div>
          <button
            disabled={!ready}
            onClick={() => onToggleEnabled(!enabled)}
            className={`toggle ${enabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'} disabled:opacity-40`}
          >
            <span className={`toggle-thumb ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Lumina Sync section ──────────────────────────────────────────────────────

function LuminaSection({
  settings,
  conversations,
  onUpdateSettings,
}: {
  settings: AppSettings;
  conversations: any[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const [syncUsername, setSyncUsername] = useState(settings.cloudSync?.email || '');
  const [syncPassword, setSyncPassword] = useState(settings.cloudSync?.password || '');
  const [syncMessage, setSyncMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.cloudSync?.enabled || false);

  const syncStatus = getSyncStatus();
  const isConnected = (['synced', 'syncing', 'error'] as SyncStatus[]).includes(syncStatus);

  useEffect(() => {
    const syncManager = getSyncManager();
    setUserId(syncManager.getUserId());
    if (autoSyncEnabled && syncUsername && syncPassword && !isConnected) handleConnect();
  }, [autoSyncEnabled, syncUsername, syncPassword, isConnected]);

  const handleConnect = async () => {
    if (!syncUsername || !syncPassword) { setSyncMessage('Please enter username and password'); return; }
    setSyncMessage('Connecting to sync server...');
    const syncManager = getSyncManager();
    const success = await syncManager.connect({ username: syncUsername, password: syncPassword });
    if (!success) setSyncMessage('Failed to connect');
    onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: syncUsername, password: syncPassword } });
  };

  const handleDisconnect = () => {
    destroySyncManager();
    setUserId(null);
    setSyncMessage('Disconnected');
  };

  const handleSyncCurrentData = async () => {
    if (!isConnected) { setSyncMessage('Please connect first'); return; }
    setSyncMessage('Syncing current data...');
    try {
      const syncManager = getSyncManager();
      for (const conversation of conversations) {
        syncManager.sendCreateConversation(conversation);
        for (const message of conversation.messages) syncManager.sendCreateMessage(conversation.id, message);
      }
      setSyncMessage('Data synced successfully!');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed');
    }
  };

  const handleEraseData = async () => {
    if (!isConnected) { setSyncMessage('Please connect first'); return; }
    if (!confirm('Are you sure you want to erase all your cloud data? This cannot be undone.')) return;
    setSyncMessage('Erasing cloud data...');
    try {
      const syncManager = getSyncManager();
      const success = await syncManager.eraseData();
      if (success) { setSyncMessage('Cloud data erased successfully'); setTimeout(() => handleDisconnect(), 2000); }
      else setSyncMessage('Failed to erase cloud data');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Erase failed');
    }
  };

  const handleOverwriteData = async () => {
    if (!isConnected) { setSyncMessage('Please connect first'); return; }
    if (!confirm('Are you sure you want to overwrite all cloud data?')) return;
    setSyncMessage('Overwriting cloud data...');
    try {
      const syncManager = getSyncManager();
      syncManager.sendOverwriteData({ conversations, settings });
      setSyncMessage('Cloud data overwritten successfully!');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Overwrite failed');
    }
  };

  return (
    <>
      <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? <Wifi size={16} className="text-[rgb(var(--success))]" /> : <WifiOff size={16} className="text-[rgb(var(--danger))]" />}
            <span className="text-sm font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
            {userId && <span className="text-xs text-[rgb(var(--muted))]">(ID: {userId.slice(0, 8)}...)</span>}
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Sync Configuration</h3>

        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Enable Auto-Sync</label>
            <button
              onClick={() => {
                const newEnabled = !autoSyncEnabled;
                setAutoSyncEnabled(newEnabled);
                onUpdateSettings({ cloudSync: { enabled: newEnabled, email: syncUsername, password: syncPassword } });
                if (!newEnabled) handleDisconnect();
                else if (syncUsername && syncPassword && !isConnected) handleConnect();
              }}
              className={`toggle ${autoSyncEnabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${autoSyncEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Automatically sync changes to cloud</p>
        </div>

        <div className="form-group">
          <label className="form-label">Username</label>
          <input type="text" value={syncUsername} onChange={e => { setSyncUsername(e.target.value); onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: e.target.value, password: syncPassword } }); }} className="input text-sm" placeholder="username" disabled={isConnected || syncStatus === 'connecting'} />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input type="password" value={syncPassword} onChange={e => { setSyncPassword(e.target.value); onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: syncUsername, password: e.target.value } }); }} className="input text-sm" placeholder="Enter password" disabled={isConnected || syncStatus === 'connecting'} />
          <p className="form-help">Your data is encrypted server-side with AES-256</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {!isConnected ? (
            <button onClick={handleConnect} disabled={syncStatus === 'connecting' || !syncUsername || !syncPassword} className="btn-primary">
              <Wifi size={16} /> {syncStatus === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <>
              <button onClick={handleDisconnect} className="btn-secondary"><WifiOff size={16} /> Disconnect</button>
              <button onClick={handleSyncCurrentData} disabled={syncStatus === 'syncing'} className="btn-primary">
                <Upload size={16} /> {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Current Data'}
              </button>
              <button onClick={handleOverwriteData} disabled={syncStatus === 'syncing'} className="btn-secondary text-orange-600 hover:text-orange-700">
                <Upload size={16} /> Overwrite Data
              </button>
            </>
          )}
          <button onClick={handleEraseData} disabled={!isConnected || syncStatus === 'syncing'} className="btn-secondary text-red-600 hover:text-red-700">
            <Trash2 size={16} /> Erase My Data
          </button>
        </div>

        {syncMessage && (
          <div className={`mt-4 p-3 rounded-xl text-sm border ${
            syncStatus === 'success' ? 'bg-[rgb(var(--success)/0.1)] border-[rgb(var(--success)/0.3)] text-[rgb(var(--success))]'
            : syncStatus === 'error' ? 'bg-[rgb(var(--danger)/0.08)] border-[rgb(var(--danger)/0.3)] text-[rgb(var(--danger))]'
            : 'bg-[rgb(var(--panel))] border-[rgb(var(--border))] text-[rgb(var(--muted))]'
          }`}>
            {syncMessage}
          </div>
        )}
      </section>
    </>
  );
}

// ── OneDrive section ─────────────────────────────────────────────────────────

function OneDriveSection({
  enabled,
  onToggleEnabled,
}: {
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
}) {
  const [connected, setConnected] = useState(isOneDriveConnected);
  const [userInfo, setUserInfo] = useState<{ displayName: string; mail: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (connected) {
      getOneDriveUserInfo().then(setUserInfo).catch(() => setUserInfo(null));
    } else {
      setUserInfo(null);
    }
  }, [connected]);

  const handleConnect = async () => {
    setSigning(true);
    setError('');
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      await startOAuthFlow(controller.signal);
      setConnected(true);
      onToggleEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setSigning(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelConnect = () => {
    abortControllerRef.current?.abort();
  };

  const handleDisconnect = () => {
    disconnectOneDrive();
    setConnected(false);
    setError('');
    onToggleEnabled(false);
  };

  return (
    <section className="space-y-4">
      <FileSyncStatusBadge />

      <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Microsoft OneDrive</h3>

      {!connected && (
        <p className="text-sm text-[rgb(var(--muted))]">
          Sign in with your Microsoft account. Files are stored in a{' '}
          <code className="bg-black/10 dark:bg-white/10 px-1 rounded">Lumina/</code> folder in your OneDrive.
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-[rgb(var(--danger)/0.4)] bg-[rgb(var(--danger)/0.06)] p-3 text-sm text-[rgb(var(--danger))]">
          {error}
        </div>
      )}

      {connected ? (
        <div className="rounded-xl border border-[rgb(var(--success)/0.4)] bg-[rgb(var(--success)/0.06)] p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[rgb(var(--success))]">Connected to OneDrive</p>
            {userInfo && (
              <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
                {userInfo.displayName}{userInfo.mail ? ` · ${userInfo.mail}` : ''}
              </p>
            )}
            <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
              Files stored in <code className="bg-black/10 dark:bg-white/10 px-1 rounded">Lumina/</code> folder
            </p>
          </div>
          <button onClick={handleDisconnect} className="btn btn-secondary text-xs flex items-center gap-1.5 shrink-0">
            <LogOut size={12} /> Disconnect
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            disabled={signing}
            onClick={handleConnect}
            className="btn btn-primary flex items-center gap-2"
          >
            <LogIn size={15} />
            {signing ? (
              <><RefreshCw size={14} className="animate-spin" /> Waiting for sign-in…</>
            ) : 'Sign in with Microsoft'}
          </button>
          {signing && (
            <button onClick={handleCancelConnect} className="btn btn-secondary text-xs">
              Cancel
            </button>
          )}
        </div>
      )}

      {connected && <ForceSyncButtons enabled={enabled} />}

      {connected && (
        <div className="form-group">
          <div className="flex items-center justify-between">
            <div>
              <label className="form-label mb-0">Enable Sync</label>
              <p className="form-help mt-0.5">Pushes changes on every edit · pulls remote every 60 s</p>
            </div>
            <button
              onClick={() => onToggleEnabled(!enabled)}
              className={`toggle ${enabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export default function CloudSyncTab({ settings, conversations, onUpdateSettings, onImportData }: CloudSyncTabProps) {
  const cs = settings.cloudSync;
  const provider: Provider = cs?.provider ?? 'lumina';

  const base = { enabled: cs?.enabled ?? false, email: cs?.email ?? '', password: cs?.password ?? '' };

  const setProvider = (p: Provider) =>
    onUpdateSettings({ cloudSync: { ...cs, ...base, provider: p, enabled: false } });

  const patchS3 = (patch: Partial<NonNullable<typeof cs>['s3']>) =>
    onUpdateSettings({ cloudSync: { ...cs, ...base, s3: { ...cs?.s3, ...patch } as any } });

  const patchWebDAV = (patch: Partial<NonNullable<typeof cs>['webdav']>) =>
    onUpdateSettings({ cloudSync: { ...cs, ...base, webdav: { ...cs?.webdav, ...patch } as any } });

  const setEnabled = (v: boolean) =>
    onUpdateSettings({ cloudSync: { ...cs, ...base, enabled: v } });

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
      <div className="border border-[rgb(var(--warning)/0.4)] bg-[rgb(var(--warning)/0.08)] rounded-xl p-4">
        <p className="text-sm">
          <strong>Warning:</strong> This feature is subject to change that may cause breaking changes and may result in your data being lost.
        </p>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-3">Sync Provider</h3>
        <ProviderDropdown value={provider} onChange={setProvider} />
      </section>

      <div className="border-t border-[rgb(var(--border))]" />

      {provider === 'lumina' && (
        <LuminaSection settings={settings} conversations={conversations} onUpdateSettings={onUpdateSettings} />
      )}

      {provider === 's3' && (
        <S3Section
          cfg={cs?.s3}
          enabled={cs?.enabled ?? false}
          onChangeCfg={patchS3}
          onToggleEnabled={setEnabled}
        />
      )}

      {provider === 'webdav' && (
        <WebDAVSection
          cfg={cs?.webdav}
          enabled={cs?.enabled ?? false}
          onChangeCfg={patchWebDAV}
          onToggleEnabled={setEnabled}
        />
      )}

      {provider === 'onedrive' && (
        <OneDriveSection
          enabled={cs?.enabled ?? false}
          onToggleEnabled={setEnabled}
        />
      )}
    </div>
  );
}
