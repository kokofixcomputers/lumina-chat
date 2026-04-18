import { useState } from 'react';
import { X, Share2, Link, Eye, EyeOff, Trash2, Upload } from 'lucide-react';
import type { Conversation } from '../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  onShare: (options: ShareOptions) => Promise<void>;
  existingShare?: ShareInfo;
}

interface ShareOptions {
  includeAttachments: boolean;
  expiryDays: number;
}

interface ShareInfo {
  code: string;
  expiresAt: string;
  createdAt: string;
}

export default function ShareModal({ isOpen, onClose, conversation, onShare, existingShare }: ShareModalProps) {
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [expiryDays, setExpiryDays] = useState(7);
  const [isSharing, setIsSharing] = useState(false);
  const [shareResult, setShareResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [showCode, setShowCode] = useState(false);

  if (!isOpen || !conversation) return null;

  const handleShare = async () => {
    if (!conversation) return;
    
    setIsSharing(true);
    try {
      await onShare({ includeAttachments, expiryDays });
      // The parent component will handle the actual sharing and update state
    } catch (error) {
      console.error('Failed to share:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!existingShare) return;
    
    try {
      const response = await fetch(`https://my-ai-chat.kokofixcomputers.workers.dev/share?code=${existingShare.code}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setShareResult(null);
        // Parent component should update existingShare to null
      }
    } catch (error) {
      console.error('Failed to unshare:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const expiryOptions = [
    { label: '1 day', value: 1 },
    { label: '3 days', value: 3 },
    { label: '7 days', value: 7 },
    { label: '14 days', value: 14 },
    { label: '30 days', value: 30 },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-2">
            <Share2 size={20} className="text-blue-500" />
            <h2 className="text-lg font-semibold">
              {existingShare ? 'Manage Share' : 'Share Conversation'}
            </h2>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!existingShare ? (
            <>
              {/* Share Options */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    What to share
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeAttachments}
                        onChange={(e) => setIncludeAttachments(e.target.checked)}
                        className="rounded border-[rgb(var(--border))] bg-[rgb(var(--bg))] text-[rgb(var(--accent))]"
                      />
                      <span className="text-sm text-[rgb(var(--text))]">Include attachments</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    Expiry date
                  </label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] text-[rgb(var(--text))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]/50"
                  >
                    {expiryOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Share Button */}
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="w-full btn-primary justify-center"
              >
                {isSharing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 size={16} className="mr-2" />
                    Share Conversation
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Existing Share Info */}
              <div className="space-y-4">
                <div className="bg-[rgb(var(--muted))]/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[rgb(var(--text))]">Share Code</span>
                    <button
                      onClick={() => setShowCode(!showCode)}
                      className="btn-icon w-6 h-6"
                      title={showCode ? 'Hide code' : 'Show code'}
                    >
                      {showCode ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {showCode && (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-[rgb(var(--bg))] rounded text-sm font-mono text-[rgb(var(--text))]">
                        {existingShare.code}
                      </code>
                      <button
                        onClick={() => copyToClipboard(existingShare.code)}
                        className="btn-icon"
                        title="Copy code"
                      >
                        <Link size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-sm text-[rgb(var(--muted))] space-y-1">
                  <p>Created: {new Date(existingShare.createdAt).toLocaleString()}</p>
                  <p>Expires: {new Date(existingShare.expiresAt).toLocaleString()}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIncludeAttachments(true);
                      setExpiryDays(7);
                      setShareResult(null);
                      // Reset to share mode
                    }}
                    className="flex-1 btn-secondary justify-center"
                  >
                    <Upload size={16} className="mr-2" />
                    Update Share
                  </button>
                  <button
                    onClick={handleUnshare}
                    className="flex-1 btn-secondary justify-center text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={16} className="mr-2" />
                    Unshare
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
