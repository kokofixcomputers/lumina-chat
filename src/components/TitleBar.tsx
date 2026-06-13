import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Sparkles,
  Settings,
  Share2,
  SunMedium,
  Minimize2,
  Maximize2,
  X,
} from 'lucide-react';
import { tauriUtils } from '../utils/tauri';


interface TitleBarProps {
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onOpenProviders: () => void;
  onOpenShare: () => void;
  onToggleTheme: () => void;
}


type PlatformKey = 'macos' | 'windows' | 'linux' | 'unknown';


const normalizePlatform = (platform: string): PlatformKey => {
  const normalized = platform.toLowerCase();
  if (normalized.includes('mac') || normalized.includes('darwin')) return 'macos';
  if (normalized.includes('win')) return 'windows';
  if (normalized.includes('linux')) return 'linux';
  return 'unknown';
};


export default function TitleBar({
  onNewConversation,
  onOpenSettings,
  onOpenProviders,
  onOpenShare,
  onToggleTheme,
}: TitleBarProps) {
  const [platform, setPlatform] = useState<PlatformKey>('unknown');
  const [appWindow, setAppWindow] = useState<any>(null);


  useEffect(() => {
    if (!tauriUtils.isTauri) return;


    let mounted = true;


    import('@tauri-apps/api/window')
      .then(async (windowModule) => {
        if (!mounted) return;


        const fallback =
          typeof navigator !== 'undefined'
            ? navigator.platform || navigator.userAgent
            : 'unknown';
        setPlatform(normalizePlatform(fallback));


        const { getCurrentWindow } = windowModule;
        setAppWindow(getCurrentWindow());
      })
      .catch((error) => {
        console.error('Failed to initialize titlebar platform detection:', error);
      });


    return () => {
      mounted = false;
    };
  }, []);


  // Applied to the overall titlebar container and the center drag zone
  const dragStyle = {
    WebkitAppRegion: 'drag',
    MozWindowDragging: 'drag',
    userSelect: 'none',
    cursor: 'default',
  } as const;


  // Applied to every interactive or non-draggable child
  const noDragStyle = {
    WebkitAppRegion: 'no-drag',
    MozWindowDragging: 'no-drag',
    userSelect: 'none',
    cursor: 'default',
  } as const;


  const handleClose = useCallback(async () => {
    try {
      await appWindow?.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }, [appWindow]);


  const handleMinimize = useCallback(async () => {
    try {
      await appWindow?.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }, [appWindow]);


  const handleToggleMaximize = useCallback(async () => {
    try {
      if (!appWindow) return;
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  }, [appWindow]);


  if (!tauriUtils.isTauri) {
    return null;
  }


  return (
    <div
      className="titlebar flex h-12 w-full items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] px-3 text-[rgb(var(--text))] shadow-sm"
      style={dragStyle}
    >
      {/* LEFT: window controls or platform badge */}
      <div className="flex items-center gap-2" style={noDragStyle}>
        {platform === 'macos' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Close"
              onClick={handleClose}
              style={noDragStyle}
              className="titlebar-button h-3.5 w-3.5 rounded-full bg-[#ff5f57] transition hover:brightness-90"
            />
            <button
              type="button"
              title="Minimize"
              onClick={handleMinimize}
              style={noDragStyle}
              className="titlebar-button h-3.5 w-3.5 rounded-full bg-[#ffbd2e] transition hover:brightness-90"
            />
            <button
              type="button"
              title="Maximize"
              onClick={handleToggleMaximize}
              style={noDragStyle}
              className="titlebar-button h-3.5 w-3.5 rounded-full bg-[#28c840] transition hover:brightness-90"
            />
          </div>
        ) : (
          <div
            className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-2 py-1 text-[11px] uppercase tracking-[0.32em] text-[rgb(var(--muted))]"
            style={noDragStyle}
          >
            <span>
              {platform === 'windows'
                ? 'Windows'
                : platform === 'linux'
                ? 'Linux'
                : 'Desktop'}
            </span>
          </div>
        )}
      </div>


      {/* CENTER: draggable title area */}
      <div
        className="titlebar-drag-area flex min-w-0 flex-1 items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[rgb(var(--muted))] sm:text-sm"
        style={dragStyle}
      >
        <span className="truncate text-[rgb(var(--text))]" style={dragStyle}>
          Lumina Chat
        </span>
        <div
          className="hidden sm:flex h-7 min-w-[130px] items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-2 text-[11px] uppercase tracking-[0.3em] text-[rgb(var(--muted))] shadow-inner"
          style={noDragStyle}
        >
          Quick actions
        </div>
      </div>


      {/* RIGHT: action buttons */}
      <div className="flex items-center gap-2" style={noDragStyle}>
        <button
          type="button"
          onClick={onNewConversation}
          style={noDragStyle}
          title="New chat"
          className="titlebar-button btn-icon bg-[rgb(var(--bg))] border border-[rgb(var(--border))] text-[rgb(var(--text))]"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenProviders}
          style={noDragStyle}
          title="Providers"
          className="titlebar-button btn-icon bg-[rgb(var(--bg))] border border-[rgb(var(--border))] text-[rgb(var(--text))]"
        >
          <Sparkles size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          style={noDragStyle}
          title="Settings"
          className="titlebar-button btn-icon bg-[rgb(var(--bg))] border border-[rgb(var(--border))] text-[rgb(var(--text))]"
        >
          <Settings size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenShare}
          style={noDragStyle}
          title="Share"
          className="titlebar-button btn-icon bg-[rgb(var(--bg))] border border-[rgb(var(--border))] text-[rgb(var(--text))]"
        >
          <Share2 size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          style={noDragStyle}
          title="Toggle theme"
          className="titlebar-button btn-icon bg-[rgb(var(--bg))] border border-[rgb(var(--border))] text-[rgb(var(--text))]"
        >
          <SunMedium size={16} />
        </button>
        {platform !== 'macos' && (
          <div
            className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-[rgb(var(--muted))]"
            style={noDragStyle}
          >
            <button type="button" onClick={handleMinimize} style={noDragStyle} title="Minimize">
              <Minimize2 size={12} />
            </button>
            <button type="button" onClick={handleToggleMaximize} style={noDragStyle} title="Maximize">
              <Maximize2 size={12} />
            </button>
            <button type="button" onClick={handleClose} style={noDragStyle} title="Close">
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}