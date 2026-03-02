import { useState, useMemo } from 'react';
import {
  Search, Home, Settings, Database, MessageSquare,
  Trash2, Star, ChevronDown, X, Edit2
} from 'lucide-react';
import type { Conversation, AppSettings } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeConvId: string | null;
  settings: AppSettings;
  onSelectConv: (id: string) => void;
  onGoHome: () => void;
  onDeleteConv: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  onToggleTheme: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  conversations,
  activeConvId,
  settings,
  onSelectConv,
  onGoHome,
  onDeleteConv,
  onUpdateTitle,
  onOpenSettings,
  onOpenProviders,
  isOpen,
  onClose,
}: SidebarProps) {
  const [hoverDel, setHoverDel] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [todayOpen, setTodayOpen] = useState(true);
  const [olderOpen, setOlderOpen] = useState(true);

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
        className={`sidebar-item group relative ${activeConvId === conv.id ? 'active' : ''}`}
        onClick={() => { if (!editing) { onSelectConv(conv.id); onClose(); } }}
        onMouseEnter={() => setHoverDel(conv.id)}
        onMouseLeave={() => setHoverDel(null)}
      >
        {activeConvId === conv.id
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

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      <aside className={`sidebar fixed md:relative z-50 transition-transform duration-300 md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
      {/* User header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[rgb(var(--border))]">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center text-white dark:text-black text-[10px] font-bold shrink-0 select-none shadow-sm">
          {(settings as any).username?.[0]?.toUpperCase() ?? 'k'}
        </div>
        <span className="text-[13px] font-medium truncate flex-1 select-none">You</span>
        <button onClick={onClose} className="md:hidden btn-icon w-6 h-6">
          <X size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-1 py-2">
        {searchOpen ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] shadow-sm">
            <Search size={13} className="text-[rgb(var(--muted))] shrink-0" />
            <input
              autoFocus
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search conversations..."
              className="flex-1 bg-transparent text-[13px] outline-none text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
            />
            <button onClick={() => { setSearchOpen(false); setSearchQ(''); }} className="text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors">
              <X size={13} />
            </button>
          </div>
        ) : (
          <button className="sidebar-item w-full" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <span>Search</span>
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="px-1 space-y-0.5">
        <button className="sidebar-item w-full" onClick={() => { onGoHome(); onClose(); }}>
          <Home size={15} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto mt-3">
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
      </div>

      {/* Bottom */}
      <div className="border-t border-[rgb(var(--border))] px-1 py-2 space-y-0.5">
        <button className="sidebar-item w-full" onClick={onOpenProviders}>
          <Database size={15} />
          <span>Providers</span>
        </button>
        <button className="sidebar-item w-full" onClick={onOpenSettings}>
          <Settings size={15} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
    </>
  );
}
