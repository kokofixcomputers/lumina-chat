import { useState } from 'react';
import { Upload, Download, Trash2 } from 'lucide-react';
import type { AppSettings } from '../../types';
import { encryptData, decryptData } from '../../utils/encryption';

interface CloudSyncTabProps {
  settings: AppSettings;
  conversations: any[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onImportData: (data: any) => void;
}

export default function CloudSyncTab({ settings, conversations, onUpdateSettings, onImportData }: CloudSyncTabProps) {
  const [syncEmail, setSyncEmail] = useState(settings.cloudSync?.email || '');
  const [syncPassword, setSyncPassword] = useState(settings.cloudSync?.password || '');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [serverData, setServerData] = useState<any>(null);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.cloudSync?.enabled || false);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
        {!cloudSyncEnabled ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>Cloud Sync Unavailable:</strong> The database connection is currently unavailable. This feature has been disabled.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Warning:</strong> While there is little chance that your data get's stolen from our servers, the chance is not 0%. We are not responsible for stolen data.
              </p>
            </div>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Sync Configuration</h3>
              <div className="form-group">
                <label className="form-label">Sync System</label>
                <div className="flex gap-2">
                  {(['old', 'new'] as const).map(sys => (
                    <button
                      key={sys}
                      onClick={() => onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: syncEmail, password: syncPassword, syncSystem: sys } })}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all border ${
                        (settings.cloudSync?.syncSystem ?? 'old') === sys
                          ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] border-transparent'
                          : 'border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {sys === 'old' ? 'Old System' : 'New System'}
                    </button>
                  ))}
                </div>
                <p className="form-help">New System uses a live WebSocket connection for real-time sync.</p>
              </div>
              <div className="form-group">
                <div className="flex items-center justify-between">
                  <label className="form-label mb-0">Enable Auto-Sync</label>
                  <button
                    onClick={() => {
                      const newEnabled = !autoSyncEnabled;
                      setAutoSyncEnabled(newEnabled);
                      onUpdateSettings({ cloudSync: { enabled: newEnabled, email: syncEmail, password: syncPassword } });
                      if (!newEnabled) {
                        setSyncStatus('idle');
                      } else if (syncEmail && syncPassword) {
                        setSyncStatus('idle');
                      }
                    }}
                    className={`toggle ${autoSyncEnabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                  >
                    <span className={`toggle-thumb ${autoSyncEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
                <p className="form-help">Automatically sync changes to cloud</p>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  value={syncEmail}
                  onChange={e => {
                    setSyncEmail(e.target.value);
                    onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: e.target.value, password: syncPassword } });
                  }}
                  className="input text-sm"
                  placeholder="your@email.com"
                  disabled={syncStatus === 'loading'}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password (AES-256 Encryption)</label>
                <input
                  type="password"
                  value={syncPassword}
                  onChange={e => {
                    setSyncPassword(e.target.value);
                    onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: syncEmail, password: e.target.value } });
                  }}
                  className="input text-sm"
                  placeholder="Enter encryption password"
                  disabled={syncStatus === 'loading'}
                />
                <p className="form-help">Your data is encrypted client-side before upload</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    if (!syncEmail || !syncPassword) {
                      setSyncMessage('Please enter email and password');
                      setSyncStatus('error');
                      return;
                    }
                    setSyncStatus('loading');
                    setSyncMessage('Uploading data...');
                    try {
                      const encrypted = encryptData({ settings, conversations }, syncPassword);
                      const response = await fetch('https://lumina-chat-rho.vercel.app/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'save', email: syncEmail, data: encrypted })
                      });
                      const result = await response.json();
                      if (result.disabled) {
                        setCloudSyncEnabled(false);
                        setSyncMessage('Cloud sync is unavailable');
                        setSyncStatus('error');
                      } else if (result.success) {
                        setSyncMessage('Data uploaded successfully!');
                        setSyncStatus('success');
                      } else {
                        throw new Error(result.error || 'Upload failed');
                      }
                    } catch (err) {
                      setSyncMessage(err instanceof Error ? err.message : 'Upload failed');
                      setSyncStatus('error');
                    }
                  }}
                  disabled={syncStatus === 'loading'}
                  className="btn-primary"
                >
                  <Upload size={16} />
                  {syncStatus === 'loading' ? 'Uploading...' : 'Upload to Cloud'}
                </button>
                <button
                  onClick={async () => {
                    if (!syncEmail || !syncPassword) {
                      setSyncMessage('Please enter email and password');
                      setSyncStatus('error');
                      return;
                    }
                    setSyncStatus('loading');
                    setSyncMessage('Checking for data...');
                    try {
                      const response = await fetch('https://lumina-chat-rho.vercel.app/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'get', email: syncEmail })
                      });
                      const result = await response.json();
                      if (result.disabled) {
                        setCloudSyncEnabled(false);
                        setSyncMessage('Cloud sync is unavailable');
                        setSyncStatus('error');
                      } else if (!result.exists) {
                        setSyncMessage('No data found for this email');
                        setSyncStatus('error');
                      } else {
                        const decrypted = decryptData(result.data, syncPassword);
                        if (!decrypted) {
                          setSyncMessage('Invalid password');
                          setSyncStatus('error');
                        } else {
                          setServerData(decrypted);
                          setShowConflictModal(true);
                          setSyncStatus('idle');
                          setSyncMessage('');
                        }
                      }
                    } catch (err) {
                      setSyncMessage(err instanceof Error ? err.message : 'Download failed');
                      setSyncStatus('error');
                    }
                  }}
                  disabled={syncStatus === 'loading'}
                  className="btn-secondary"
                >
                  <Download size={16} />
                  {syncStatus === 'loading' ? 'Checking...' : 'Download from Cloud'}
                </button>
                <button
                  onClick={async () => {
                    if (!syncEmail) {
                      setSyncMessage('Please enter email address');
                      setSyncStatus('error');
                      return;
                    }
                    if (!confirm('Are you sure you want to erase all your cloud data? This cannot be undone.')) return;
                    setSyncStatus('loading');
                    setSyncMessage('Erasing data...');
                    try {
                      const response = await fetch('https://lumina-chat-rho.vercel.app/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'delete', email: syncEmail })
                      });
                      const result = await response.json();
                      if (result.disabled) {
                        setCloudSyncEnabled(false);
                        setSyncMessage('Cloud sync is unavailable');
                        setSyncStatus('error');
                      } else if (result.success) {
                        setSyncMessage('Cloud data erased successfully');
                        setSyncStatus('success');
                      } else {
                        throw new Error(result.error || 'Delete failed');
                      }
                    } catch (err) {
                      setSyncMessage(err instanceof Error ? err.message : 'Delete failed');
                      setSyncStatus('error');
                    }
                  }}
                  disabled={syncStatus === 'loading'}
                  className="btn-secondary text-red-600 hover:text-red-700"
                >
                  <Trash2 size={16} />
                  Erase My Data
                </button>
              </div>
              {syncMessage && (
                <div className={`mt-4 p-3 rounded-xl text-sm ${
                  syncStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' :
                  syncStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200' :
                  'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                }`}>
                  {syncMessage}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Conflict Resolution Modal */}
      {showConflictModal && serverData && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowConflictModal(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-lg font-semibold">Data Conflict Detected</h3>
              <p className="text-sm text-[rgb(var(--muted))]">
                We found existing data on the server for this email. What would you like to do?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    onImportData(serverData);
                    setShowConflictModal(false);
                    setSyncMessage('Local data overwritten with server data');
                    setSyncStatus('success');
                  }}
                  className="w-full btn-primary justify-center"
                >
                  Overwrite Local Data
                </button>
                <button
                  onClick={async () => {
                    setSyncStatus('loading');
                    try {
                      const encrypted = encryptData({ settings, conversations }, syncPassword);
                      const response = await fetch('https://lumina-chat-rho.vercel.app/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'save', email: syncEmail, data: encrypted })
                      });
                      const result = await response.json();
                      if (result.success) {
                        setShowConflictModal(false);
                        setSyncMessage('Server data overwritten with local data');
                        setSyncStatus('success');
                      } else {
                        throw new Error(result.error || 'Upload failed');
                      }
                    } catch (err) {
                      setSyncMessage(err instanceof Error ? err.message : 'Upload failed');
                      setSyncStatus('error');
                      setShowConflictModal(false);
                    }
                  }}
                  className="w-full btn-secondary justify-center"
                >
                  Overwrite Server Data
                </button>
                <button
                  onClick={() => {
                    setShowConflictModal(false);
                    setSyncMessage('Sync cancelled');
                    setSyncStatus('idle');
                  }}
                  className="w-full btn-secondary justify-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
