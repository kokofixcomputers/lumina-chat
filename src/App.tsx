import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import WelcomeScreen from './components/WelcomeScreen';
import { useAppStore } from './hooks/useAppStore';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from './utils/syncStatus';
import type { Panel } from './types';

export default function App() {
  const store = useAppStore();
  const [panel, setPanel] = useState<Panel>('chat');
  const [homeMode, setHomeMode] = useState<'chat' | 'image'>('chat');
  const [homeAttachments, setHomeAttachments] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('notfirsttime'));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());

  const handleGetStarted = () => {
    localStorage.setItem('notfirsttime', 'true');
    setShowWelcome(false);
  };

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

    setSyncStatus('synced');
    let lastConversations = localStorage.getItem('lumina_conversations');
    let lastSettings = localStorage.getItem('lumina_settings');
    let lastServerUpdate = parseInt(localStorage.getItem('lumina_last_server_update') || '0');

    const syncWithServer = async () => {
      try {
        const { encryptData, decryptData } = await import('./utils/encryption');
        
        // Check server for updates
        const getResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', email: cloudSync.email })
        });
        
        const getResult = await getResponse.json();
        
        if (getResult.exists && getResult.updatedAt) {
          const serverUpdateTime = new Date(getResult.updatedAt).getTime();
          
          // If server has newer data, apply it
          if (serverUpdateTime > lastServerUpdate + 5000) {
            const decrypted = decryptData(getResult.data, cloudSync.password);
            if (decrypted) {
              localStorage.setItem('lumina_settings', JSON.stringify(decrypted.settings));
              localStorage.setItem('lumina_conversations', JSON.stringify(decrypted.conversations));
              localStorage.setItem('lumina_last_server_update', serverUpdateTime.toString());
              window.location.reload();
              return;
            }
          }
        }
        
        // Check for local changes and push to server
        const currentConversations = localStorage.getItem('lumina_conversations');
        const currentSettings = localStorage.getItem('lumina_settings');

        if (currentConversations !== lastConversations || currentSettings !== lastSettings) {
          lastConversations = currentConversations;
          lastSettings = currentSettings;
          
          setSyncStatus('syncing');
          const settings = JSON.parse(currentSettings || '{}');
          const conversations = JSON.parse(currentConversations || '[]');
          const encrypted = encryptData({ settings, conversations }, cloudSync.password);
          
          const response = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', email: cloudSync.email, data: encrypted })
          });
          
          const result = await response.json();
          if (result.success) {
            setSyncStatus('synced');
            lastServerUpdate = Date.now();
            localStorage.setItem('lumina_last_server_update', lastServerUpdate.toString());
          } else {
            setSyncStatus('error');
          }
        } else {
          setSyncStatus('synced');
        }
      } catch (err) {
        setSyncStatus('error');
      }
    };

    const interval = setInterval(syncWithServer, 10000);
    syncWithServer(); // Initial sync
    return () => clearInterval(interval);
  }, [store.settings.cloudSync]);

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
              onImportData={handleImportData}
              onClose={() => setPanel('chat')}
            />
          )}
        </div>
      </div>
    </>
  );
}
