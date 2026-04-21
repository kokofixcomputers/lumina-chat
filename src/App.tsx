import { useState, useEffect } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsPanel from './components/SettingsPanel';
import OnboardingScreen from './components/OnboardingScreen';
import SharePanel from './components/SharePanel';
import ViewChatModal from './components/ViewChatModal';
import DesktopAppToast from './components/DesktopAppToast';
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
          // Suppress storage monitor during initial sync for much longer period
          (window as any).__syncSuppressUntil = Date.now() + 5000;
          
          // Import initial data from server
          if (data.conversations) {
            const syncUtils = await import('./utils/syncUtils');
            const mergedConversations = syncUtils.mergeConversationsSafely(store.conversations, data.conversations);
            store.setConversations(mergedConversations);
          }
          if (data.settings) {
            store.updateSettings(data.settings);
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
              const { cloudSync: remoteCloudSync, ...remoteSettings } = action.data.settings;
              store.updateSettings(remoteSettings);
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
      
      // Track recently sent actions to prevent duplicates
      const recentlySentActions = new Map<string, number>();
      const ACTION_DEDUP_WINDOW = 5000; // 5 seconds
      
      const isRecentlySent = (actionType: string, data: any): boolean => {
        const key = `${actionType}:${JSON.stringify(data)}`;
        
        // Check if we recently sent this action
        const timestamp = recentlySentActions.get(key);
        if (timestamp && Date.now() - timestamp < ACTION_DEDUP_WINDOW) {
          console.log('[SYNC] Ignoring duplicate action:', actionType, key);
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
        if (currentSettings !== localLastSettings) {
          try {
            // Parse and send settings sync action
            const newSettings = currentSettings ? JSON.parse(currentSettings) : {};
            // Exclude cloudSync credentials from sync
            const { cloudSync, ...syncSettings } = newSettings;
            if (!isRecentlySent('update_settings', syncSettings)) {
              console.log('[SYNC] Sending settings update');
              syncManager.sendUpdateSettings(syncSettings);
            }
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
