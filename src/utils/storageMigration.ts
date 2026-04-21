import { indexedDBStorage } from './indexedDB';
import type { Conversation } from '../types';

export class StorageMigration {
  static async checkMigrationStatus(): Promise<{
    needsMigration: boolean;
    localStorageCount: number;
    indexedDBCount: number;
    localStorageSize: string;
    indexedDBSize: string;
  }> {
    try {
      // Check localStorage
      const localStorageData = localStorage.getItem('lumina_conversations');
      const localStorageConversations = localStorageData ? JSON.parse(localStorageData) as Conversation[] : [];
      const localStorageSize = new Blob([localStorageData || '']).size;
      
      // Check IndexedDB
      await indexedDBStorage.init();
      const indexedDBConversations = await indexedDBStorage.getAllConversations();
      const indexedDBSize = await indexedDBStorage.getStorageSize();
      
      return {
        needsMigration: localStorageConversations.length > 0 && indexedDBConversations.length === 0,
        localStorageCount: localStorageConversations.length,
        indexedDBCount: indexedDBConversations.length,
        localStorageSize: this.formatBytes(localStorageSize),
        indexedDBSize: this.formatBytes(indexedDBSize),
      };
    } catch (error) {
      console.error('[Migration] Failed to check migration status:', error);
      return {
        needsMigration: false,
        localStorageCount: 0,
        indexedDBCount: 0,
        localStorageSize: '0 B',
        indexedDBSize: '0 B',
      };
    }
  }

  static async migrate(): Promise<{
    success: boolean;
    migratedCount: number;
    error?: string;
  }> {
    try {
      console.log('[Migration] Starting migration from localStorage to IndexedDB...');
      
      // Check if migration is needed
      const status = await this.checkMigrationStatus();
      if (!status.needsMigration) {
        console.log('[Migration] No migration needed');
        return { success: true, migratedCount: 0 };
      }
      
      // Perform migration
      await indexedDBStorage.migrateFromLocalStorage();
      
      // Verify migration
      const afterStatus = await this.checkMigrationStatus();
      console.log('[Migration] Migration completed:', afterStatus);
      
      return { 
        success: true, 
        migratedCount: afterStatus.indexedDBCount 
      };
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
      return { 
        success: false, 
        migratedCount: 0, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async backupLocalStorage(): Promise<string> {
    try {
      const data = localStorage.getItem('lumina_conversations');
      if (!data) {
        throw new Error('No data found in localStorage');
      }
      
      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: JSON.parse(data)
      };
      
      return JSON.stringify(backup, null, 2);
    } catch (error) {
      console.error('[Migration] Failed to backup localStorage:', error);
      throw error;
    }
  }

  static async clearLocalStorage(): Promise<void> {
    try {
      localStorage.removeItem('lumina_conversations');
      console.log('[Migration] Cleared localStorage conversations');
    } catch (error) {
      console.error('[Migration] Failed to clear localStorage:', error);
      throw error;
    }
  }

  static async clearIndexedDB(): Promise<void> {
    try {
      await indexedDBStorage.clearAllConversations();
      console.log('[Migration] Cleared IndexedDB conversations');
    } catch (error) {
      console.error('[Migration] Failed to clear IndexedDB:', error);
      throw error;
    }
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static async getStorageInfo(): Promise<{
    localStorage: { conversations: number; size: string };
    indexedDB: { conversations: number; size: string };
    quota: { used: string; available: string; total: string };
  }> {
    try {
      // Get localStorage info
      const localStorageData = localStorage.getItem('lumina_conversations');
      const localStorageConversations = localStorageData ? JSON.parse(localStorageData) as Conversation[] : [];
      const localStorageSize = new Blob([localStorageData || '']).size;
      
      // Get IndexedDB info
      await indexedDBStorage.init();
      const indexedDBConversations = await indexedDBStorage.getAllConversations();
      const indexedDBSize = await indexedDBStorage.getStorageSize();
      
      // Get quota info
      let quotaUsed = 0;
      let quotaAvailable = 0;
      let quotaTotal = 0;
      
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        quotaUsed = estimate.usage || 0;
        quotaTotal = estimate.quota || 0;
        quotaAvailable = quotaTotal - quotaUsed;
      }
      
      return {
        localStorage: {
          conversations: localStorageConversations.length,
          size: this.formatBytes(localStorageSize)
        },
        indexedDB: {
          conversations: indexedDBConversations.length,
          size: this.formatBytes(indexedDBSize)
        },
        quota: {
          used: this.formatBytes(quotaUsed),
          available: this.formatBytes(quotaAvailable),
          total: this.formatBytes(quotaTotal)
        }
      };
    } catch (error) {
      console.error('[Migration] Failed to get storage info:', error);
      throw error;
    }
  }
}

// Expose migration utilities to window for debugging
if (typeof window !== 'undefined') {
  (window as any).storageMigration = StorageMigration;
  console.log('[Migration] Storage migration utilities available at window.storageMigration');
}
