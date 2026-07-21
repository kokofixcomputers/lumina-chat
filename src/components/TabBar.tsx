import { useState, useEffect, useRef } from 'react';
import { X, SplitSquareHorizontal, MessageSquare } from 'lucide-react';
import type { Conversation } from '../types';
import { getModelInfo } from '../utils/models';

function TabFavicon({ modelId, isActive }: { modelId?: string; isActive: boolean }) {
  const shortId = modelId ? modelId.slice(modelId.indexOf('/') + 1) : '';
  const info = shortId ? getModelInfo(shortId) : null;
  const [imgError, setImgError] = useState(false);

  if (info?.icon && typeof info.icon === 'string' && !imgError) {
    return <img src={info.icon} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0 object-contain" onError={() => setImgError(true)} />;
  }
  const Icon = info?.icon && typeof info.icon !== 'string' ? info.icon : MessageSquare;
  return <Icon size={13} className={`shrink-0 ${isActive ? '' : 'opacity-60'}`} />;
}

interface ContextMenu {
  tabId: string;
  x: number;
  y: number;
}

// Custom drag MIME type used to identify a dragged browser tab (vs. a file, text, etc.)
// when it's dropped onto the chat area's split-view drop zone.
export const TAB_DRAG_TYPE = 'application/x-lumina-tab-id';

interface SplitPair {
  leftId: string;
  rightId: string;
}

interface TabBarProps {
  tabs: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onSplitLeft?: (id: string) => void;
  onSplitRight?: (id: string) => void;
  splitPair?: SplitPair | null;
  onCloseSplitSide?: (side: 'left' | 'right') => void;
}

export default function TabBar({ tabs, activeId, onSelect, onClose, onSplitLeft, onSplitRight, splitPair, onCloseSplitSide }: TabBarProps) {
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu]);

  if (tabs.length === 0) return null;

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({ tabId: id, x: e.clientX, y: e.clientY });
  };

  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDraggingId(id);
      e.dataTransfer.setData(TAB_DRAG_TYPE, id);
      e.dataTransfer.effectAllowed = 'copy' as const;
    },
    onDragEnd: () => setDraggingId(null),
  });

  const renderTabTitle = (tab: Conversation) => tab.title || 'New conversation';

  return (
    <>
      <div className="glass-inset flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0 px-2 py-1.5 relative z-10 rounded-none border-x-0 border-t-0">
        {(() => {
          const pairIds = splitPair ? new Set([splitPair.leftId, splitPair.rightId]) : null;
          let pairRendered = false;

          return tabs.map((tab) => {
            if (pairIds?.has(tab.id)) {
              if (pairRendered) return null;
              pairRendered = true;
              const leftTab = tabs.find(t => t.id === splitPair!.leftId);
              const rightTab = tabs.find(t => t.id === splitPair!.rightId);
              if (!leftTab || !rightTab) return null;
              return (
                <div
                  key="split-pair"
                  className="flex items-center rounded-full text-[13px] shrink-0 overflow-hidden bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-[0_2px_8px_rgba(0,0,0,0.16)]"
                >
                  {([['left', leftTab], ['right', rightTab]] as const).map(([side, tab], i) => (
                    <div
                      key={tab.id}
                      {...dragProps(tab.id)}
                      onContextMenu={(e) => handleContextMenu(e, tab.id)}
                      className={`group flex items-center gap-1.5 pl-3.5 pr-2 py-1.5 min-w-0 max-w-[140px] cursor-grab active:cursor-grabbing select-none ${
                        i === 0 ? 'border-r border-[rgb(var(--accent-contrast)/0.25)]' : ''
                      } ${draggingId === tab.id ? 'opacity-40' : ''}`}
                      onClick={() => onSelect(tab.id)}
                    >
                      <TabFavicon modelId={tab.modelId} isActive />
                      <span className="truncate flex-1 min-w-0">{renderTabTitle(tab)}</span>
                      <span
                        onClick={(e) => { e.stopPropagation(); onCloseSplitSide?.(side); }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 cursor-pointer hover:bg-black/15"
                      >
                        <X size={12} />
                      </span>
                    </div>
                  ))}
                </div>
              );
            }

            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                {...dragProps(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                className={`group flex items-center gap-1.5 px-3.5 py-1.5 min-w-0 max-w-[180px] cursor-grab active:cursor-grabbing select-none rounded-full text-[13px] shrink-0 active:scale-[0.97] ${
                  draggingId === tab.id ? 'opacity-40' : ''
                } ${
                  isActive
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-[0_2px_8px_rgba(0,0,0,0.16)]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-black/[0.05] dark:hover:bg-white/[0.07]'
                }`}
                style={{ transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1), background-color 0.15s ease, color 0.15s ease' }}
                onClick={() => onSelect(tab.id)}
              >
                <TabFavicon modelId={tab.modelId} isActive={isActive} />
                <span className="truncate flex-1 min-w-0">
                  {renderTabTitle(tab)}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 cursor-pointer ${
                    isActive ? 'hover:bg-black/15' : 'hover:bg-black/10 dark:hover:bg-white/10'
                  }`}
                >
                  <X size={12} />
                </span>
              </div>
            );
          });
        })()}
      </div>

      {menu && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menu.y, left: menu.x, zIndex: 9999 }}
          className="bg-[rgb(var(--bg))] border border-[rgb(var(--border))] animate-float-in rounded-2xl shadow-xl py-1 min-w-[160px] text-sm"
        >
          {onSplitLeft && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[rgb(var(--text))] text-left"
              onClick={() => { onSplitLeft(menu.tabId); setMenu(null); }}
            >
              <SplitSquareHorizontal size={14} />
              Split left
            </button>
          )}
          {onSplitRight && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[rgb(var(--text))] text-left"
              onClick={() => { onSplitRight(menu.tabId); setMenu(null); }}
            >
              <SplitSquareHorizontal size={14} className="scale-x-[-1]" />
              Split right
            </button>
          )}
          <div className="border-t border-[rgb(var(--border))] my-1" />
          <button
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[rgb(var(--danger))] text-left"
            onClick={() => { onClose(menu.tabId); setMenu(null); }}
          >
            <X size={14} />
            Close tab
          </button>
        </div>
      )}
    </>
  );
}
