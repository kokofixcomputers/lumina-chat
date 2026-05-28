import { useState } from 'react';
import { X, Sparkles, Download, ExternalLink } from 'lucide-react';

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}

interface WelcomeBackModalProps {
  isOpen: boolean;
  onClose: () => void;
  release: GitHubRelease | null;
  currentVersion: string;
}

export default function WelcomeBackModal({ isOpen, onClose, release, currentVersion }: WelcomeBackModalProps) {
  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatChangelog = (body: string) => {
    // Convert markdown-style changelog to HTML
    return body
      .replace(/^###\s+(.*)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>')
      .replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^#\s+(.*)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>')
      .replace(/^- (.*)$/gm, '<li class="ml-4 mb-1">$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-[rgb(var(--muted))] px-1 rounded">$1</code>')
      .replace(/\n/g, '<br />');
  };

  const handleViewOnGitHub = async () => {
    const url = release?.html_url || 'https://github.com/kokofixcomputers/lumina-chat/releases';
    
    // Try Tauri plugin-opener first
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return;
      } catch (error) {
        console.error('Failed to open with Tauri opener:', error);
      }
    }
    
    // Fallback to browser
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[rgb(var(--border))] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--text))]">Welcome Back!</h2>
              <p className="text-sm text-[rgb(var(--muted))]">
                Updated to version {release?.tag_name || currentVersion}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[rgb(var(--muted))] flex items-center justify-center transition-colors"
          >
            <X size={18} className="text-[rgb(var(--text))]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {release ? (
            <>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-[rgb(var(--text))] mb-2">{release.name}</h3>
                <p className="text-sm text-[rgb(var(--muted))]">
                  Released on {formatDate(release.published_at)}
                </p>
              </div>
              <div 
                className="text-sm text-[rgb(var(--text))] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: formatChangelog(release.body) }}
              />
            </>
          ) : (
            <p className="text-[rgb(var(--muted))]">Unable to load release notes.</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[rgb(var(--border))] flex items-center justify-between">
          <button
            onClick={handleViewOnGitHub}
            className="flex items-center gap-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
          >
            <ExternalLink size={14} />
            View on GitHub
          </button>
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
