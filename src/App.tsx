import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import { useAppStore } from './hooks/useAppStore';
import type { Panel } from './types';

export default function App() {
  const store = useAppStore();
  const [panel, setPanel] = useState<Panel>('chat');
  const [homeMode, setHomeMode] = useState<'chat' | 'image'>('chat');
  const [homeAttachments, setHomeAttachments] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    
    const userMsg = messages[userMsgIdx];
    
    // Delete from last assistant message onwards (including tool messages)
    store.deleteMessagesFrom(store.activeConvId, messages[lastAssistantIdx].id);
    
    // Resend user message
    if (store.activeConversation.mode === 'image') {
      store.generateImage(userMsg.content, store.activeConvId);
    } else {
      store.sendMessage(userMsg.content, userMsg.images || [], store.activeConvId);
    }
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

  return (
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
          homeMode={homeMode}
          homeAttachments={homeAttachments}
          prettifyModelNames={store.settings.prettifyModelNames}
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
  );
}
