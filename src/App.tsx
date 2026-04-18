import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import WelcomeScreen from './components/WelcomeScreen';
import ShareModal from './components/ShareModal';
import ViewChatModal from './components/ViewChatModal';
import { useAppStore } from './hooks/useAppStore';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from './utils/syncStatus';
import { mergeConversations } from './utils/mergeConversations';
import type { Panel } from './types';

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export default function App() {
  const store = useAppStore();
  const [panel, setPanel] = useState<Panel>('chat');
  const [homeMode, setHomeMode] = useState<'chat' | 'image'>('chat');
  const [homeAttachments, setHomeAttachments] = useState<string[]>([]);
  const [homeBuildMode, setHomeBuildMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('notfirsttime'));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [showShareModal, setShowShareModal] = useState(false);
  const [showViewChatModal, setShowViewChatModal] = useState(false);

  const handleGetStarted = () => {
    localStorage.setItem('notfirsttime', 'true');
    setShowWelcome(false);
  };

  // Set default window size when running inside Tauri
  useEffect(() => {
    if (!isTauri()) return;
    Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/api/dpi'),
    ]).then(([{ getCurrentWindow }, { LogicalSize }]) => {
      getCurrentWindow().setSize(new LogicalSize(1280, 820)).catch(() => {});
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    const themes = ['light', 'dark', 'system'] as const;
    const idx = themes.indexOf(store.settings.theme);
    store.updateSettings({ theme: themes[(idx + 1) % themes.length] });
  };

  const togglePanel = () => {
    setPanel(p => p === 'chat' ? 'settings' : 'chat');
  };

  const handleSend = (content: string, images: string[]) => {
    let convId = store.activeConvId;
    if (!convId) {
      convId = store.newConversation(homeMode, homeAttachments);
      store.setActiveConvId(convId);
      if (homeBuildMode) store.setBuildMode(convId, true);
    }
    const conv = store.conversations.find(c => c.id === convId);
    if (conv?.mode === 'image') {
      store.generateImage(content, convId);
    } else {
      store.sendMessage(content, images, convId);
    }
  };

  const handleRetry = () => {
    if (!store.activeConvId || !store.activeConversation) return;
    const messages = store.activeConversation.messages;
    const convMode = store.activeConversation.mode;
    
    // Find last assistant message and its preceding user message
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    
    if (lastAssistantIdx === -1) return;
    
    // Find the user message before this assistant message
    let userMsgIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsgIdx = i;
        break;
      }
    }
    
    if (userMsgIdx === -1) return;
    
    // Capture user message and assistant message data before deletion
    const userMsg = { ...messages[userMsgIdx] };
    const assistantMsg = { ...messages[lastAssistantIdx] };
    const convId = store.activeConvId;
    
    // Store the current assistant message as a version
    const versions = assistantMsg.versions || [];
    const currentVersionIndex = assistantMsg.currentVersionIndex ?? 0;
    
    // Add current message to versions if not already there
    if (versions.length === 0 || versions[currentVersionIndex]?.id !== assistantMsg.id) {
      versions.push({
        ...assistantMsg,
        versions: undefined,
        currentVersionIndex: undefined
      });
    }
    
    // Update the assistant message with version info before deleting
    store.updateMessageVersions(convId, messages[lastAssistantIdx].id, versions, versions.length);
    
    // Delete from user message onwards (removes user + assistant + any tool messages)
    store.deleteMessagesFrom(convId, messages[userMsgIdx].id);
    
    // Resend user message after a brief delay to ensure state update
    setTimeout(() => {
      if (convMode === 'image') {
        store.generateImage(userMsg.content, convId);
      } else {
        store.sendMessage(userMsg.content, userMsg.images || [], convId);
      }
    }, 50);
  };

  const handleEditMessage = (msgId: string, newContent: string) => {
    if (!store.activeConvId) return;
    store.editMessage(store.activeConvId, msgId, newContent);
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!store.activeConvId) return;
    store.deleteMessagesFrom(store.activeConvId, msgId);
  };

  const handleModeChange = (mode: 'chat' | 'image') => {
    if (store.activeConvId) {
      store.setConversationMode(store.activeConvId, mode);
    } else {
      setHomeMode(mode);
    }
  };

  const handleBuildModeChange = (on: boolean) => {
    if (store.activeConvId) {
      store.setBuildMode(store.activeConvId, on);
    } else {
      setHomeBuildMode(on);
    }
  };

  const handleAttachmentsChange = (attachments: string[]) => {
    if (store.activeConvId) {
      store.setConversationAttachments(store.activeConvId, attachments);
    } else {
      setHomeAttachments(attachments);
    }
  };

  const handleGenerateTitle = () => {
    if (!store.activeConvId || !store.activeConversation) return;
    const { provider, model } = store.getProviderAndModel(store.activeConversation.modelId || store.settings.defaultProviderModelId);
    if (provider && model) {
      store.generateConversationTitle(store.activeConvId, provider, model);
    }
  };

  const handleGenerateFollowUps = () => {
    if (!store.activeConvId || !store.activeConversation) return;
    const lastAssistantMsg = [...store.activeConversation.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMsg) return;
    const { provider, model } = store.getProviderAndModel(store.activeConversation.modelId || store.settings.defaultProviderModelId);
    if (provider && model) {
      store.generateFollowUps(store.activeConvId, lastAssistantMsg.id, provider, model);
    }
  };

  const handleVersionChange = (msgId: string, versionIndex: number) => {
    if (!store.activeConvId) return;
    store.updateMessageVersions(store.activeConvId, msgId, [], versionIndex);
  };

  const handleModelChange = (modelId: string) => {
    if (store.activeConvId) store.setConversationModel(store.activeConvId, modelId);
    store.updateSettings({ defaultProviderModelId: modelId });
  };

  const handleImportData = (data: any) => {
    if (data.settings) {
      store.updateSettings(data.settings);
    }
    if (data.conversations) {
      localStorage.setItem('lumina_conversations', JSON.stringify(data.conversations));
      window.location.reload();
    }
  };

  const handleShare = async (options: { includeAttachments: boolean; expiryDays: number }) => {
    const conversation = store.activeConversation;
    if (!conversation) return;
    
    try {
      const conversationToShare = {
        ...conversation,
        messages: options.includeAttachments 
          ? conversation.messages 
          : conversation.messages.map(msg => ({
              ...msg,
              images: undefined // Remove attachments if not included
            }))
      };
      
      const response = await fetch('https://my-ai-chat.kokofixcomputers.workers.dev/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: conversationToShare,
          expiryDays: options.expiryDays
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Store share info in conversation metadata
        const updatedConversations = store.conversations.map(conv => 
          conv.id === conversation.id 
            ? { ...conv, shareInfo: { code: result.code, expiresAt: result.expiresAt } }
            : conv
        );
        store.setConversations(updatedConversations);
        setShowShareModal(false);
      } else {
        throw new Error(result.error || 'Failed to share conversation');
      }
    } catch (error) {
      console.error('Share failed:', error);
      alert('Failed to share conversation. Please try again.');
    }
  };

  const handleLoadSharedConversation = (conversation: any) => {
    // Create a new conversation with the shared data
    const newConv = {
      ...conversation,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    store.newConversation(newConv.mode, newConv.attachments || []);
    store.setActiveConvId(newConv.id);
  };

  const openProviders = () => setPanel('settings');

  useEffect(() => {
    const handler = () => setPanel('settings');
    window.addEventListener('openProviders', handler as EventListener);
    return () => window.removeEventListener('openProviders', handler as EventListener);
  }, []);

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  useEffect(() => {
    const cloudSync = store.settings.cloudSync;
    if (!cloudSync?.enabled || !cloudSync?.email || !cloudSync?.password) {
      setSyncStatus('disabled');
      return;
    }

    // ── WebSocket Sync System ──────────────────────────────────────────────────
    setSyncStatus('syncing');
    const wsUrl = `wss://my-ai-chat.kokofixcomputers.workers.dev/ws?userId=${encodeURIComponent(cloudSync.email)}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;
    let reconnectDelay = 3000;
    let lastPushedSettings = localStorage.getItem('lumina_settings');
    let lastPushedConversations = localStorage.getItem('lumina_conversations');
    let ignoreNextUpdate = false; // suppress echo after our own push

    const push = async (key: string, value: unknown) => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      const { encryptData } = await import('./utils/encryption');
      ws.send(JSON.stringify({ type: 'set', key, value: encryptData(value, cloudSync.password) }));
    };

    const connect = () => {
        if (dead) return;
        ws = new WebSocket(wsUrl);

      ws.onopen = () => { setSyncStatus('synced'); reconnectDelay = 3000; };

      ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data);
            const { decryptData } = await import('./utils/encryption');

            // On connect the server sends init with all stored data — overwrite local
            if (msg.type === 'init') {
              const data = msg.data as Record<string, string>;
              let changed = false;
              for (const [key, encVal] of Object.entries(data)) {
                if (key === 'greeting') continue;
                const decrypted = decryptData(encVal, cloudSync.password);
                if (!decrypted) continue;
                const str = JSON.stringify(decrypted);
                if (key === 'settings' && str !== localStorage.getItem('lumina_settings')) {
                  localStorage.setItem('lumina_settings', str);
                  lastPushedSettings = str;
                  store.updateSettings(decrypted);
                  changed = true;
                }
                if (key === 'conversations' && str !== localStorage.getItem('lumina_conversations')) {
                  localStorage.setItem('lumina_conversations', str);
                  lastPushedConversations = str;
                  // Merge conversations instead of overwriting
                  const { mergeConversationsSafely } = await import('./utils/syncUtils');
                  const mergedConversations = mergeConversationsSafely(store.conversations, decrypted);
                  store.setConversations(mergedConversations);
                  changed = true;
                }
              }
              // Changes applied live via store methods
              // Nothing from server - push our local state up
              await push('settings', JSON.parse(lastPushedSettings || '{}'));
              await push('conversations', JSON.parse(lastPushedConversations || '[]'));
              ignoreNextUpdate = true;
              setTimeout(() => { ignoreNextUpdate = false; }, 2000);
            }

            // Any update from another client - merge intelligently
            if (msg.type === 'update') {
              if (ignoreNextUpdate) return;
              const decrypted = decryptData(msg.value, cloudSync.password);
              if (!decrypted) return;
              const str = JSON.stringify(decrypted);
              if (msg.key === 'settings') {
                localStorage.setItem('lumina_settings', str);
                lastPushedSettings = str;
                store.updateSettings(decrypted);
              }
              if (msg.key === 'conversations') {
                localStorage.setItem('lumina_conversations', str);
                lastPushedConversations = str;
                // Merge conversations instead of overwriting
                const { mergeConversationsSafely } = await import('./utils/syncUtils');
                const mergedConversations = mergeConversationsSafely(store.conversations, decrypted);
                store.setConversations(mergedConversations);
              }
            }
          } catch { /* ignore */ }
        };

      ws.onerror = () => setSyncStatus('error');
      ws.onclose = () => {
          setSyncStatus('error');
          if (!dead) {
            reconnectTimer = setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, 60000);
          }
        };
      };

      // Push local changes every 3s if something changed
      const pushInterval = setInterval(async () => {
        if (ws?.readyState !== WebSocket.OPEN) return;
        const curSettings = localStorage.getItem('lumina_settings');
        const curConversations = localStorage.getItem('lumina_conversations');
        if (curSettings !== lastPushedSettings) {
          lastPushedSettings = curSettings;
          ignoreNextUpdate = true;
          setTimeout(() => { ignoreNextUpdate = false; }, 2000);
          await push('settings', JSON.parse(curSettings || '{}'));
        }
        if (curConversations !== lastPushedConversations) {
          lastPushedConversations = curConversations;
          ignoreNextUpdate = true;
          setTimeout(() => { ignoreNextUpdate = false; }, 2000);
          await push('conversations', JSON.parse(curConversations || '[]'));
        }
      }, 3000);

      connect();
      return () => {
        dead = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        clearInterval(pushInterval);
        ws?.close();
      };

  }, [store.settings.cloudSync?.enabled, store.settings.cloudSync?.email, store.settings.cloudSync?.password]);

  return (
    <>
      {showWelcome && <WelcomeScreen onGetStarted={handleGetStarted} />}

      {store.storageQuotaExceeded && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]" />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <h3 className="text-base font-semibold">Storage quota exceeded</h3>
              <p className="text-sm text-[rgb(var(--muted))]">Please select an option to continue saving your conversations.</p>
              <div className="space-y-2">
                <button
                  onClick={() => store.resolveStorageQuota('evict')}
                  className="w-full btn-primary justify-center"
                >
                  Remove oldest 3 conversations
                </button>
                <button
                  onClick={() => store.resolveStorageQuota('retry')}
                  className="w-full btn-secondary justify-center"
                >
                  Retry
                </button>
                <button
                  onClick={() => store.resolveStorageQuota('ignore')}
                  className="w-full btn-secondary justify-center text-red-500 hover:text-red-600"
                >
                  Ignore
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <div className="flex h-screen overflow-hidden bg-[rgb(var(--bg))]">
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-30 md:hidden btn-icon shadow-lg"
        >
          <Menu size={20} />
        </button>

        <Sidebar
          conversations={store.conversations}
          activeConvId={store.activeConvId}
          settings={store.settings}
          onSelectConv={store.setActiveConvId}
          onGoHome={() => store.setActiveConvId(null)}
          onDeleteConv={store.deleteConversation}
          onUpdateTitle={store.updateConversationTitle}
          onOpenSettings={() => setPanel(p => p === 'settings' ? 'chat' : 'settings')}
          onOpenProviders={openProviders}
          onOpenViewChat={() => setShowViewChatModal(true)}
          onToggleTheme={toggleTheme}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          syncStatus={syncStatus}
        />

        <div className="flex-1 flex min-w-0 overflow-hidden">
          <ChatArea
            conversation={store.activeConversation}
            isGenerating={store.isGenerating}
            streamingContent={store.streamingContent}
            streamingContentRef={store.streamingContentRef}
            allModels={store.allProviderModels}
            onSend={handleSend}
            onModelChange={handleModelChange}
            defaultModelId={store.settings.defaultProviderModelId}
            onTogglePanel={togglePanel}
            onOpenProviders={openProviders}
            onRetry={handleRetry}
            onStopGeneration={store.stopGeneration}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onModeChange={handleModeChange}
            onAttachmentsChange={handleAttachmentsChange}
            onBuildModeChange={handleBuildModeChange}
            homeBuildMode={homeBuildMode}
            onGenerateTitle={handleGenerateTitle}
            onGenerateFollowUps={handleGenerateFollowUps}
            homeMode={homeMode}
            homeAttachments={homeAttachments}
            prettifyModelNames={store.settings.prettifyModelNames}
            workflows={store.settings.workflows || []}
            useResponsesApi={store.settings.modelSettings.useResponsesApi}
            reasoningEffort={store.settings.modelSettings.reasoningEffort || 'off'}
            onReasoningEffortChange={(effort) => store.updateModelSettings({ reasoningEffort: effort })}
            onTranscribeAudio={(blob, mimeType) => store.transcribeAudio(blob, mimeType)}
            onVersionChange={handleVersionChange}
            onOpenShare={() => setShowShareModal(true)}
          />

          {panel === 'settings' && (
            <SettingsPanel
              settings={store.settings}
              conversations={store.conversations}
              onUpdateModelSettings={store.updateModelSettings}
              onUpdateSettings={store.updateSettings}
              onUpdateProvider={store.updateProvider}
              onAddProvider={store.addProvider}
              onAddIntegratedProvider={store.addIntegratedProvider}
              onDeleteProvider={store.deleteProvider}
              onUpsertApiFormat={store.upsertApiFormat}
              onDeleteApiFormat={store.deleteApiFormat}
              onImportData={handleImportData}
              onClose={() => setPanel('chat')}
            />
          )}
        </div>
      </div>
      
      {/* Modals */}
      {showShareModal && store.activeConversation && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          conversation={store.activeConversation}
          onShare={handleShare}
          existingShare={store.activeConversation.shareInfo}
        />
      )}
      
      {showViewChatModal && (
        <ViewChatModal
          isOpen={showViewChatModal}
          onClose={() => setShowViewChatModal(false)}
          onLoadConversation={handleLoadSharedConversation}
        />
      )}
    </>
  );
}
