import { useState, useEffect, useRef } from 'react';
import { X, SplitSquareHorizontal } from 'lucide-react';
import type { Conversation } from '../types';

interface ContextMenu {
  tabId: string;
  x: number;
  y: number;
}

interface TabBarProps {
  tabs: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onSplitLeft?: (id: string) => void;
  onSplitRight?: (id: string) => void;
}

export default function TabBar({ tabs, activeId, onSelect, onClose, onSplitLeft, onSplitRight }: TabBarProps) {
  const [menu, setMenu] = useState<ContextMenu | null>(null);
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

  return (
    <>
      <div className="flex items-end gap-0 overflow-x-auto scrollbar-none border-b border-[rgb(var(--border))] bg-[rgb(var(--bg))] shrink-0 px-2 pt-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              className={`group flex items-center gap-1.5 px-3 py-2 min-w-0 max-w-[180px] cursor-pointer select-none rounded-t-lg border-t border-l border-r text-sm shrink-0 transition-colors ${
                isActive
                  ? 'bg-[rgb(var(--panel))] border-[rgb(var(--border))] text-[rgb(var(--text))] -mb-px pb-[9px]'
                  : 'bg-transparent border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--panel))]/50'
              }`}
              onClick={() => onSelect(tab.id)}
            >
              <span className="truncate flex-1 min-w-0">
                {tab.title || 'New conversation'}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-[rgb(var(--text))] transition-opacity rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <X size={12} />
              </span>
            </div>
          );
        })}
      </div>

      {menu && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menu.y, left: menu.x, zIndex: 9999 }}
          className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl shadow-lg py-1 min-w-[160px] text-sm"
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
