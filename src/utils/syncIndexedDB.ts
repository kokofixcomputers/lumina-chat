import { indexedDBStorage } from './indexedDB';
import type { Conversation } from '../types';

export class SyncIndexedDB {
  private static lastSnapshot: string = '';
  private static suppressUntil: number = 0;

  static async getConversationsSnapshot(): Promise<string> {
    try {
      const conversations = await indexedDBStorage.getAllConversations();
      return JSON.stringify(conversations);
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to get conversations snapshot:', error);
      return '[]';
    }
  }

  static async updateSnapshot(): Promise<void> {
    try {
      this.lastSnapshot = await this.getConversationsSnapshot();
      (window as any).__syncLastConversations = this.lastSnapshot;
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to update snapshot:', error);
    }
  }

  static async checkForChanges(): Promise<{
    hasChanges: boolean;
    oldConversations: Conversation[];
    newConversations: Conversation[];
  }> {
    try {
      // Skip if we're in suppression period after receiving remote changes
      if (Date.now() < this.suppressUntil) {
        return {
          hasChanges: false,
          oldConversations: [],
          newConversations: []
        };
      }

      const currentSnapshot = await this.getConversationsSnapshot();
      const lastSnapshot = (window as any).__syncLastConversations || this.lastSnapshot;

      if (currentSnapshot === lastSnapshot) {
        return {
          hasChanges: false,
          oldConversations: [],
          newConversations: []
        };
      }

      const oldConversations = lastSnapshot ? JSON.parse(lastSnapshot) as Conversation[] : [];
      const newConversations = currentSnapshot ? JSON.parse(currentSnapshot) as Conversation[] : [];

      console.log('[Sync-IndexedDB] Change detected!');
      console.log('[Sync-IndexedDB] oldConversations length:', oldConversations.length);
      console.log('[Sync-IndexedDB] newConversations length:', newConversations.length);

      return {
        hasChanges: true,
        oldConversations,
        newConversations
      };
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to check for changes:', error);
      return {
        hasChanges: false,
        oldConversations: [],
        newConversations: []
      };
    }
  }

  static suppressChanges(duration: number = 1000): void {
    this.suppressUntil = Date.now() + duration;
  }

  static async applyRemoteChanges(conversations: Conversation[]): Promise<void> {
    try {
      // Suppress local change detection while applying remote changes
      this.suppressChanges(2000);
      
      // Save all conversations to IndexedDB
      await indexedDBStorage.saveAllConversations(conversations);
      
      // Update snapshot after a short delay to allow useEffect to complete
      setTimeout(() => {
        this.updateSnapshot();
      }, 100);
      
      console.log('[Sync-IndexedDB] Applied remote changes:', conversations.length, 'conversations');
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to apply remote changes:', error);
    }
  }

  static async importConversations(conversations: Conversation[]): Promise<void> {
    try {
      await indexedDBStorage.saveAllConversations(conversations);
      console.log('[Sync-IndexedDB] Imported conversations:', conversations.length);
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to import conversations:', error);
      throw error;
    }
  }

  static async exportConversations(): Promise<Conversation[]> {
    try {
      return await indexedDBStorage.getAllConversations();
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to export conversations:', error);
      throw error;
    }
  }

  static findConversationsDiff(oldConversations: Conversation[], newConversations: Conversation[]): Array<{
    type: 'added' | 'modified' | 'deleted';
    conversation: Conversation;
  }> {
    const changes: Array<{ type: 'added' | 'modified' | 'deleted'; conversation: Conversation }> = [];
    
    const oldMap = new Map(oldConversations.map(c => [c.id, c]));
    const newMap = new Map(newConversations.map(c => [c.id, c]));

    // Find added and modified conversations
    for (const [id, newConv] of newMap) {
      const oldConv = oldMap.get(id);
      if (!oldConv) {
        changes.push({ type: 'added', conversation: newConv });
      } else if (JSON.stringify(oldConv) !== JSON.stringify(newConv)) {
        changes.push({ type: 'modified', conversation: newConv });
      }
    }

    // Find deleted conversations
    for (const [id, oldConv] of oldMap) {
      if (!newMap.has(id)) {
        changes.push({ type: 'deleted', conversation: oldConv });
      }
    }

    return changes;
  }

  static async initializeSync(): Promise<void> {
    try {
      await this.updateSnapshot();
      console.log('[Sync-IndexedDB] Sync initialized');
    } catch (error) {
      console.error('[Sync-IndexedDB] Failed to initialize sync:', error);
    }
  }
}

// Expose sync utilities to window for debugging
if (typeof window !== 'undefined') {
  (window as any).syncIndexedDB = SyncIndexedDB;
  console.log('[Sync-IndexedDB] IndexedDB sync utilities available at window.syncIndexedDB');
}
