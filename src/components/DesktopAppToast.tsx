import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export default function DesktopAppToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('desktop-app-toast-dismissed') === 'true';
  });

  useEffect(() => {
    // Only show if not running in Tauri and not previously dismissed
    if (!isTauri() && !isDismissed) {
      // Show toast after a short delay to let page load
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isDismissed]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('desktop-app-toast-dismissed', 'true');
  };

  const handleDownloadClick = () => {
    window.open('https://github.com/kokofixcomputers/lumina-chat', '_blank');
  };

  if (!isVisible || isTauri() || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl shadow-lg p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-[rgb(var(--accent))]/20 rounded-full flex items-center justify-center">
          <Download size={16} className="text-[rgb(var(--accent))]" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[rgb(var(--text))] mb-1">
            Download the desktop app for a better experience
          </h4>
          <p className="text-xs text-[rgb(var(--muted))] leading-relaxed mb-2">
            The desktop app offers more features and optimizations.{' '}
            <button
              onClick={handleDownloadClick}
              className="text-[rgb(var(--accent))] hover:underline font-medium"
            >
              Click here
            </button>{' '}
            to download
          </p>
        </div>
        
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
          title="Dismiss"
        >
          <X size={14} className="text-[rgb(var(--muted))]" />
        </button>
      </div>
    </div>
  );
}
