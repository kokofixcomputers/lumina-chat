import type { Conversation } from '../types';

const DB_NAME = 'LuminaChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          console.log('[IndexedDB] Creating conversations store');
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          
          // Create indexes for efficient querying
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('modelId', 'modelId', { unique: false });
          store.createIndex('mode', 'mode', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  async getAllConversations(): Promise<Conversation[]> {
    try {
      const db = await this.ensureInitialized();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = () => {
          console.error('[IndexedDB] Failed to get all conversations:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          const conversations = request.result as Conversation[];
          // Sort by updatedAt descending (newest first)
          conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          console.log(`[IndexedDB] Loaded ${conversations.length} conversations`);
          resolve(conversations);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Error getting all conversations:', error);
      return [];
    }
  }

  async getConversation(id: string): Promise<Conversation | null> {
    try {
      const db = await this.ensureInitialized();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to get conversation ${id}:`, request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          resolve(request.result as Conversation || null);
        };
      });
    } catch (error) {
      console.error(`[IndexedDB] Error getting conversation ${id}:`, error);
      return null;
    }
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(conversation);

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to save conversation ${conversation.id}:`, request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(`[IndexedDB] Saved conversation ${conversation.id}`);
          resolve();
        };
      });
    } catch (error) {
      console.error(`[IndexedDB] Error saving conversation ${conversation.id}:`, error);
      throw error;
    }
  }

  async saveAllConversations(conversations: Conversation[]): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Clear existing conversations
        const clearRequest = store.clear();
        
        clearRequest.onerror = () => {
          console.error('[IndexedDB] Failed to clear conversations:', clearRequest.error);
          reject(clearRequest.error);
        };

        clearRequest.onsuccess = () => {
          // Add all conversations
          let completed = 0;
          let hasError = false;

          if (conversations.length === 0) {
            console.log('[IndexedDB] Saved 0 conversations');
            resolve();
            return;
          }

          conversations.forEach((conversation) => {
            const request = store.add(conversation);
            
            request.onerror = () => {
              if (!hasError) {
                hasError = true;
                console.error(`[IndexedDB] Failed to add conversation ${conversation.id}:`, request.error);
                reject(request.error);
              }
            };

            request.onsuccess = () => {
              completed++;
              if (completed === conversations.length && !hasError) {
                console.log(`[IndexedDB] Saved ${conversations.length} conversations`);
                resolve();
              }
            };
          });
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Error saving all conversations:', error);
      throw error;
    }
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to delete conversation ${id}:`, request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(`[IndexedDB] Deleted conversation ${id}`);
          resolve();
        };
      });
    } catch (error) {
      console.error(`[IndexedDB] Error deleting conversation ${id}:`, error);
      throw error;
    }
  }

  async getStorageSize(): Promise<number> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return estimate.usage || 0;
      }
      return 0;
    } catch (error) {
      console.error('[IndexedDB] Error getting storage size:', error);
      return 0;
    }
  }

  async clearAllConversations(): Promise<void> {
    try {
      const db = await this.ensureInitialized();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => {
          console.error('[IndexedDB] Failed to clear all conversations:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log('[IndexedDB] Cleared all conversations');
          resolve();
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Error clearing all conversations:', error);
      throw error;
    }
  }

  // Migration helper: check if there's data in localStorage that needs to be migrated
  async needsMigration(): Promise<boolean> {
    const localStorageData = localStorage.getItem('lumina_conversations');
    if (!localStorageData) return false;

    try {
      const db = await this.ensureInitialized();
      const count = await new Promise<number>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      return count === 0; // Need migration if IndexedDB is empty but localStorage has data
    } catch (error) {
      console.error('[IndexedDB] Error checking migration need:', error);
      return false;
    }
  }

  // Migrate data from localStorage to IndexedDB
  async migrateFromLocalStorage(): Promise<void> {
    try {
      const localStorageData = localStorage.getItem('lumina_conversations');
      if (!localStorageData) {
        console.log('[IndexedDB] No localStorage data to migrate');
        return;
      }

      const conversations = JSON.parse(localStorageData) as Conversation[];
      console.log(`[IndexedDB] Migrating ${conversations.length} conversations from localStorage`);

      await this.saveAllConversations(conversations);
      
      // Optionally clear localStorage after successful migration
      // localStorage.removeItem('lumina_conversations');
      console.log('[IndexedDB] Migration completed successfully');
    } catch (error) {
      console.error('[IndexedDB] Migration failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const indexedDBStorage = new IndexedDBStorage();

// Helper functions for backward compatibility
export async function loadConversationsFromIndexedDB(): Promise<Conversation[]> {
  return indexedDBStorage.getAllConversations();
}

export async function saveConversationsToIndexedDB(conversations: Conversation[]): Promise<void> {
  return indexedDBStorage.saveAllConversations(conversations);
}

export async function addConversationToIndexedDB(conversation: Conversation): Promise<void> {
  return indexedDBStorage.saveConversation(conversation);
}

export async function removeConversationFromIndexedDB(id: string): Promise<void> {
  return indexedDBStorage.deleteConversation(id);
}
