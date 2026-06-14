import { useState } from 'react';
import { Trash2, ExternalLink, Copy, Check, Calendar, Shield, AlertCircle } from 'lucide-react';
import type { Conversation, AppSettings } from '../../types';

interface SharesTabProps {
  settings: AppSettings;
  conversations: Conversation[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export default function SharesTab({ conversations }: SharesTabProps) {
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const shares = conversations.filter(c => c.shareInfo);

  const handleDeleteShare = async (code: string, conversationId: string) => {
    setDeleting(code);
    setError(null);
    try {
      const response = await fetch(`https://my-ai-chat.kokofixcomputers.workers.dev/share?code=${code}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        // Patch localStorage and fire an event so the store picks it up
        const raw = localStorage.getItem('lumina_conversations');
        if (raw) {
          const convs: Conversation[] = JSON.parse(raw);
          const updated = convs.map(c => {
            if (c.id !== conversationId) return c;
            const { shareInfo: _, ...rest } = c as any;
            return rest;
          });
          localStorage.setItem('lumina_conversations', JSON.stringify(updated));
          window.dispatchEvent(new CustomEvent('conversationsUpdated', { detail: updated }));
        }
      } else {
        throw new Error(result.error || 'Failed to delete share');
      }
    } catch (err) {
      setError('Failed to delete share. Please try again.');
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleCopyUrl = async (code: string) => {
    try {
      const url = `${window.location.origin}?view=${code}`;
      await navigator.clipboard.writeText(url);
      setCopiedCode(`url-${code}`);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getExpirationStatus = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const isExpired = expiry < now;
    
    return {
      isExpired,
      timeLeft: isExpired ? 'Expired' : `Expires ${formatDate(expiresAt)}`
    };
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Shared Conversations</h3>

        {error && (
          <div className="border border-[rgb(var(--danger)/0.4)] bg-[rgb(var(--danger)/0.08)] rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 text-[rgb(var(--danger))]">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {shares.length === 0 ? (
          <div className="text-center py-12">
            <Shield size={48} className="mx-auto text-[rgb(var(--muted))] mb-4" />
            <p className="text-[rgb(var(--muted))] mb-2">No shared conversations found</p>
            <p className="text-sm text-[rgb(var(--muted))]">
              Share conversations from the chat panel to see them here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {shares.map(conversation => {
              const shareInfo = conversation.shareInfo!;
              const { isExpired, timeLeft } = getExpirationStatus(shareInfo.expiresAt);

              return (
                <div
                  key={conversation.id}
                  className={`bg-[rgb(var(--panel))] border rounded-xl p-4 ${
                    isExpired ? 'border-[rgb(var(--border))] opacity-60' : 'border-[rgb(var(--border))]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-[rgb(var(--text))] truncate mb-1">
                        {conversation.title || 'Untitled Conversation'}
                      </h4>
                      <div className="flex items-center gap-4 text-xs text-[rgb(var(--muted))]">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <span>Shared {formatDate(shareInfo.createdAt)}</span>
                        </div>
                        <div className={`flex items-center gap-1 ${isExpired ? 'text-red-500' : ''}`}>
                          <Shield size={12} />
                          <span>{timeLeft}</span>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDeleteShare(shareInfo.code, conversation.id)}
                      disabled={deleting === shareInfo.code}
                      className="btn-icon hover:text-[rgb(var(--danger))] disabled:opacity-50"
                      title="Delete share"
                    >
                      {deleting === shareInfo.code ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[rgb(var(--muted))]">Share Code:</span>
                      <code className="flex-1 px-2 py-1 bg-[rgb(var(--bg))] rounded text-xs font-mono text-[rgb(var(--text))] border border-[rgb(var(--border))]">
                        {shareInfo.code}
                      </code>
                      <button
                        onClick={() => handleCopyCode(shareInfo.code)}
                        className="btn-icon"
                        title="Copy code"
                      >
                        {copiedCode === shareInfo.code ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[rgb(var(--muted))]">Share URL:</span>
                      <code className="flex-1 px-2 py-1 bg-[rgb(var(--bg))] rounded text-xs font-mono text-[rgb(var(--text))] border border-[rgb(var(--border))] truncate">
                        https://lumina-chat-rho.vercel.app?view={shareInfo.code}
                      </code>
                      <button
                        onClick={() => handleCopyUrl(shareInfo.code)}
                        className="btn-icon"
                        title="Copy URL"
                      >
                        {copiedCode === `url-${shareInfo.code}` ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <a
                        href={`?view=${shareInfo.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-icon"
                        title="Open in new tab"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>

                  {isExpired && (
                    <div className="mt-3 p-2 bg-[rgb(var(--danger)/0.08)] border border-[rgb(var(--danger)/0.3)] rounded-lg">
                      <p className="text-xs text-[rgb(var(--danger))]">
                        This share has expired. Delete it to clean up your shares.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
