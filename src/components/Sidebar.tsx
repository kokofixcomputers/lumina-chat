import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, Settings, Database, MessageSquare,
  Trash2, Star, ChevronDown, X, Edit2, Cloud, RefreshCw, Link, BookOpen, Download,
  Code2, MessageCircle, FolderOpen, Plus, Image, Monitor, PanelLeftClose, PanelLeft
} from 'lucide-react';
import type { Conversation, AppSettings } from '../types';
import type { CodeSession } from '../utils/codeSessionDB';
import { imageDB, type GeneratedImage } from '../utils/imageDB';
import { tauriUtils } from '../utils/tauri';
import { extensionUIRegistry } from '../extensions/extensionUIRegistry';
import Modal from './Modal';

interface SidebarProps {
  conversations: Conversation[];
  activeConvId: string | null;
  currentPanel?: string;
  settings: AppSettings;
  onSelectConv: (id: string) => void;
  onGoHome: () => void;
  onDeleteConv: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  onOpenViewChat: () => void;
  onOpenFineTuning: () => void;
  onToggleTheme: () => void;
  isOpen: boolean;
  onClose: () => void;
  syncStatus?: 'synced' | 'syncing' | 'connecting' | 'error' | 'disabled' | 'success';
  // App mode
  appMode?: 'chat' | 'code' | 'image' | 'cowork';
  onModeChange?: (mode: 'chat' | 'code' | 'image' | 'cowork') => void;
  isDesktop?: boolean;
  codeSessions?: CodeSession[];
  activeCodeSessionId?: string | null;
  onSelectCodeSession?: (id: string) => void;
  onNewCodeSession?: () => void;
  onDeleteCodeSession?: (id: string) => void;
  onRenameCodeSession?: (id: string, title: string) => void;
  onSelectImage?: (id: string) => void;
  coworkSessions?: import('../utils/coworkSessionDB').CoworkSession[];
  activeCoworkSessionId?: string | null;
  onSelectCoworkSession?: (id: string) => void;
  onNewCoworkSession?: () => void;
  onDeleteCoworkSession?: (id: string) => void;
  onRenameCoworkSession?: (id: string, title: string) => void;
}

