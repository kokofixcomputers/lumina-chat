import { useState, useEffect } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import OnboardingScreen from './components/OnboardingScreen';
import SharePanel from './components/SharePanel';
import ViewChatModal from './components/ViewChatModal';
import DesktopAppToast from './components/DesktopAppToast';
import FineTuningList from './pages/FineTuningList';
import FineTuningDetail from './pages/FineTuningDetail';
import { useAppStore } from './hooks/useAppStore';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from './utils/syncStatus';
import { mergeConversations } from './utils/mergeConversations';
import { extensionLoader } from './extensions/extensionLoader';
import { handleDeepLinkOrShare, registerDeepLinkProtocol } from './utils/deepLink';
import { registerDeepLinkHandler, checkForDeepLinkOnStartup } from './utils/tauriDeepLink';
import './utils/storageMigration'; // Load migration utilities
import './utils/syncIndexedDB'; // Load IndexedDB sync utilities
import type { Panel, Message } from './types';

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
  const [fineTuningView, setFineTuningView] = useState<'list' | { id: string }>('list');

  const handleGetStarted = () => {
    localStorage.setItem('notfirsttime', 'true');
    setShowWelcome(false);
  };

  // Initialize extensions and OAuth handlers on app startup
  useEffect(() => {
    // Clean timestamps from extensions to prevent sync conflicts
    import('./extensions/extensionStorage').then(({ extensionStorage }) => {
      extensionStorage.cleanTimestamps();
    }).catch(error => {
      console.error('Failed to clean extension timestamps:', error);
    });
    
    extensionLoader.initializeExtensions().catch(error => {
      console.error('Failed to initialize extensions:', error);
    });
    
    // Check if we're in a popup window (OAuth callback)
    if (window.opener) {
      console.log('[APP] Detected popup window, initializing OAuth callback handler');
      import('./utils/oauthCallback').then(({ initOAuthCallback }) => {
        const cleanup = initOAuthCallback();
        
        return () => {
          cleanup?.();
        };
      });
    } else {
      // Initialize OAuth URL handler for main app
      console.log('[APP] Main app detected, initializing OAuth redirect handler');
      import('./utils/urlHandler').then(({ initOAuthRedirectHandler }) => {
        const cleanup = initOAuthRedirectHandler();
        
        return () => {
          cleanup?.();
        };
      });
    }
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

  const handleRetry = async () => {
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
    
    // Send add_retry sync action so other clients get the retry versions
    const { getSyncManager } = await import('./utils/syncManager');
    const syncManager = getSyncManager();
    if (syncManager.isConnected()) {
      const newVersion = versions[versions.length - 1];
      syncManager.sendAddRetry(convId, assistantMsg.id, newVersion);
      console.log('[SYNC] Sent add_retry for message:', assistantMsg.id);
      
      // Also send delete_message for the old assistant message so other clients remove it
      syncManager.sendDeleteMessage(convId, assistantMsg.id);
      console.log('[SYNC] Sent delete_message for old assistant:', assistantMsg.id);
    }
    
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

  const handleForkConversation = () => {
    const activeConv = store.activeConversation;
    if (!activeConv || activeConv.messages.length === 0) return;
    
    console.log('[FORK] Starting fork of conversation:', store.activeConvId);
    console.log('[FORK] Original messages count:', activeConv.messages.length);
    
    // Create a new conversation
    const forkedConvId = store.newConversation(
      activeConv.mode || 'chat',
      activeConv.attachments || []
    );
    
    console.log('[FORK] Created new conversation:', forkedConvId);
    
    // Copy all messages from the current conversation
    // We need to create new message objects to avoid ID conflicts
    const messageCopies = activeConv.messages.map((message, index) => {
      console.log(`[FORK] Copying message ${index + 1}:`, message.id, message.role, message.content?.slice(0, 50));
      return {
        ...message,
        id: crypto.randomUUID(), // Generate new ID for each message
        timestamp: Date.now(), // Update timestamp
      };
    });
    
    // Add all copied messages to the new conversation using setConversations
    store.setConversations(prev => prev.map(c => {
      if (c.id !== forkedConvId) return c;
      return {
        ...c,
        messages: messageCopies
      };
    }));
    
    console.log('[FORK] Copied all messages to:', forkedConvId);
    
    // Copy conversation metadata
    if (activeConv.title) {
      store.updateConversationTitle(forkedConvId, 
        `${activeConv.title} (Forked)`
      );
    }
    
    if (activeConv.modelId) {
      store.setConversationModel(forkedConvId, activeConv.modelId);
    }
    
    if (activeConv.systemPrompt) {
      // System prompt is part of the conversation, we need to update it via setConversations
      store.setConversations(prev => prev.map(c => {
        if (c.id !== forkedConvId) return c;
        return {
          ...c,
          systemPrompt: activeConv.systemPrompt
        };
      }));
    }
    
    // Switch to the new conversation
    store.setActiveConvId(forkedConvId);
    
    // Verify the fork worked
    setTimeout(() => {
      const forkedConv = store.conversations.find(c => c.id === forkedConvId);
      console.log('[FORK] Verification - Forked conversation messages count:', forkedConv?.messages.length || 0);
      console.log('[FORK] Verification - Forked conversation title:', forkedConv?.title);
    }, 100);
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

  const handleImportData = async (data: any) => {
    if (data.settings) {
      store.updateSettings(data.settings);
    }
    if (data.extensions) {
      try {
        const { extensionStorage } = await import('./extensions/extensionStorage');
        // Import extensions to lumina_extensions localStorage
        localStorage.setItem('lumina_extensions', JSON.stringify(data.extensions));
        console.log('[IMPORT] Extensions imported successfully:', Object.keys(data.extensions).length, 'extensions');
      } catch (error) {
        console.error('Failed to import extensions:', error);
      }
    }
    if (data.conversations) {
      try {
        const { SyncIndexedDB } = await import('./utils/syncIndexedDB');
        await SyncIndexedDB.importConversations(data.conversations);
        window.location.reload();
      } catch (error) {
        console.error('Failed to import conversations:', error);
      }
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

  const openFineTuning = () => {
    setFineTuningView('list');
    setPanel('fine-tuning');
  };

  const handleOpenFineTuningDetail = (id: string) => {
    setFineTuningView({ id });
    setPanel('fine-tuning');
  };

  const handleExitFineTuning = () => {
    setPanel('chat');
    setFineTuningView('list');
  };

  useEffect(() => {
    const handleOpenProviders = () => {
      setPanel('settings');
    }
    window.addEventListener('openProviders', handleOpenProviders as EventListener);
    return () => window.removeEventListener('openProviders', handleOpenProviders as EventListener);
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
          console.log('[SYNC] Received initial state:', data);
          console.log('[SYNC] Current local conversations:', store.conversations.length);
          console.log('[SYNC] Server conversations:', data.conversations?.length || 0);
          
          // Suppress storage monitor during initial sync for much longer period
          (window as any).__syncSuppressUntil = Date.now() + 5000;
          
          // Import initial data from server - merge with local to preserve offline changes
          if (data.conversations) {
            const syncUtils = await import('./utils/syncUtils');
            
            // Get current local conversations from IndexedDB to ensure we have latest
            const { SyncIndexedDB } = await import('./utils/syncIndexedDB');
            const localConversations = await SyncIndexedDB.exportConversations();
            
            console.log('[SYNC] Merging conversations - Local:', localConversations.length, 'Server:', data.conversations.length);
            
            // Merge server data with local data (local takes precedence for conflicts)
            const mergedConversations = syncUtils.mergeConversationsSafely(localConversations, data.conversations);
            
            console.log('[SYNC] Merged conversations count:', mergedConversations.length);
            
            // Find conversations that exist locally but not on server (need to be synced up)
            const localOnlyConversations = localConversations.filter(local => 
              !data.conversations.some((server: any) => server.id === local.id)
            );
            
            if (localOnlyConversations.length > 0) {
              console.log('[SYNC] Found', localOnlyConversations.length, 'local-only conversations to sync up');
              
              // Sync up local-only conversations after a delay to ensure they're saved
              setTimeout(async () => {
                try {
                  const { getSyncManager } = await import('./utils/syncManager');
                  const syncManager = getSyncManager();
                  
                  if (syncManager.isConnected()) {
                    console.log('[SYNC] Syncing up local-only conversations');
                    
                    for (const conv of localOnlyConversations) {
                      // Send create conversation action (without messages first)
                      const { messages, ...convWithoutMessages } = conv;
                      syncManager.sendCreateConversation(convWithoutMessages);
                      
                      // Then send messages
                      for (const message of messages || []) {
                        syncManager.sendCreateMessage(conv.id, message);
                      }
                    }
                  }
                } catch (error) {
                  console.error('[SYNC] Failed to sync up local conversations:', error);
                }
              }, 2000);
            }
            
            store.setConversations(mergedConversations);
          }
          if (data.settings) {
            // Extract extensions from settings and save separately
            const { cloudSync: remoteCloudSync, extensions: remoteExtensions, ...settingsOnly } = data.settings;
            store.updateSettings(settingsOnly);
            
            // Handle extensions separately if they exist
            if (remoteExtensions) {
              try {
                localStorage.setItem('lumina_extensions', JSON.stringify(remoteExtensions));
                console.log('[SYNC-INIT] Extensions loaded from remote:', Object.keys(remoteExtensions).length, 'extensions');
                // Trigger extension reload
                import('./extensions/extensionLoader').then(({ extensionLoader }) => {
                  extensionLoader.initializeExtensions().catch(error => {
                    console.error('Failed to reload extensions after initial sync:', error);
                  });
                });
              } catch (error) {
                console.error('Failed to load extensions from remote:', error);
              }
            }
          }
          
          // Update IndexedDB snapshot after useEffect saves (needs longer delay for IndexedDB)
          setTimeout(async () => {
            console.log('[SYNC] Updating snapshot after initial state');
            try {
              const { SyncIndexedDB } = await import('./utils/syncIndexedDB');
              await SyncIndexedDB.updateSnapshot();
              // Extend suppression a bit more after snapshot update
              (window as any).__syncSuppressUntil = Date.now() + 3000;
            } catch (error) {
              console.error('[SYNC] Failed to update snapshot after initial state:', error);
            }
          }, 1500);
        },
        onSyncAction: (action) => {
          // Handle incoming sync actions from remote
          console.log('[CLIENT] Received sync action:', action.type, action.data);
          console.log('[CLIENT] Current conversations:', store.conversations.map(c => ({ id: c.id, msgCount: c.messages.length })));
          
          // Mark this action as recently sent to prevent echoing it back
          const actionKey = `${action.type}:${JSON.stringify(action.data)}`;
          if (typeof window !== 'undefined') {
            (window as any).__recentlyReceivedActions = (window as any).__recentlyReceivedActions || new Map();
            (window as any).__recentlyReceivedActions.set(actionKey, Date.now());
          }
          
          switch (action.type) {
            case 'create_conversation':
              // Use functional update to read from latest state, avoiding stale closure
              store.setConversations((prev: any[]) => {
                // Check if conversation already exists by UUID
                if (prev.find(c => c.id === action.data.id)) {
                  console.log('[CLIENT] Conversation already exists, ignoring:', action.data.id);
                  return prev;
                }
                console.log('[CLIENT] Adding new conversation:', action.data.id);
                return [action.data, ...prev];
              });
              break;
            case 'create_message':
              // Use functional update to read from latest state, avoiding stale closure
              store.setConversations((prev: any[]) => {
                const conv = prev.find(c => c.id === action.data.conversationId);
                if (!conv) {
                  console.log('[CLIENT] Conversation not found for message:', action.data.conversationId);
                  return prev;
                }
                
                // Check if message already exists by UUID
                if (conv.messages.find(m => m.id === action.data.message.id)) {
                  console.log('[CLIENT] Message already exists, ignoring:', action.data.message.id);
                  return prev;
                }
                
                console.log('[CLIENT] Adding new message:', action.data.message.id, 'to conversation:', action.data.conversationId);
                const isFirstUserMessage = conv.messages.length === 0 && action.data.message.role === 'user';
                const title = isFirstUserMessage 
                  ? action.data.message.content.slice(0, 50) + (action.data.message.content.length > 50 ? '...' : '')
                  : conv.title;
                const updatedConv = {
                  ...conv,
                  messages: [...conv.messages, action.data.message],
                  title,
                  updatedAt: action.timestamp
                };
                return prev.map(c => c.id === action.data.conversationId ? updatedConv : c);
              });
              break;
            case 'delete_message':
              store.setConversations((prev: any[]) => {
                const conv = prev.find(c => c.id === action.data.conversationId);
                if (!conv) return prev;
                return prev.map(c => c.id === action.data.conversationId ? {
                  ...c,
                  messages: c.messages.filter((m: any) => m.id !== action.data.messageId),
                  updatedAt: action.timestamp
                } : c);
              });
              break;
            case 'delete_conversation':
              store.setConversations((prev: any[]) => prev.filter(c => c.id !== action.data.conversationId));
              break;
            case 'update_title':
              store.setConversations((prev: any[]) => {
                const conv = prev.find(c => c.id === action.data.conversationId);
                if (!conv) return prev;
                return prev.map(c => c.id === action.data.conversationId ? {
                  ...c,
                  title: action.data.title,
                  updatedAt: action.timestamp
                } : c);
              });
              break;
            case 'update_followup':
              store.setConversations((prev: any[]) => {
                const conv = prev.find(c => c.id === action.data.conversationId);
                if (!conv) return prev;
                return prev.map(c => c.id === action.data.conversationId ? {
                  ...c,
                  messages: c.messages.map((m: any) => 
                    m.id === action.data.messageId ? { ...m, followUps: action.data.followUps } : m
                  ),
                  updatedAt: action.timestamp
                } : c);
              });
              break;
            case 'update_settings':
              // Update settings from remote - exclude cloudSync to avoid overwriting local credentials
              const { cloudSync: remoteCloudSync, extensions: remoteExtensions, ...remoteSettings } = action.data.settings;
              store.updateSettings(remoteSettings);
              
              // Handle extensions separately if they exist in the sync data
              if (remoteExtensions) {
                try {
                  localStorage.setItem('lumina_extensions', JSON.stringify(remoteExtensions));
                  console.log('[SYNC] Extensions updated from remote:', Object.keys(remoteExtensions).length, 'extensions');
                  // Trigger extension reload
                  import('./extensions/extensionLoader').then(({ extensionLoader }) => {
                    extensionLoader.initializeExtensions().catch(error => {
                      console.error('Failed to reload extensions after sync:', error);
                    });
                  });
                } catch (error) {
                  console.error('Failed to update extensions from remote:', error);
                }
              }
              
              // Update the tracking variable
              (window as any).__syncLastExtensions = localStorage.getItem('lumina_extensions');
              break;
            // Handle other action types as needed
          }
          // Suppress storage monitor for longer to prevent echoing remote changes
          (window as any).__syncSuppressUntil = Date.now() + 2000;
          
          // Update snapshot immediately and then again after useEffect
          const updateSnapshot = async () => {
            console.log('[SYNC] Updating snapshot after remote action');
            try {
              const { SyncIndexedDB } = await import('./utils/syncIndexedDB');
              await SyncIndexedDB.updateSnapshot();
              (window as any).__syncLastSettings = localStorage.getItem('lumina_settings');
            } catch (error) {
              console.error('[SYNC] Failed to update IndexedDB snapshot:', error);
            }
          };
          
          // Update immediately
          updateSnapshot();
          // And again after useEffect runs (with current state)
          setTimeout(updateSnapshot, 100);
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
      
      // Check if already connected first (handles auto-sync toggle while connected)
      if (syncManager.isConnected()) {
        console.log('Storage monitoring started - sync manager already connected');
        // Continue to monitoring setup
      } else {
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
      }

      // Initialize IndexedDB sync
      const { SyncIndexedDB } = await import('./utils/syncIndexedDB');
      await SyncIndexedDB.initializeSync();
      
      let localLastSettings = localStorage.getItem('lumina_settings');
      // Initialize shared settings tracking
      (window as any).__syncLastSettings = localLastSettings;
      (window as any).__syncLastExtensions = localStorage.getItem('lumina_extensions');
      
      // Track recently sent actions to prevent duplicates
      const recentlySentActions = new Map<string, number>();
      const ACTION_DEDUP_WINDOW = 5000; // 5 seconds
      
      const isRecentlySent = (actionType: string, data: any): boolean => {
        const key = `${actionType}:${JSON.stringify(data)}`;
        
        // Check if we recently sent this action
        const timestamp = recentlySentActions.get(key);
        
        if (actionType === 'update_settings') {
          console.log('[SYNC-DEDUP] Settings action check - Key:', key);
          console.log('[SYNC-DEDUP] Settings action check - Timestamp:', timestamp);
          console.log('[SYNC-DEDUP] Settings action check - Time since:', timestamp ? Date.now() - timestamp : 'N/A');
          console.log('[SYNC-DEDUP] Settings action check - Window:', ACTION_DEDUP_WINDOW);
          console.log('[SYNC-DEDUP] Settings action check - In window:', timestamp && Date.now() - timestamp < ACTION_DEDUP_WINDOW);
        }
        
        if (timestamp && Date.now() - timestamp < ACTION_DEDUP_WINDOW) {
          console.log('[SYNC] Ignoring duplicate action:', actionType, key);
          console.log('[SYNC] Time since last sent:', Date.now() - timestamp, 'ms');
          return true;
        }
        
        // Check if we recently received this action from server (prevent echoing)
        const recentlyReceived = (window as any).__recentlyReceivedActions;
        if (recentlyReceived) {
          const receivedTimestamp = recentlyReceived.get(key);
          if (receivedTimestamp && Date.now() - receivedTimestamp < ACTION_DEDUP_WINDOW) {
            console.log('[SYNC] Ignoring recently received action (prevent echo):', actionType, key);
            return true;
          }
          
          // Clean old received actions
          for (const [k, t] of recentlyReceived.entries()) {
            if (Date.now() - t > ACTION_DEDUP_WINDOW) {
              recentlyReceived.delete(k);
            }
          }
        }
        
        recentlySentActions.set(key, Date.now());
        
        // Clean old sent entries
        for (const [k, t] of recentlySentActions.entries()) {
          if (Date.now() - t > ACTION_DEDUP_WINDOW) {
            recentlySentActions.delete(k);
          }
        }
        
        return false;
      };

      const checkForChanges = async () => {
        try {
          const { hasChanges, oldConversations, newConversations } = await SyncIndexedDB.checkForChanges();
          
          if (!hasChanges) {
            return;
          }

          console.log('[SYNC-MONITOR] Processing IndexedDB changes');
          console.log('[SYNC-MONITOR] old convs:', oldConversations.map(c => ({ id: c.id, msgs: c.messages?.length })));
          console.log('[SYNC-MONITOR] new convs:', newConversations.map(c => ({ id: c.id, msgs: c.messages?.length })));
          
          // Find what changed
          const changes = SyncIndexedDB.findConversationsDiff(oldConversations, newConversations);
          
          // Send sync actions for local changes only
          console.log('Processing sync changes:', changes.length, 'changes detected');
          changes.forEach(change => {
            if (change.type === 'added') {
              if (!isRecentlySent('create_conversation', { id: change.conversation.id })) {
                console.log('Sending create conversation for:', change.conversation.id);
                syncManager.sendCreateConversation(change.conversation);
              }
            } else if (change.type === 'modified') {
              // Check what changed in the conversation
              const oldConv = oldConversations.find(c => c.id === change.conversation.id);
              const newConv = newConversations.find(c => c.id === change.conversation.id);
              
              if (oldConv && newConv) {
                // Check for title changes
                if (oldConv.title !== newConv.title) {
                  if (!isRecentlySent('update_title', { conversationId: change.conversation.id, title: newConv.title })) {
                    syncManager.sendUpdateTitle(change.conversation.id, newConv.title);
                  }
                }
                
                // Check for new messages
                const oldMessageIds = new Set((oldConv.messages || []).map((m: any) => m.id));
                const newMessageIds = new Set((newConv.messages || []).map((m: any) => m.id));
                const newMessages = (newConv.messages || []).filter((m: any) => !oldMessageIds.has(m.id));
                
                // Send sync actions for new messages
                console.log('Sending', newMessages.length, 'new messages for conversation:', change.conversation.id);
                newMessages.forEach((message: any) => {
                  if (!isRecentlySent('create_message', { conversationId: change.conversation.id, messageId: message.id })) {
                    console.log('Sending create message:', message.id, 'for conversation:', change.conversation.id);
                    syncManager.sendCreateMessage(change.conversation.id, message);
                  }
                });
                
                // Check for deleted messages
                const deletedMessages = (oldConv.messages || []).filter((m: any) => !newMessageIds.has(m.id));
                if (deletedMessages.length > 0) {
                  console.log('DELETED MESSAGES DETECTED:', deletedMessages.length);
                  console.log('  oldConv.messages:', (oldConv.messages || []).map((m: any) => m.id));
                  console.log('  newConv.messages:', (newConv.messages || []).map((m: any) => m.id));
                  console.log('  newMessageIds:', Array.from(newMessageIds));
                  console.log('  deleted:', deletedMessages.map((m: any) => m.id));
                }
                deletedMessages.forEach((message: any) => {
                  if (!isRecentlySent('delete_message', { conversationId: change.conversation.id, messageId: message.id })) {
                    console.log('Sending delete message:', message.id, 'for conversation:', change.conversation.id);
                    syncManager.sendDeleteMessage(change.conversation.id, message.id);
                  }
                });
                
                // Check for follow-up changes in existing messages
                const oldMsgMap = new Map((oldConv.messages || []).map((m: any) => [m.id, m]));
                (newConv.messages || []).forEach((newMsg: any) => {
                  const oldMsg = oldMsgMap.get(newMsg.id) as { followUps?: string[] } | undefined;
                  if (oldMsg) {
                    const oldFollowUps = oldMsg.followUps || [];
                    const newFollowUps = (newMsg.followUps as string[]) || [];
                    if (JSON.stringify(oldFollowUps) !== JSON.stringify(newFollowUps)) {
                      if (!isRecentlySent('update_followup', { conversationId: change.conversation.id, messageId: newMsg.id, followUps: newFollowUps })) {
                        console.log('Sending update_followup for message:', newMsg.id);
                        syncManager.sendUpdateFollowup(change.conversation.id, newMsg.id, newFollowUps);
                      }
                    }
                  }
                });
              }
            } else if (change.type === 'deleted') {
              if (!isRecentlySent('delete_conversation', { conversationId: change.conversation.id })) {
                console.log('Sending delete conversation for:', change.conversation.id);
                syncManager.sendDeleteConversation(change.conversation.id);
              }
            }
          });
          
          // Update snapshot after processing changes
          await SyncIndexedDB.updateSnapshot();
        } catch (error) {
          console.error('Error syncing conversations:', error);
        }

        // Check if settings changed (settings still use localStorage)
        const currentSettings = localStorage.getItem('lumina_settings');
        const currentExtensions = localStorage.getItem('lumina_extensions');
        const lastSettings = (window as any).__syncLastSettings || localLastSettings;
        
        console.log('[SYNC-MONITOR] Settings check - Current:', currentSettings ? 'exists' : 'null');
        console.log('[SYNC-MONITOR] Extensions check - Current:', currentExtensions ? 'exists' : 'null');
        console.log('[SYNC-MONITOR] Settings check - Last:', lastSettings ? 'exists' : 'null');
        console.log('[SYNC-MONITOR] Settings changed:', currentSettings !== lastSettings);
        
        // Combine settings and extensions for sync
        const settingsChanged = currentSettings !== lastSettings;
        const extensionsChanged = currentExtensions !== (window as any).__syncLastExtensions;
        
        if (settingsChanged || extensionsChanged) {
          try {
            // Parse and send settings sync action
            const newSettings = currentSettings ? JSON.parse(currentSettings) : {};
            const newExtensions = currentExtensions ? JSON.parse(currentExtensions) : {};
            
            console.log('[SYNC-MONITOR] Full settings object:', newSettings);
            console.log('[SYNC-MONITOR] Full extensions object:', newExtensions);
            console.log('[SYNC-MONITOR] Shares:', newSettings.shares);
            console.log('[SYNC-MONITOR] Extensions from settings:', newSettings.extensions);
            console.log('[SYNC-MONITOR] Extensions from lumina_extensions:', newExtensions);
            console.log('[SYNC-MONITOR] Integrations:', newSettings.integrations);
            
            // Combine settings and extensions
            const combinedData = {
              ...newSettings,
              extensions: newExtensions // Override extensions with lumina_extensions data
            };
            
            // Exclude cloudSync credentials from sync
            const { cloudSync, ...syncSettings } = combinedData;
            console.log('[SYNC-MONITOR] Settings to sync (excluding cloudSync):', syncSettings);
            
            // Create a simpler key for settings deduplication
            const settingsKey = JSON.stringify(syncSettings);
            if (!isRecentlySent('update_settings', settingsKey)) {
              console.log('[SYNC] Sending settings update:', syncSettings);
              syncManager.sendUpdateSettings(syncSettings);
            } else {
              console.log('[SYNC] Ignoring duplicate settings update');
            }
            // Update both local and shared variables
            localLastSettings = currentSettings;
            (window as any).__syncLastSettings = currentSettings;
            (window as any).__syncLastExtensions = currentExtensions;
          } catch (error) {
            console.error('Error syncing settings:', error);
          }
        }
      };

      // Check for changes every second
      const interval = setInterval(checkForChanges, 1000);

      // Also monitor settings and extensions changes separately (since localStorage doesn't trigger IndexedDB changes)
      const checkSettingsChanges = () => {
        const currentSettings = localStorage.getItem('lumina_settings');
        const currentExtensions = localStorage.getItem('lumina_extensions');
        const lastSettings = (window as any).__syncLastSettings || localLastSettings;
        const lastExtensions = (window as any).__syncLastExtensions;
        
        const settingsChanged = currentSettings !== lastSettings;
        const extensionsChanged = currentExtensions !== lastExtensions;
        
        if (settingsChanged || extensionsChanged) {
          console.log('[SETTINGS-MONITOR] Settings/extensions change detected - Settings:', settingsChanged, 'Extensions:', extensionsChanged);
          try {
            const newSettings = currentSettings ? JSON.parse(currentSettings) : {};
            const newExtensions = currentExtensions ? JSON.parse(currentExtensions) : {};
            
            // Combine settings and extensions
            const combinedData = {
              ...newSettings,
              extensions: newExtensions
            };
            
            console.log('[SETTINGS-MONITOR] Parsed settings:', newSettings);
            console.log('[SETTINGS-MONITOR] Parsed extensions:', newExtensions);
            console.log('[SETTINGS-MONITOR] Combined data:', combinedData);
            
            // Exclude cloudSync credentials from sync
            const { cloudSync, ...syncSettings } = combinedData;
            const settingsKey = JSON.stringify(syncSettings);
            console.log('[SETTINGS-MONITOR] Settings key for sync:', settingsKey);
            
            if (!isRecentlySent('update_settings', settingsKey)) {
              console.log('[SETTINGS-MONITOR] Sending settings/extensions update:', syncSettings);
              syncManager.sendUpdateSettings(syncSettings);
            } else {
              console.log('[SETTINGS-MONITOR] Ignoring duplicate settings/extensions update');
            }
            
            // Update tracking variables
            if (settingsChanged) {
              localLastSettings = currentSettings;
              (window as any).__syncLastSettings = currentSettings;
            }
            if (extensionsChanged) {
              (window as any).__syncLastExtensions = currentExtensions;
            }
          } catch (error) {
            console.error('Error syncing settings/extensions:', error);
          }
        }
      };

      // Check settings every 500ms (more responsive)
      const settingsInterval = setInterval(checkSettingsChanges, 500);

      // Listen for storage events for immediate updates
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'lumina_extensions') {
          console.log('[STORAGE] Extensions changed, triggering immediate check');
          checkSettingsChanges();
        } else if (e.key === 'lumina_settings') {
          console.log('[STORAGE] Settings changed, triggering immediate check');
          checkSettingsChanges();
        }
      };
      window.addEventListener('storage', handleStorageChange);

      // Store the cleanup function
      cleanupFn = () => {
        clearInterval(interval);
        clearInterval(settingsInterval);
        window.removeEventListener('storage', handleStorageChange);
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
      {/* Loading screen while IndexedDB is initializing */}
      {store.isLoading && (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 dark:from-[rgb(14,14,16)] dark:via-blue-950/10 dark:to-purple-950/5 flex items-center justify-center p-4 fixed inset-0 z-50">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
              <Sparkles size={32} className="text-[rgb(var(--text))]" />
            </div>
            <h2 className="text-xl font-semibold text-[rgb(var(--text))]">Loading Lumina Chat...</h2>
            <p className="text-sm text-[rgb(var(--muted))]">Initializing your conversations</p>
          </div>
        </div>
      )}

      {showWelcome && (
        <OnboardingScreen 
          onGetStarted={handleGetStarted}
          onAddProvider={store.addProvider}
          onAddIntegratedProvider={store.addIntegratedProvider}
        />
      )}

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
          currentPanel={panel}
          settings={store.settings}
          onSelectConv={(convId) => {
            store.setActiveConvId(convId);
            handleExitFineTuning();
          }}
          onGoHome={() => {
            store.setActiveConvId(null);
            handleExitFineTuning();
          }}
          onDeleteConv={store.deleteConversation}
          onUpdateTitle={store.updateConversationTitle}
          onOpenSettings={() => setPanel(p => p === 'settings' ? 'chat' : 'settings')}
          onOpenProviders={openProviders}
          onOpenViewChat={() => setShowViewChatModal(true)}
          onOpenFineTuning={openFineTuning}
          onToggleTheme={toggleTheme}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          syncStatus={syncStatus}
        />

        <div className="flex-1 flex min-w-0 overflow-hidden">
          {panel === 'fine-tuning' ? (
            fineTuningView === 'list' ? (
              <FineTuningList onOpenFineTuningDetail={handleOpenFineTuningDetail} />
            ) : (
              <FineTuningDetail 
                fineTuningId={typeof fineTuningView === 'object' ? fineTuningView.id : ''} 
                onBack={() => setFineTuningView('list')} 
              />
            )
          ) : (
            <>
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
                onForkConversation={handleForkConversation}
                selectedFineTuningId={store.selectedFineTuningId}
                onFineTuningChange={store.selectFineTuning}
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
            </>
          )}
        </div>
      </div>
      
      {/* Modals */}
      {showWelcome && (
        <OnboardingScreen 
          onGetStarted={handleGetStarted}
          onAddProvider={store.addProvider}
          onAddIntegratedProvider={store.addIntegratedProvider}
        />
      )}
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
      
      <DesktopAppToast />
    </>
  );
}
