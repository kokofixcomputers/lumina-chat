import { useState, useEffect } from 'react';
import { Trash2, ExternalLink, Copy, Check, Calendar, Shield, AlertCircle } from 'lucide-react';
import type { Conversation } from '../../types';
import type { AppSettings } from '../../types';

interface SharesTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

interface ShareInfo {
  conversation: Conversation;
  shareInfo: {
    code: string;
    expiresAt: string;
    createdAt: string;
  };
}

export default function SharesTab({ settings, onUpdateSettings }: SharesTabProps) {
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadShares();
  }, []);

  const loadShares = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get conversations from localStorage
      const conversationsData = localStorage.getItem('lumina_conversations');
      if (!conversationsData) {
        setShares([]);
        return;
      }

      const conversations = JSON.parse(conversationsData);
      
      // Filter conversations that have share info
      const sharedConversations = conversations.filter((conv: Conversation) => conv.shareInfo);
      
      setShares(sharedConversations.map((conv: Conversation) => ({
        conversation: conv,
        shareInfo: conv.shareInfo!
      })));
    } catch (err) {
      setError('Failed to load shared conversations');
      console.error('Error loading shares:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShare = async (code: string, conversationId: string) => {
    setDeleting(code);
    
    try {
      const response = await fetch(`https://my-ai-chat.kokofixcomputers.workers.dev/share?code=${code}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update conversation to remove share info
        const conversationsData = localStorage.getItem('lumina_conversations');
        if (conversationsData) {
          const conversations = JSON.parse(conversationsData);
          const updatedConversations = conversations.map((conv: Conversation) => {
            if (conv.id === conversationId) {
              const { shareInfo, ...convWithoutShare } = conv;
              return convWithoutShare;
            }
            return conv;
          });
          
          localStorage.setItem('lumina_conversations', JSON.stringify(updatedConversations));
          
          // Update the app store if it has a setConversations method
          const event = new CustomEvent('conversationsUpdated', { 
            detail: updatedConversations 
          });
          window.dispatchEvent(event);
        }
        
        // Reload shares
        await loadShares();
      } else {
        throw new Error(result.error || 'Failed to delete share');
      }
    } catch (err) {
      setError('Failed to delete share');
      console.error('Error deleting share:', err);
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

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[rgb(var(--accent))] mx-auto mb-4"></div>
            <p className="text-[rgb(var(--muted))]">Loading shared conversations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Shared Conversations</h3>
        
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
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
            {shares.map(({ conversation, shareInfo }) => {
              const { isExpired, timeLeft } = getExpirationStatus(shareInfo.expiresAt);
              
              return (
                <div
                  key={conversation.id}
                  className={`bg-[rgb(var(--panel))] border rounded-lg p-4 ${
                    isExpired 
                      ? 'border-gray-200 dark:border-gray-700 opacity-60' 
                      : 'border-[rgb(var(--border))]'
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
                      className="btn-icon text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
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
                        {window.location.origin}?view={shareInfo.code}
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
                    <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                      <p className="text-xs text-red-600 dark:text-red-400">
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

      <section className="bg-[rgb(var(--accent))]/10 rounded-xl p-4 border border-[rgb(var(--accent))]/20">
        <h4 className="font-medium text-[rgb(var(--text))] mb-2">About Shared Conversations</h4>
        <ul className="text-sm text-[rgb(var(--text))] space-y-1">
          <li>· Shared conversations are publicly accessible via their share code</li>
          <li>· Shares automatically expire after the specified time</li>
          <li>· Deleting a share removes public access immediately</li>
          <li>· Expired shares should be deleted for security</li>
        </ul>
      </section>
    </div>
  );
}
