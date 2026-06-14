import { useState, useEffect } from 'react';
import { Upload, Download, Trash2, Wifi, WifiOff } from 'lucide-react';
import type { AppSettings } from '../../types';
import { getSyncManager, destroySyncManager } from '../../utils/syncManager';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../../utils/syncStatus';
import type { SyncActionTypes } from '../../types/sync';

interface CloudSyncTabProps {
  settings: AppSettings;
  conversations: any[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onImportData: (data: any) => void;
  onSyncAction?: (action: SyncActionTypes) => void;
}

export default function CloudSyncTab({ settings, conversations, onUpdateSettings, onImportData, onSyncAction }: CloudSyncTabProps) {
  const [syncUsername, setSyncUsername] = useState(settings.cloudSync?.email || '');
  const [syncPassword, setSyncPassword] = useState(settings.cloudSync?.password || '');
  const [syncMessage, setSyncMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.cloudSync?.enabled || false);
  
  // Use centralized sync status
  const syncStatus = getSyncStatus();
  const isConnected = syncStatus === 'synced';

  useEffect(() => {
    // Get existing sync manager (initialized in App.tsx)
    const syncManager = getSyncManager();
    
    // Update connection state
    setUserId(syncManager.getUserId());
    
    // Auto-connect if credentials are available and auto-sync is enabled
    if (autoSyncEnabled && syncUsername && syncPassword && !isConnected) {
      handleConnect();
    }
  }, [autoSyncEnabled, syncUsername, syncPassword, isConnected]);

  const handleConnect = async () => {
    if (!syncUsername || !syncPassword) {
      setSyncMessage('Please enter username and password');
      return;
    }

    setSyncMessage('Connecting to sync server...');

    const syncManager = getSyncManager();
    const success = await syncManager.connect({ username: syncUsername, password: syncPassword });
    
    if (!success) {
      setSyncMessage('Failed to connect');
    }

    // Update settings with credentials
    onUpdateSettings({ 
      cloudSync: { 
        enabled: autoSyncEnabled, 
        email: syncUsername, 
        password: syncPassword 
      } 
    });
  };

  const handleDisconnect = () => {
    destroySyncManager();
    setUserId(null);
    setSyncMessage('Disconnected');
  };

  const handleSyncCurrentData = async () => {
    if (!isConnected) {
      setSyncMessage('Please connect first');
      return;
    }

    setSyncMessage('Syncing current data...');

    try {
      const syncManager = getSyncManager();
      
      // Send all current conversations as create actions
      for (const conversation of conversations) {
        syncManager.sendCreateConversation(conversation);
        
        // Send all messages in the conversation
        for (const message of conversation.messages) {
          syncManager.sendCreateMessage(conversation.id, message);
        }
      }

      setSyncMessage('Data synced successfully!');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed');
    }
  };

  const handleEraseData = async () => {
    if (!isConnected) {
      setSyncMessage('Please connect first');
      return;
    }

    if (!confirm('Are you sure you want to erase all your cloud data? This cannot be undone.')) return;

    setSyncMessage('Erasing cloud data...');

    try {
      const syncManager = getSyncManager();
      const success = await syncManager.eraseData();
      
      if (success) {
        setSyncMessage('Cloud data erased successfully');
        // Optionally disconnect after erasing
        setTimeout(() => {
          handleDisconnect();
        }, 2000);
      } else {
        setSyncMessage('Failed to erase cloud data');
      }
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Erase failed');
    }
  };

  const handleOverwriteData = async () => {
    if (!isConnected) {
      setSyncMessage('Please connect first');
      return;
    }
    if (!confirm('Are you sure you want to overwrite all cloud data? This will replace everything on the server with your local data.')) return;
    
    setSyncMessage('Overwriting cloud data...');

    try {
      const syncManager = getSyncManager();
      
      // Send complete data overwrite
      syncManager.sendOverwriteData({
        conversations: conversations,
        settings: settings
      });

      setSyncMessage('Cloud data overwritten successfully!');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Overwrite failed');
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
        {!cloudSyncEnabled ? (
          <div className="border border-[rgb(var(--danger)/0.4)] bg-[rgb(var(--danger)/0.08)] rounded-xl p-4">
            <p className="text-sm text-[rgb(var(--danger))]">
              <strong>Cloud Sync Unavailable:</strong> The database connection is currently unavailable. This feature has been disabled.
            </p>
          </div>
        ) : (
          <>
            <div className="border border-[rgb(var(--warning)/0.4)] bg-[rgb(var(--warning)/0.08)] rounded-xl p-4">
              <p className="text-sm text-[rgb(var(--text))]">
                <strong>Warning:</strong> This feature is subject to change that may cause breaking changes and may result in your data being lost.
              </p>
            </div>

            {/* Connection Status */}
            <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isConnected
                    ? <Wifi size={16} className="text-[rgb(var(--success))]" />
                    : <WifiOff size={16} className="text-[rgb(var(--danger))]" />}
                  <span className="text-sm font-medium text-[rgb(var(--text))]">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                  {userId && <span className="text-xs text-[rgb(var(--muted))]">(ID: {userId.slice(0, 8)}...)</span>}
                </div>
                {isNewUser && (
                  <span className="badge-secondary text-xs">New Account</span>
                )}
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
                      if (!newEnabled) {
                        handleDisconnect();
                      } else if (syncUsername && syncPassword && !isConnected) {
                        // Only connect if not already connected
                        handleConnect();
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
                <label className="form-label">Username</label>
                <input
                  type="text"
                  value={syncUsername}
                  onChange={e => {
                    setSyncUsername(e.target.value);
                    onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: e.target.value, password: syncPassword } });
                  }}
                  className="input text-sm"
                  placeholder="username"
                  disabled={isConnected || syncStatus === 'connecting'}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  value={syncPassword}
                  onChange={e => {
                    setSyncPassword(e.target.value);
                    onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: syncUsername, password: e.target.value } });
                  }}
                  className="input text-sm"
                  placeholder="Enter password"
                  disabled={isConnected || syncStatus === 'connecting'}
                />
                <p className="form-help">Your data is encrypted server-side with AES-256</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {!isConnected ? (
                  <button
                    onClick={handleConnect}
                    disabled={syncStatus === 'connecting' || !syncUsername || !syncPassword}
                    className="btn-primary"
                  >
                    <Wifi size={16} />
                    {syncStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleDisconnect}
                      className="btn-secondary"
                    >
                      <WifiOff size={16} />
                      Disconnect
                    </button>
                    <button
                      onClick={handleSyncCurrentData}
                      disabled={syncStatus === 'syncing'}
                      className="btn-primary"
                    >
                      <Upload size={16} />
                      {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Current Data'}
                    </button>
                    <button
                      onClick={handleOverwriteData}
                      disabled={!isConnected || syncStatus === 'syncing'}
                      className="btn-secondary text-orange-600 hover:text-orange-700"
                    >
                      <Upload size={16} />
                      Overwrite Data
                    </button>
                  </>
                )}
                
                <button
                  onClick={handleEraseData}
                  disabled={!isConnected || syncStatus === 'syncing'}
                  className="btn-secondary text-red-600 hover:text-red-700"
                >
                  <Trash2 size={16} />
                  Erase My Data
                </button>
              </div>

              {syncMessage && (
                <div className={`mt-4 p-3 rounded-xl text-sm border ${
                  syncStatus === 'success'
                    ? 'bg-[rgb(var(--success)/0.1)] border-[rgb(var(--success)/0.3)] text-[rgb(var(--success))]'
                    : syncStatus === 'error'
                    ? 'bg-[rgb(var(--danger)/0.08)] border-[rgb(var(--danger)/0.3)] text-[rgb(var(--danger))]'
                    : 'bg-[rgb(var(--panel))] border-[rgb(var(--border))] text-[rgb(var(--muted))]'
                }`}>
                  {syncMessage}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