export default function Sidebar({
  conversations,
  activeConvId,
  currentPanel,
  settings,
  onSelectConv,
  onGoHome,
  onDeleteConv,
  onUpdateTitle,
  onOpenSettings,
  onOpenProviders,
  onOpenViewChat,
  onOpenFineTuning,
  onToggleTheme,
  isOpen,
  onClose,
  syncStatus = 'disabled',
  appMode = 'chat' as 'chat' | 'code' | 'image' | 'cowork',
  onModeChange,
  isDesktop = false,
  codeSessions = [],
  activeCodeSessionId,
  onSelectCodeSession,
  onNewCodeSession,
  onDeleteCodeSession,
  onRenameCodeSession,
  onSelectImage,
  coworkSessions = [],
  activeCoworkSessionId,
  onSelectCoworkSession,
  onNewCoworkSession,
  onDeleteCoworkSession,
  onRenameCoworkSession,
}: SidebarProps) {
  const [hoverDel, setHoverDel] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [, extTick] = useState(0);
  useEffect(() => {
    const h = () => extTick(n => n + 1);
    window.addEventListener('ext-ui-update', h);
    return () => window.removeEventListener('ext-ui-update', h);
  }, []);
  const extSidebarSections = extensionUIRegistry.getSidebarSections();
  const extSidebarButtons = extensionUIRegistry.getButtons('sidebar');

  const setAndPersistCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
    window.dispatchEvent(new CustomEvent('lumina:sidebar:changed', { detail: { collapsed: next } }));
  }, []);

  const toggleCollapse = () => setAndPersistCollapsed(!collapsed);

  // Extensions can control the sidebar via lumina:sidebar events
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent).detail as { collapsed?: boolean; toggle?: boolean };
      if (detail.toggle) {
        setCollapsed(prev => {
          const next = !prev;
          localStorage.setItem('sidebar-collapsed', String(next));
          window.dispatchEvent(new CustomEvent('lumina:sidebar:changed', { detail: { collapsed: next } }));
          return next;
        });
      } else if (typeof detail.collapsed === 'boolean') {
        setAndPersistCollapsed(detail.collapsed);
      }
    };
    window.addEventListener('lumina:sidebar', h);
    return () => window.removeEventListener('lumina:sidebar', h);
  }, [setAndPersistCollapsed]);
  const [searchQ, setSearchQ] = useState('');
  const [todayOpen, setTodayOpen] = useState(true);
  const [olderOpen, setOlderOpen] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; name?: string; body?: string } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [sidebarImages, setSidebarImages] = useState<GeneratedImage[]>([]);

  const currentSha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined;

  // Version comparison function
  const compareVersions = (version1: string, version2: string): number => {
    const v1parts = version1.replace('v', '').split('.').map(Number);
    const v2parts = version2.replace('v', '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    return 0;
  };

  useEffect(() => {
    const checkUpdates = async () => {
      // Check for web version updates (existing logic)
      if (currentSha) {
        try {
          const res = await fetch('/api/hash');
          if (res.ok) {
            const { sha } = await res.json();
            if (sha && sha !== currentSha) {
              setUpdateAvailable(true);
              return; // Web update takes priority
            }
          }
        } catch { /* ignore network errors */ }
      }

      // Check for Tauri app updates
      if (tauriUtils.isTauri) {
        try {
          const currentVersion = await tauriUtils.getVersion();
          
          // Skip update check for nightly builds
          if (currentVersion.toLowerCase().includes('0.0.0')) {
            return;
          }

          // Fetch latest releases from GitHub
          const response = await fetch('https://api.github.com/repos/kokofixcomputers/lumina-chat/releases');
          if (response.ok) {
            const releases = await response.json();
            
            // Find the latest release (excluding pre-releases)
            const latestRelease = releases.find((release: any) => 
              !release.prerelease && !release.draft
            );
            
            if (latestRelease && latestRelease.tag_name) {
              const latestVersion = latestRelease.tag_name;
              
              // Compare versions
              if (compareVersions(latestVersion, currentVersion) > 0) {
                setUpdateAvailable(true);
                setUpdateInfo({
                  version: latestVersion,
                  url: latestRelease.html_url,
                  name: latestRelease.name || undefined,
                  body: latestRelease.body || undefined,
                });
              }
            }
          }
        } catch (error) {
          console.error('Error checking for updates:', error);
        }
      }
    };

    checkUpdates();
    const id = setInterval(checkUpdates, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(id);
  }, [currentSha]);

  useEffect(() => {
    if (appMode !== 'image') return;
    imageDB.getAll().then(setSidebarImages);
  }, [appMode]);

  const now = Date.now();

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return conversations;
    const q = searchQ.toLowerCase();
    return conversations.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQ]);

  const today = filtered.filter(c => now - c.updatedAt < 86400000);
  const older = filtered.filter(c => now - c.updatedAt >= 86400000);

  const ConvItem = ({ conv }: { conv: Conversation }) => {
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(conv.title);
    
    return (
      <div
        className={`sidebar-item group relative ${activeConvId === conv.id && currentPanel !== 'fine-tuning' ? 'active' : ''}`}
        onClick={() => { if (!editing) { onSelectConv(conv.id); onClose(); } }}
        onMouseEnter={() => setHoverDel(conv.id)}
        onMouseLeave={() => setHoverDel(null)}
      >
        {activeConvId === conv.id && currentPanel !== 'fine-tuning'
          ? <Star size={13} className="shrink-0 opacity-50" />
          : <MessageSquare size={13} className="shrink-0 opacity-30" />
        }
        {editing ? (
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={() => { onUpdateTitle(conv.id, editTitle); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onUpdateTitle(conv.id, editTitle); setEditing(false); } }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="truncate flex-1 text-[13px]" onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}>{conv.title}</span>
        )}
        {hoverDel === conv.id && !editing && (
          <>
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="w-5 h-5 rounded flex items-center justify-center text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors shrink-0"
            >
              <Edit2 size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDeleteConv(conv.id); }}
              className="w-5 h-5 rounded flex items-center justify-center text-[rgb(var(--muted))] hover:text-red-500 transition-colors shrink-0"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>
    );
  };

  const CodeSessionItem = ({ session, isActive, workspaceName, onSelect, onDelete, onRename }: {
    session: CodeSession; isActive: boolean; workspaceName: string;
    onSelect: () => void; onDelete: () => void; onRename: (title: string) => void;
  }) => {
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(session.title || 'Untitled Session');
    const commit = () => { onRename(editTitle); setEditing(false); };
    return (
      <div
        className={`sidebar-item group relative ${isActive ? 'active' : ''}`}
        onClick={() => { if (!editing) onSelect(); }}
      >
        <Code2 size={13} className="shrink-0 opacity-50" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
              className="w-full bg-transparent text-[13px] outline-none"
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="truncate text-[13px]" onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}>
              {session.title || 'Untitled Session'}
            </p>
          )}
          <p className={`truncate text-[11px] ${isActive ? 'opacity-60' : 'text-[rgb(var(--muted))]'}`}>{workspaceName}</p>
        </div>
        {!editing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-all">
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="w-5 h-5 rounded flex items-center justify-center text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
            >
              <Edit2 size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="w-5 h-5 rounded flex items-center justify-center text-[rgb(var(--muted))] hover:text-red-500 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const modeMeta: Record<'chat' | 'code' | 'image' | 'cowork', { label: string; icon: React.ReactNode; desktopOnly: boolean }> = {
    chat: { label: 'Chat', icon: <MessageCircle size={18} />, desktopOnly: false },
    code: { label: 'Code', icon: <Code2 size={18} />, desktopOnly: true },
    image: { label: 'Image', icon: <Image size={18} />, desktopOnly: false },
    cowork: { label: 'Cowork', icon: <Monitor size={18} />, desktopOnly: true },
  };

  const handleNew = () => {
    if (appMode === 'code') onNewCodeSession?.();
    else if (appMode === 'cowork') onNewCoworkSession?.();
    else onGoHome();
    onClose();
  };

  const panelTitle = appMode === 'code' ? 'Code Sessions' : appMode === 'cowork' ? 'Cowork Sessions' : appMode === 'image' ? 'Images' : 'Chats';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <div data-tour="sidebar" className={`fixed inset-y-0 left-0 md:relative z-50 flex h-full transition-transform duration-300 md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>

        {/* ── Icon rail — always visible, holds primary nav ── */}
        <nav className="nav-rail">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center text-white dark:text-black text-[12px] font-bold shrink-0 select-none shadow-sm relative">
            {(settings as any).username?.[0]?.toUpperCase() ?? 'k'}
            <Cloud
              size={11}
              className={`absolute -bottom-1 -right-1 rounded-full bg-[rgb(var(--panel))] p-[1px] ${
                syncStatus === 'synced' ? 'text-green-500' :
                syncStatus === 'syncing' ? 'text-blue-500 animate-pulse' :
                syncStatus === 'error' ? 'text-red-500' :
                'text-gray-400'
              }`}
            />
          </div>

          {onModeChange && (
            <div className="flex flex-col items-center gap-1 mt-3">
              {(Object.keys(modeMeta) as Array<'chat' | 'code' | 'image' | 'cowork'>).map(id => {
                const { label, icon, desktopOnly } = modeMeta[id];
                const unavailable = desktopOnly && !isDesktop;
                return (
                  <button
                    key={id}
                    className={`rail-btn ${appMode === id ? 'active' : ''}`}
                    onClick={() => !unavailable && onModeChange(id)}
                    disabled={unavailable}
                    title={unavailable ? `${label} is desktop-only` : label}
                  >
                    {icon}
                  </button>
                );
              })}
            </div>
          )}

          <div className="rail-divider" />

          <button className="rail-btn" data-tour="new-chat" onClick={handleNew} title={appMode === 'image' ? 'New chat' : 'New'}>
            <Plus size={18} />
          </button>

          <div className="flex-1" />

          {updateAvailable && (
            <button
              className="rail-btn text-green-500 hover:text-green-400"
              title={tauriUtils.isTauri && updateInfo ? `Update available (${updateInfo.version})` : 'Update available'}
              onClick={() => {
                if (updateInfo && tauriUtils.isTauri) setShowUpdateModal(true);
                else window.location.reload();
              }}
            >
              {tauriUtils.isTauri && updateInfo ? <Download size={18} /> : <RefreshCw size={18} />}
            </button>
          )}
          <button className="rail-btn" onClick={onOpenProviders} data-tour="providers-btn" title="Providers">
            <Database size={18} />
          </button>
          <button className="rail-btn" onClick={onOpenSettings} data-tour="settings-btn" title="Settings">
            <Settings size={18} />
          </button>
          <button onClick={toggleCollapse} className="rail-btn hidden md:flex" title={collapsed ? 'Expand panel' : 'Collapse panel'}>
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </nav>

        {/* ── Conversation / session list panel ── */}
        <aside className={`sidebar-panel ${collapsed ? 'collapsed' : ''}`}>
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[rgb(var(--border)/0.5)] shrink-0">
        <span className="text-[14px] font-semibold truncate flex-1 select-none">{panelTitle}</span>
        <button onClick={onClose} className="md:hidden btn-icon w-7 h-7">
          <X size={15} />
        </button>
      </div>

      {/* Search — always visible for chat mode */}
      {appMode === 'chat' && (
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgb(var(--border))] bg-black/[0.03] dark:bg-white/[0.04]">
            <Search size={13} className="text-[rgb(var(--muted))] shrink-0" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search conversations..."
              className="flex-1 min-w-0 bg-transparent text-[13px] outline-none text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors shrink-0">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Secondary chat-mode nav */}
      {appMode === 'chat' && (
        <div className="px-1 pt-1.5 space-y-0.5 shrink-0">
          <button className="sidebar-item w-full" onClick={onOpenViewChat}>
            <Link size={15} />
            <span>View Chat</span>
          </button>
          <button className={`sidebar-item w-full ${currentPanel === 'fine-tuning' ? 'active' : ''}`} onClick={() => { onOpenFineTuning(); onClose(); }}>
            <BookOpen size={15} />
            <span>Fine-tuning</span>
          </button>
        </div>
      )}

      {/* Conversations / Code sessions list */}
      <div className="flex-1 overflow-y-auto mt-3">
        {appMode === 'chat' && (
          <>
            {filtered.length === 0 && searchQ ? (
              <p className="text-[12px] text-[rgb(var(--muted))] text-center py-6 px-4">No conversations match "{searchQ}"</p>
            ) : (
              <>
                {today.length > 0 && (
                  <div className="mb-1">
                    <button
                      className="flex items-center gap-1 px-5 py-1 text-[11px] font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors w-full"
                      onClick={() => setTodayOpen(p => !p)}
                    >
                      <ChevronDown size={11} className={`transition-transform ${todayOpen ? '' : '-rotate-90'}`} />
                      <span>Today</span>
                    </button>
                    {todayOpen && today.map(c => <ConvItem key={c.id} conv={c} />)}
                  </div>
                )}
                {older.length > 0 && (
                  <div className="mb-1">
                    <button
                      className="flex items-center gap-1 px-5 py-1 text-[11px] font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors w-full"
                      onClick={() => setOlderOpen(p => !p)}
                    >
                      <ChevronDown size={11} className={`transition-transform ${olderOpen ? '' : '-rotate-90'}`} />
                      <span>Earlier</span>
                    </button>
                    {olderOpen && older.map(c => <ConvItem key={c.id} conv={c} />)}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {appMode === 'code' && (
          <>
            {codeSessions.length === 0 ? (
              <p className="text-[12px] text-[rgb(var(--muted))] text-center py-6 px-4">No sessions yet.<br/>Click New Session to start.</p>
            ) : (
              codeSessions.map(s => {
                const workspaceName = s.workspace.split('/').pop() || s.workspace;
                const isActive = s.id === activeCodeSessionId;
                return (
                  <CodeSessionItem
                    key={s.id}
                    session={s}
                    isActive={isActive}
                    workspaceName={workspaceName}
                    onSelect={() => { onSelectCodeSession?.(s.id); onClose(); }}
                    onDelete={() => onDeleteCodeSession?.(s.id)}
                    onRename={(title) => onRenameCodeSession?.(s.id, title)}
                  />
                );
              })
            )}
          </>
        )}

        {appMode === 'cowork' && (
          <>
            {coworkSessions.length === 0 ? (
              <p className="text-[12px] text-[rgb(var(--muted))] text-center py-6 px-4">No sessions yet.<br/>Click New Session to start.</p>
            ) : (
              coworkSessions.map(s => {
                const isActive = s.id === activeCoworkSessionId;
                return (
                  <CodeSessionItem
                    key={s.id}
                    session={{ ...s, workspace: '' } as any}
                    isActive={isActive}
                    workspaceName="Cowork"
                    onSelect={() => { onSelectCoworkSession?.(s.id); onClose(); }}
                    onDelete={() => onDeleteCoworkSession?.(s.id)}
                    onRename={(title) => onRenameCoworkSession?.(s.id, title)}
                  />
                );
              })
            )}
          </>
        )}

        {appMode === 'image' && (
          <>
            {sidebarImages.length === 0 ? (
              <p className="text-[12px] text-[rgb(var(--muted))] text-center py-6 px-4">No images yet.<br/>Generate one to get started.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 px-2 pt-1">
                {sidebarImages.map(img => (
                  <button
                    key={img.id}
                    onClick={() => { onSelectImage?.(img.id); onClose(); }}
                    className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-[rgb(var(--accent))] transition-all"
                    title={img.prompt}
                  >
                    <img src={img.b64} alt={img.prompt} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Extension sidebar sections/buttons */}
      {(extSidebarSections.length > 0 || extSidebarButtons.length > 0) && (
        <div className="border-t border-[rgb(var(--border)/0.5)] px-1 py-2 space-y-0.5 shrink-0">
          {extSidebarSections.map(sec => (
            <div key={sec.id} className="px-1 space-y-0.5 border-t border-[rgb(var(--border))] pt-1 mt-1 first:border-t-0 first:pt-0 first:mt-0">
              {sec.title && <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] px-3 py-1">{sec.title}</p>}
              {sec.items.map(item => (
                <button key={item.id} className="sidebar-item w-full" onClick={item.onClick}>
                  {item.icon && <span style={{ fontSize: 15 }}>{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
          {extSidebarButtons.map(btn => (
            <button key={btn.id} className="sidebar-item w-full" title={btn.tooltip} onClick={btn.onClick}>
              {btn.icon && <span style={{ fontSize: 15 }}>{btn.icon}</span>}
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      )}
        </aside>
      </div>

      {/* Update available — changelog + manual-download link, no auto-update */}
      <Modal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        panelClassName="glass-panel-strong rounded-3xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgb(var(--border))] shrink-0">
          <Download size={16} className="text-green-500 shrink-0" />
          <h3 className="text-sm font-semibold truncate flex-1">
            Update available{updateInfo?.version ? ` — ${updateInfo.version}` : ''}
          </h3>
          <button className="btn-icon w-7 h-7" onClick={() => setShowUpdateModal(false)}><X size={15} /></button>
        </div>
        <div className="overflow-y-auto p-5 flex-1 min-h-0 space-y-3">
          {updateInfo?.name && (
            <p className="text-sm font-medium text-[rgb(var(--text))]">{updateInfo.name}</p>
          )}
          <pre className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words font-sans text-[rgb(var(--text))] bg-black/[0.03] dark:bg-white/[0.04] rounded-xl p-3">
            {updateInfo?.body?.trim() || 'No changelog provided for this release.'}
          </pre>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[rgb(var(--border))] shrink-0">
          <button
            className="btn-primary flex-1 justify-center gap-1.5 py-1.5"
            onClick={() => { if (updateInfo?.url) tauriUtils.openUrl(updateInfo.url); setShowUpdateModal(false); }}
          >
            <Download size={13} /> Update
          </button>
          <button className="btn-secondary flex-1 justify-center gap-1.5 py-1.5" onClick={() => setShowUpdateModal(false)}>
            Later
          </button>
        </div>
      </Modal>
    </>
  );
}
