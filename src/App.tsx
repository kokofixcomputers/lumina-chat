import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import WelcomeScreen from './components/WelcomeScreen';
import SharePanel from './components/SharePanel';
import ViewChatModal from './components/ViewChatModal';
import { useAppStore } from './hooks/useAppStore';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from './utils/syncStatus';
import { mergeConversations } from './utils/mergeConversations';
import { extensionLoader } from './extensions/extensionLoader';
import { handleDeepLinkOrShare, registerDeepLinkProtocol } from './utils/deepLink';
import { registerDeepLinkHandler, checkForDeepLinkOnStartup } from './utils/tauriDeepLink';
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
  const [showViewChatModal, setShowViewChatModal] = useState(false);

  const handleGetStarted = () => {
    localStorage.setItem('notfirsttime', 'true');
    setShowWelcome(false);
  };

  // Initialize extensions on app startup
  useEffect(() => {
    extensionLoader.initializeExtensions().catch(error => {
      console.error('Failed to initialize extensions:', error);
    });
  }, []);

  // Handle deep links and shared conversations
  useEffect(() => {
    handleDeepLinkOrShare((conversation) => {
      // Add the shared conversation to the app
      store.setConversations(prev => [conversation, ...prev]);
      // Switch to chat panel
      setPanel('chat');
    }).then(result => {
      if (result.loaded && result.error) {
        console.error('Share loading error:', result.error);
      }
    });
  }, [store]);

  // Set default window size when running inside Tauri
  useEffect(() => {
    if (!isTauri()) return;
    
    // Register deep link protocol
    registerDeepLinkProtocol();
    
    // Register Tauri deep link handler
    registerDeepLinkHandler().catch(error => {
      console.error('Failed to register Tauri deep link handler:', error);
    });
    
    // Check for deep link on startup
    checkForDeepLinkOnStartup().catch(error => {
      console.error('Failed to check for deep link on startup:', error);
    });
    
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

  const openSharePanel = () => setPanel('share');

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
    
    const userMsg = messages[userMsgIdx];
    const assistantMsg = messages[lastAssistantIdx];
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
    
    // Store version info globally to apply to new assistant message
    (window as any).pendingRetryVersionInfo = { convId, versions, currentVersionIndex: versions.length };
    console.log('Stored pending retry version info:', (window as any).pendingRetryVersionInfo);
    
    // Delete from user message onwards to remove assistant and avoid duplicates
    store.deleteMessagesFrom(convId, userMsg.id);
    
    // Resend user message after a brief delay to regenerate assistant response
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

  const handleContinue = (msgId: string) => {
    if (!store.activeConvId || !store.activeConversation) return;
    
    const message = store.activeConversation.messages.find(m => m.id === msgId);
    if (!message || message.role !== 'assistant') return;
    
    // Find the user message that prompted this assistant response
    const msgIndex = store.activeConversation.messages.findIndex(m => m.id === msgId);
    let userMsg = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (store.activeConversation.messages[i].role === 'user') {
        userMsg = store.activeConversation.messages[i];
        break;
      }
    }
    
    if (!userMsg) return;
    
    // Create a continue prompt that includes the previous context
    const continuePrompt = `Continue as if it were the same message, do not re-do the markdown or etc the messages are merged automatically. Continue from where you left off: "${message.content.slice(-200)}"`;
    
    // Send the continue message
    store.sendMessage(continuePrompt, [], store.activeConvId);
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
    
    // Find the message and preserve its versions
    const message = store.activeConversation.messages.find(m => m.id === msgId);
    console.log('Version change - Message found:', message);
    console.log('Version change - Message versions:', message?.versions);
    console.log('Version change - Requested index:', versionIndex);
    
    if (message && message.versions) {
      store.updateMessageVersions(store.activeConvId, msgId, message.versions, versionIndex);
      console.log('Version change - Updated with versions preserved');
    } else {
      console.log('Version change - No message or versions found');
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
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Add the complete conversation to the store
    store.setConversations([newConv, ...store.conversations]);
    store.setActiveConvId(newConv.id);
  };

  const handleUnshare = async () => {
    if (!store.activeConversation) return;
    
    // Remove share info from the conversation
    const updatedConversations = store.conversations.map(conv => 
      conv.id === store.activeConversation?.id 
        ? { ...conv, shareInfo: undefined }
        : conv
    );
    store.setConversations(updatedConversations);
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

  // Initialize sync manager for continuous operation
  useEffect(() => {
    let cleanupFn: (() => void) | undefined;

    const initSync = async () => {
      const cloudSync = store.settings.cloudSync;
      if (!cloudSync?.enabled || !cloudSync?.email || !cloudSync?.password) {
        return;
      }

      const { getSyncManager } = await import('./utils/syncManager');
      
      const syncManager = getSyncManager({
        onConnectionChange: (connected) => {
          // Update global sync status
          if (connected) {
            setSyncStatus('synced');
          } else {
            setSyncStatus('error');
          }
        },
        onAuthSuccess: (id, isNew) => {
          console.log('Sync authenticated:', isNew ? 'New user' : 'Existing user');
          setSyncStatus('synced');
        },
        onAuthError: (error) => {
          console.error('Sync auth error:', error);
          setSyncStatus('error');
        },
        onInitialState: async (data) => {
          // Import initial data from server
          if (data.conversations) {
            const syncUtils = await import('./utils/syncUtils');
            const mergedConversations = syncUtils.mergeConversationsSafely(store.conversations, data.conversations);
            store.setConversations(mergedConversations);
          }
          if (data.settings) {
            store.updateSettings(data.settings);
          }
          // Update storage monitor's snapshot so it doesn't see these as local changes
          (window as any).__syncLastConversations = localStorage.getItem('lumina_conversations');
        },
        onSyncAction: (action) => {
          // Handle incoming sync actions from remote
          console.log('[CLIENT] Received sync action:', action.type, action.data);
          switch (action.type) {
            case 'create_conversation':
              store.setConversations([{ ...action.data, messages: [] }, ...store.conversations]);
              break;
            case 'create_message':
              const conv = store.conversations.find(c => c.id === action.data.conversationId);
              if (conv) {
                const updatedConv = {
                  ...conv,
                  messages: [...conv.messages, action.data.message],
                  updatedAt: action.timestamp
                };
                store.setConversations(store.conversations.map(c => 
                  c.id === action.data.conversationId ? updatedConv : c
                ));
              }
              break;
            case 'delete_message': {
              const { conversationId, messageId } = action.data;
              const convWithMsg = store.conversations.find(c => c.id === conversationId);
              if (convWithMsg) {
                const updatedConv = {
                  ...convWithMsg,
                  messages: convWithMsg.messages.filter(m => m.id !== messageId),
                  updatedAt: action.timestamp
                };
                store.setConversations(store.conversations.map(c => 
                  c.id === conversationId ? updatedConv : c
                ));
              }
              break;
            }
            case 'delete_conversation':
              store.setConversations(store.conversations.filter(c => c.id !== action.data.conversationId));
              break;
            case 'update_title':
              const titleConv = store.conversations.find(c => c.id === action.data.conversationId);
              if (titleConv) {
                const updatedConv = {
                  ...titleConv,
                  title: action.data.title,
                  updatedAt: action.timestamp
                };
                store.setConversations(store.conversations.map(c => 
                  c.id === action.data.conversationId ? updatedConv : c
                ));
              }
              break;
            case 'update_followup': {
              const { conversationId, messageId, followUps } = action.data;
              const followupConv = store.conversations.find(c => c.id === conversationId);
              if (followupConv) {
                const updatedConv = {
                  ...followupConv,
                  messages: followupConv.messages.map(m => 
                    m.id === messageId ? { ...m, followUps } : m
                  ),
                  updatedAt: action.timestamp
                };
                store.setConversations(store.conversations.map(c => 
                  c.id === conversationId ? updatedConv : c
                ));
              }
              break;
            }
            // Handle other action types as needed
          }
          // Update storage monitor's snapshot so it doesn't see remote changes as local changes
          (window as any).__syncLastConversations = localStorage.getItem('lumina_conversations');
        }
      });

      // Auto-connect if credentials are available
      if (cloudSync.enabled) {
        syncManager.connect({ 
          username: cloudSync.email, 
          password: cloudSync.password 
        });
      }

      // Store the cleanup function
      cleanupFn = () => {
        syncManager.disconnect();
      };
    };

    initSync();
    
    return () => {
      cleanupFn?.();
    };
  }, []); // No dependencies - runs once on mount and stays active

  // Monitor localStorage changes and sync them
  useEffect(() => {
    let cleanupFn: (() => void) | undefined;

    const initStorageMonitoring = async () => {
      if (!store.settings.cloudSync?.enabled) {
        console.log('Cloud sync disabled, skipping storage monitoring');
        return;
      }

      const { getSyncManager } = await import('./utils/syncManager');
      const syncManager = getSyncManager();
      
      // Wait for connection with retry logic
      let retryCount = 0;
      const maxRetries = 10;
      const retryDelay = 1000;
      
      const waitForConnection = () => {
        return new Promise<boolean>((resolve) => {
          const checkConnection = () => {
            if (syncManager.isConnected()) {
              console.log('Storage monitoring started - sync manager is connected');
              resolve(true);
            } else if (retryCount >= maxRetries) {
              console.log('Sync manager failed to connect after', maxRetries, 'attempts');
              resolve(false);
            } else {
              retryCount++;
              console.log('Waiting for sync manager connection... attempt', retryCount);
              setTimeout(checkConnection, retryDelay);
            }
          };
          checkConnection();
        });
      };

      const isConnected = await waitForConnection();
      if (!isConnected) {
        return;
      }

      // Use shared snapshot so sync handlers can update it when applying remote changes
      let localLastConversations = localStorage.getItem('lumina_conversations');
      (window as any).__syncLastConversations = localLastConversations;
      let localLastSettings = localStorage.getItem('lumina_settings');

      const checkForChanges = () => {
        // Get shared snapshot (may have been updated by remote sync handlers)
        const lastConversations = (window as any).__syncLastConversations ?? localLastConversations;
        const currentConversations = localStorage.getItem('lumina_conversations');
        const currentSettings = localStorage.getItem('lumina_settings');

        // Check if conversations changed (local changes only - remote changes update the snapshot)
        if (currentConversations !== lastConversations) {
          try {
            const oldConversations = lastConversations ? JSON.parse(lastConversations) : [];
            const newConversations = currentConversations ? JSON.parse(currentConversations) : [];
            
            // Find what changed
            const changes = findConversationsDiff(oldConversations, newConversations);
            
            // Send sync actions for local changes only
            console.log('Processing sync changes:', changes.length, 'changes detected');
            changes.forEach(change => {
              if (change.type === 'added') {
                console.log('Sending create conversation for:', change.conversation.id);
                syncManager.sendCreateConversation(change.conversation);
              } else if (change.type === 'modified') {
                // Check what changed in the conversation
                const oldConv = oldConversations.find(c => c.id === change.conversation.id);
                const newConv = newConversations.find(c => c.id === change.conversation.id);
                
                if (oldConv && newConv) {
                  // Check for title changes
                  if (oldConv.title !== newConv.title) {
                    syncManager.sendUpdateTitle(change.conversation.id, newConv.title);
                  }
                  
                  // Check for new messages
                  const oldMessageIds = new Set((oldConv.messages || []).map((m: any) => m.id));
                  const newMessageIds = new Set((newConv.messages || []).map((m: any) => m.id));
                  const newMessages = (newConv.messages || []).filter((m: any) => !oldMessageIds.has(m.id));
                  
                  // Send sync actions for new messages
                  console.log('Sending', newMessages.length, 'new messages for conversation:', change.conversation.id);
                  newMessages.forEach((message: any) => {
                    console.log('Sending create message:', message.id, 'for conversation:', change.conversation.id);
                    syncManager.sendCreateMessage(change.conversation.id, message);
                  });
                  
                  // Check for deleted messages
                  const deletedMessages = (oldConv.messages || []).filter((m: any) => !newMessageIds.has(m.id));
                  console.log('Sending', deletedMessages.length, 'deleted messages for conversation:', change.conversation.id);
                  deletedMessages.forEach((message: any) => {
                    console.log('Sending delete message:', message.id, 'for conversation:', change.conversation.id);
                    syncManager.sendDeleteMessage(change.conversation.id, message.id);
                  });
                  
                  // Check for follow-up changes in existing messages
                  const oldMsgMap = new Map((oldConv.messages || []).map((m: any) => [m.id, m]));
                  (newConv.messages || []).forEach((newMsg: any) => {
                    const oldMsg = oldMsgMap.get(newMsg.id) as { followUps?: string[] } | undefined;
                    if (oldMsg) {
                      const oldFollowUps = oldMsg.followUps || [];
                      const newFollowUps = (newMsg.followUps as string[]) || [];
                      if (JSON.stringify(oldFollowUps) !== JSON.stringify(newFollowUps)) {
                        console.log('Sending update_followup for message:', newMsg.id);
                        syncManager.sendUpdateFollowup(change.conversation.id, newMsg.id, newFollowUps);
                      }
                    }
                  });
                }
              } else if (change.type === 'deleted') {
                console.log('Sending delete conversation for:', change.conversationId);
                syncManager.sendDeleteConversation(change.conversationId);
              }
            });
            
            // Update both local and shared snapshot
            localLastConversations = currentConversations;
            (window as any).__syncLastConversations = currentConversations;
          } catch (error) {
            console.error('Error syncing conversations:', error);
          }
        }

        // Check if settings changed
        if (currentSettings !== localLastSettings) {
          try {
            // Settings changes could be handled here if needed
            console.log('Settings changed, could sync if needed');
            localLastSettings = currentSettings;
          } catch (error) {
            console.error('Error syncing settings:', error);
          }
        }
      };

      // Check for changes every second
      const interval = setInterval(checkForChanges, 1000);

      // Store the cleanup function
      cleanupFn = () => {
        clearInterval(interval);
      };
    };

    initStorageMonitoring();
    
    return () => {
      cleanupFn?.();
    };
  }, [store.settings.cloudSync?.enabled, syncStatus]);

  // Helper function to find differences in conversations
  const findConversationsDiff = (oldConvs: any[], newConvs: any[]) => {
    const changes = [];
    
    // Find added conversations
    const oldIds = new Set(oldConvs.map(c => c.id));
    const newIds = new Set(newConvs.map(c => c.id));
    
    newConvs.forEach(conv => {
      if (!oldIds.has(conv.id)) {
        changes.push({ type: 'added', conversation: conv });
      }
    });
    
    oldConvs.forEach(conv => {
      if (!newIds.has(conv.id)) {
        changes.push({ type: 'deleted', conversationId: conv.id });
      } else {
        // Check if modified
        const newConv = newConvs.find(c => c.id === conv.id);
        if (JSON.stringify(conv) !== JSON.stringify(newConv)) {
          changes.push({ type: 'modified', conversation: newConv });
        }
      }
    });
    
    return changes;
  };

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
            onContinue={handleContinue}
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
            onOpenShare={openSharePanel}
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

          {panel === 'share' && (
            <SharePanel
              conversation={store.activeConversation}
              onShare={handleShare}
              onUnshare={handleUnshare}
              onClose={() => setPanel('chat')}
            />
          )}
        </div>
      </div>
      
      {/* Modals */}
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
