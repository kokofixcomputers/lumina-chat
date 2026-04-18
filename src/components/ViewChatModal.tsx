import { useState } from 'react';
import { X, Link, Download, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import type { Conversation } from '../types';

interface ViewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadConversation: (conversation: Conversation) => void;
}

export default function ViewChatModal({ isOpen, onClose, onLoadConversation }: ViewChatModalProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [shareInfo, setShareInfo] = useState<{ expiresAt: string } | null>(null);

  if (!isOpen) return null;

  const handleLoadChat = async () => {
    if (!code.trim()) {
      setError('Please enter a share code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`https://my-ai-chat.kokofixcomputers.workers.dev/share?code=${code.trim()}`);
      const data = await response.json();

      if (data.success) {
        setConversation(data.conversation);
        setShareInfo({ expiresAt: data.expiresAt });
      } else {
        setError(data.error || 'Failed to load shared conversation');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadIntoApp = () => {
    if (conversation) {
      onLoadConversation(conversation);
      onClose();
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const downloadConversation = () => {
    if (!conversation) return;
    
    const dataStr = JSON.stringify(conversation, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shared-conversation-${code}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[rgb(var(--border))]">
          <div className="flex items-center gap-2">
            <Link size={20} className="text-blue-500" />
            <h2 className="text-lg font-semibold">View Shared Chat</h2>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!conversation ? (
            <div className="space-y-6">
              {/* Input Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    Share Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setError(null);
                      }}
                      placeholder="Enter 6-character code"
                      className="flex-1 px-3 py-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] text-[rgb(var(--text))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]/50 font-mono uppercase"
                      maxLength={6}
                    />
                    <button
                      onClick={handleLoadChat}
                      disabled={isLoading || code.length !== 6}
                      className="btn-primary px-4"
                    >
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        'Load'
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-500">{error}</p>
                  </div>
                )}

                <div className="text-xs text-[rgb(var(--muted))] text-center">
                  <p>Enter the 6-character share code to view a shared conversation.</p>
                  <p>Shared conversations are temporary and will expire after the set time.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Conversation Preview */}
              <div className="bg-[rgb(var(--muted))]/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[rgb(var(--text))]">Conversation Preview</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(code)}
                      className="btn-icon w-6 h-6"
                      title="Copy code"
                    >
                      <Link size={14} />
                    </button>
                    <button
                      onClick={downloadConversation}
                      className="btn-icon w-6 h-6"
                      title="Download conversation"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
                    <Calendar size={12} />
                    <span>Share Code: <code className="font-mono text-[rgb(var(--text))]">{code}</code></span>
                  </div>
                  {shareInfo && (
                    <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted))]">
                      <Calendar size={12} />
                      <span>Expires: {new Date(shareInfo.expiresAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Conversation Title */}
                <div className="border-t border-[rgb(var(--border))] pt-3">
                  <h4 className="font-medium text-[rgb(var(--text))] mb-2">
                    {conversation.title || 'Untitled Conversation'}
                  </h4>
                  <p className="text-sm text-[rgb(var(--muted))] mb-3">
                    {conversation.messages.length} messages • {conversation.mode === 'image' ? 'Image' : 'Chat'} mode
                  </p>
                  
                  {/* Message Preview */}
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {conversation.messages.slice(0, 3).map((message, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium text-[rgb(var(--text))]">
                          {message.role === 'user' ? 'You' : 'Assistant'}:
                        </span>
                        <span className="text-[rgb(var(--muted))] ml-2">
                          {message.content.slice(0, 100)}
                          {message.content.length > 100 ? '...' : ''}
                        </span>
                      </div>
                    ))}
                    {conversation.messages.length > 3 && (
                      <p className="text-xs text-[rgb(var(--muted))] italic">
                        ... and {conversation.messages.length - 3} more messages
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleLoadIntoApp}
                  className="flex-1 btn-primary justify-center"
                >
                  Load into App
                </button>
                <button
                  onClick={() => {
                    setConversation(null);
                    setShareInfo(null);
                    setCode('');
                  }}
                  className="btn-secondary"
                >
                  Load Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
