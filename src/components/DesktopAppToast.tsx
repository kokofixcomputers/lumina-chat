import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export default function DesktopAppToast() {
  const location = useLocation();

  const EXCLUDED_PATHS = ['/download', '/install', '/versions'];
  const isExcluded = EXCLUDED_PATHS.some(path =>
    location.pathname.startsWith(path)
  );

  const [isVisible, setIsVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('desktop-app-toast-dismissed') === 'true';
  });

  useEffect(() => {
    // Only show if not running in Tauri, not previously dismissed, and not on excluded pages
    if (!isTauri() && !isDismissed && !isExcluded) {
      // Show toast after a short delay to let page load
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isDismissed, isExcluded]);

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsDismissed(true);
      localStorage.setItem('desktop-app-toast-dismissed', 'true');
    }, 150);
  };

  if (!isVisible || isTauri() || isDismissed || isExcluded) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 ${closing ? 'animate-fade-out' : 'animate-slide-up'}`}>
      <div className="glass-panel-strong rounded-3xl shadow-xl p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 bg-[rgb(var(--accent))]/15 rounded-full flex items-center justify-center">
          <Download size={16} className="text-[rgb(var(--accent))]" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[rgb(var(--text))] mb-1">
            Download the desktop app for a better experience
          </h4>
          <p className="text-xs text-[rgb(var(--muted))] leading-relaxed mb-2">
            The desktop app offers more features and optimizations.{' '}
            <a
              href="/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[rgb(var(--accent))] hover:underline font-medium"
            >
              Click here
            </a>{' '}
            to download
          </p>
        </div>

        <button
          onClick={handleDismiss}
          className="btn-icon w-7 h-7 shrink-0"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
