import { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Link, Eye, EyeOff, Trash2, Upload, Copy, Check, ExternalLink } from 'lucide-react';
import type { Conversation } from '../types';
import { openDeepLink } from '../utils/deepLink';

interface SharePanelProps {
  conversation: Conversation | null;
  onShare: (options: ShareOptions) => Promise<void>;
  onUnshare?: () => Promise<void>;
  onClose: () => void;
}

interface ShareOptions {
  includeAttachments: boolean;
  expiryDays: number;
}

export default function SharePanel({ conversation, onShare, onUnshare, onClose }: SharePanelProps) {
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [expiryDays, setExpiryDays] = useState(7);
  const [isSharing, setIsSharing] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);
  const [shareResult, setShareResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const existingShare = conversation?.shareInfo;

  useEffect(() => {
    if (existingShare) {
      setShareResult({
        code: existingShare.code,
        expiresAt: existingShare.expiresAt
      });
    }
  }, [existingShare]);

  const handleShare = async () => {
    if (!conversation) return;
    
    setIsSharing(true);
    try {
      await onShare({ includeAttachments, expiryDays });
      // The parent component will handle the actual sharing and update state
      if (conversation.shareInfo) {
        setShareResult({
          code: conversation.shareInfo.code,
          expiresAt: conversation.shareInfo.expiresAt
        });
      }
    } catch (error) {
      console.error('Failed to share:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyCode = async () => {
    if (!shareResult) return;
    
    try {
      await navigator.clipboard.writeText(shareResult.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCopyUrl = async () => {
    if (!shareResult) return;
    
    try {
      const shareUrl = `${window.location.origin}?view=${shareResult.code}`;
      await navigator.clipboard.writeText(shareUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const shareUrl = shareResult ? `${window.location.origin}?view=${shareResult.code}` : '';
  const deepLinkUrl = shareResult ? `lumina://view?code=${shareResult.code}` : '';

  const handleUnshare = async () => {
    if (!shareResult) return;
    
    setIsUnsharing(true);
    try {
      const response = await fetch(`https://my-ai-chat.kokofixcomputers.workers.dev/share?code=${shareResult.code}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Clear share info from the conversation
        if (conversation) {
          // Call parent unshare handler if available
          if (onUnshare) {
            await onUnshare();
          }
          // Clear local state
          setShareResult(null);
        }
      } else {
        throw new Error(result.error || 'Failed to unshare conversation');
      }
    } catch (error) {
      console.error('Unshare failed:', error);
      alert('Failed to unshare conversation. Please try again.');
    } finally {
      setIsUnsharing(false);
    }
  };

  const expiryOptions = [
    { value: 1, label: '1 day' },
    { value: 3, label: '3 days' },
    { value: 7, label: '1 week' },
    { value: 14, label: '2 weeks' },
    { value: 30, label: '1 month' }
  ];

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col bg-[rgb(var(--bg))]">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[rgb(var(--border))]">
          <button onClick={onClose} className="btn-icon">
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold">Share Conversation</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[rgb(var(--muted))]">No conversation selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[rgb(var(--bg))]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[rgb(var(--border))]">
        <button onClick={onClose} className="btn-icon">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">Share Conversation</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Conversation Info */}
          <div className="bg-[rgb(var(--panel))] rounded-xl p-4 border border-[rgb(var(--border))]">
            <h3 className="font-medium text-[rgb(var(--text))] mb-2">
              {conversation.title || 'Untitled Conversation'}
            </h3>
            <p className="text-sm text-[rgb(var(--muted))]">
              {conversation.messages.length} messages 
              {conversation.mode === 'image' && ' (Image mode)'}
              {conversation.attachments && conversation.attachments.length > 0 && 
                ` with ${conversation.attachments.length} attachment(s)`
              }
            </p>
          </div>

          {/* Share Options */}
          {!shareResult && (
            <div className="space-y-4">
              {/* Include Attachments */}
              <div className="bg-[rgb(var(--panel))] rounded-xl p-4 border border-[rgb(var(--border))]">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAttachments}
                    onChange={(e) => setIncludeAttachments(e.target.checked)}
                    className="w-4 h-4 rounded border-[rgb(var(--border))] bg-[rgb(var(--bg))] text-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                  <div className="flex items-center gap-2">
                    {includeAttachments ? <Eye size={16} /> : <EyeOff size={16} />}
                    <span className="text-[rgb(var(--text))]">Include attachments</span>
                  </div>
                </label>
                <p className="text-xs text-[rgb(var(--muted))] mt-2 ml-7">
                  Share will include any files, images, or other attachments
                </p>
              </div>

              {/* Expiry Time */}
              <div className="bg-[rgb(var(--panel))] rounded-xl p-4 border border-[rgb(var(--border))]">
                <label className="block text-sm font-medium text-[rgb(var(--text))] mb-3">
                  Expiry time
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {expiryOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setExpiryDays(option.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        expiryDays === option.value
                          ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]'
                          : 'bg-[rgb(var(--bg))] text-[rgb(var(--text))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--border))]/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Share Button */}
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="w-full btn-primary flex items-center justify-center gap-2"
              >
                {isSharing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 size={16} />
                    Share Conversation
                  </>
                )}
              </button>
            </div>
          )}

          {/* Share Result */}
          {shareResult && (
            <div className="space-y-4">
              <div className="bg-[rgb(var(--panel))] rounded-xl p-4 border border-[rgb(var(--border))]">
                <div className="flex items-center gap-2 mb-3">
                  <Link size={16} className="text-[rgb(var(--accent))]" />
                  <span className="font-medium text-[rgb(var(--text))]">Share Code</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-[rgb(var(--bg))] rounded-lg text-[rgb(var(--text))] font-mono text-sm border border-[rgb(var(--border))]">
                    {shareResult.code}
                  </code>
                  <button
                    onClick={handleCopyCode}
                    className="btn-icon"
                    title="Copy code"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-[rgb(var(--muted))] mt-2">
                  Expires: {new Date(shareResult.expiresAt).toLocaleString()}
                </p>
              </div>

              <div className="bg-[rgb(var(--panel))] rounded-xl p-4 border border-[rgb(var(--border))]">
                <div className="flex items-center gap-2 mb-3">
                  <ExternalLink size={16} className="text-[rgb(var(--accent))]" />
                  <span className="font-medium text-[rgb(var(--text))]">Share URL</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-[rgb(var(--bg))] rounded-lg text-[rgb(var(--text))] font-mono text-sm border border-[rgb(var(--border))] break-all">
                    {shareUrl}
                  </code>
                  <button
                    onClick={handleCopyUrl}
                    className="btn-icon"
                    title="Copy URL"
                  >
                    {urlCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-[rgb(var(--muted))] mt-2">
                  Direct link for viewing the shared conversation
                </p>
              </div>

              {/* Deep Link URL */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ExternalLink size={16} className="text-purple-600 dark:text-purple-400" />
                  <span className="font-medium text-[rgb(var(--text))]">Deep Link</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-[rgb(var(--bg))] rounded-lg text-[rgb(var(--text))] font-mono text-sm border border-[rgb(var(--border))] break-all">
                    {deepLinkUrl}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(deepLinkUrl);
                      // You could add a copied state here if needed
                    }}
                    className="btn-icon"
                    title="Copy Deep Link"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={() => openDeepLink(shareResult!.code)}
                    className="btn-icon"
                    title="Open in App"
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
                <p className="text-xs text-[rgb(var(--muted))] mt-2">
                  Opens directly in the Lumina app (if installed)
                </p>
              </div>

              <div className="bg-[rgb(var(--accent))]/10 rounded-xl p-4 border border-[rgb(var(--accent))]/20">
                <p className="text-sm text-[rgb(var(--text))]">
                  Anyone with this code or URL can view this conversation until it expires. 
                  Share via messaging apps, email, or any other method.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShareResult(null);
                    if (conversation?.shareInfo) {
                      // Trigger re-share to update
                      handleShare();
                    }
                  }}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2"
                >
                  <Upload size={16} />
                  Update Share
                </button>
                <button
                  onClick={handleUnshare}
                  disabled={isUnsharing}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2 text-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUnsharing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                      Unsharing...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Unshare
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
