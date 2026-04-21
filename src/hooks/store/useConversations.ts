import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message } from '../../types';
import { loadFromStorage } from './storage';
import type { StorageAction } from './types';

export function useConversations(defaultProviderModelId: string) {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadFromStorage('lumina_conversations', [])
  );
  const conversationsRef = useRef<Conversation[]>(conversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [storageQuotaExceeded, setStorageQuotaExceeded] = useState(false);
  const storageQuotaResolverRef = useRef<((action: StorageAction) => void) | null>(null);

  const promptStorageQuota = useCallback((): Promise<StorageAction> => {
    return new Promise(resolve => {
      storageQuotaResolverRef.current = resolve;
      setStorageQuotaExceeded(true);
    });
  }, []);

  const resolveStorageQuota = useCallback((action: StorageAction) => {
    setStorageQuotaExceeded(false);
    storageQuotaResolverRef.current?.(action);
    storageQuotaResolverRef.current = null;
  }, []);

  // Sync activeConvId to sessionStorage for tools
  useEffect(() => {
    if (activeConvId) sessionStorage.setItem('activeConvId', activeConvId);
    else sessionStorage.removeItem('activeConvId');
  }, [activeConvId]);

  // Persist conversations with quota handling
  useEffect(() => {
    conversationsRef.current = conversations;
    (async () => {
      const serialized = JSON.stringify(conversations);
      console.log('[STORAGE] Saving to localStorage:', conversations.length, 'conversations');
      while (true) {
        try {
          localStorage.setItem('lumina_conversations', serialized);
          console.log('[STORAGE] Saved successfully');
          return;
        } catch (err) {
          if (err instanceof Error && err.name === 'QuotaExceededError') {
            const action = await promptStorageQuota();
            if (action === 'evict') {
              try {
                const convs: any[] = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
                convs.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
                convs.splice(0, 3);
                localStorage.setItem('lumina_conversations', JSON.stringify(convs));
              } catch { return; }
            } else if (action === 'retry') {
              // loop
            } else {
              return;
            }
          } else {
            console.error('Failed to save to localStorage:', err);
            return;
          }
        }
      }
    })();
  }, [conversations, promptStorageQuota]);

  const activeConversation = conversations.find(c => c.id === activeConvId) ?? null;

  const newConversation = useCallback((mode: 'chat' | 'image' = 'chat', attachments: string[] = []) => {
    const id = uuidv4();
    const conv: Conversation = {
      id,
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelId: defaultProviderModelId,
      mode,
      attachments,
    };
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(id);
    return id;
  }, [defaultProviderModelId]);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeConvId === id) setActiveConvId(next[0]?.id ?? null);
      return next;
    });
  }, [activeConvId]);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  }, []);

  const addMessage = useCallback((convId: string, msg: Message) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      
      let updatedMsg = msg;
      
      // Check if this is an assistant message and there's pending retry version info
      if (msg.role === 'assistant' && (window as any).pendingRetryVersionInfo) {
        const pendingInfo = (window as any).pendingRetryVersionInfo;
        if (pendingInfo.convId === convId) {
          // Apply the version info to this new assistant message
          updatedMsg = {
            ...msg,
            versions: pendingInfo.versions,
            currentVersionIndex: pendingInfo.currentVersionIndex
          };
          
          // Clear the pending info after applying
          delete (window as any).pendingRetryVersionInfo;
          
          console.log('Applied retry version info to new assistant message:', updatedMsg);
          console.log('Updated message versions:', updatedMsg.versions);
          console.log('Updated message currentVersionIndex:', updatedMsg.currentVersionIndex);
        }
      }
      
      const messages = [...c.messages, updatedMsg];
      const title = c.messages.length === 0 && msg.role === 'user'
        ? msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '')
        : c.title;
      return { ...c, messages, title, updatedAt: Date.now() };
    }));
  }, []);

  const setConversationModel = useCallback((convId: string, modelId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, modelId } : c));
  }, []);

  const deleteLastMessage = useCallback((convId: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      return { ...c, messages: c.messages.slice(0, -1), updatedAt: Date.now() };
    }));
  }, []);

  const editMessage = useCallback((convId: string, msgId: string, newContent: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      return { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, content: newContent } : m), updatedAt: Date.now() };
    }));
  }, []);

  const deleteMessagesFrom = useCallback((convId: string, msgId: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const idx = c.messages.findIndex(m => m.id === msgId);
      if (idx === -1) return c;
      return { ...c, messages: c.messages.slice(0, idx), updatedAt: Date.now() };
    }));
  }, []);

  const updateMessageVersions = useCallback((convId: string, msgId: string, versions: Message[], currentVersionIndex: number) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const messages = c.messages.map(m => {
        if (m.id !== msgId) return m;
        return versions.length > 0 ? { ...m, versions, currentVersionIndex } : { ...m, currentVersionIndex };
      });
      return { ...c, messages, updatedAt: Date.now() };
    }));
  }, []);

  const setConversationMode = useCallback((convId: string, mode: 'chat' | 'image') => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, mode } : c));
  }, []);

  const setConversationAttachments = useCallback((convId: string, attachments: string[]) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, attachments } : c));
  }, []);

  const setBuildMode = useCallback((convId: string, buildMode: boolean) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, buildMode } : c));
  }, []);

  const setConversationDevEnvSession = useCallback((convId: string, sessionId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, devEnvSession: sessionId } : c));
  }, []);

  return {
    conversations,
    setConversations,
    conversationsRef,
    activeConvId,
    setActiveConvId,
    activeConversation,
    storageQuotaExceeded,
    resolveStorageQuota,
    newConversation,
    deleteConversation,
    updateConversationTitle,
    addMessage,
    setConversationModel,
    deleteLastMessage,
    editMessage,
    deleteMessagesFrom,
    updateMessageVersions,
    setConversationMode,
    setConversationAttachments,
    setBuildMode,
    setConversationDevEnvSession,
  };
}
