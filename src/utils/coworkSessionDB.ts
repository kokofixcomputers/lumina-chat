import type { Message } from '../types';

const DB_NAME = 'LuminaCoworkDB';
const DB_VERSION = 1;
const STORE_NAME = 'cowork_sessions';

export interface CoworkSession {
  id: string;
  title: string;
  messages: Message[];
  modelId?: string;
  createdAt: number;
  updatedAt: number;
}

class CoworkSessionDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.db = request.result; resolve(); };
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
    return this.initPromise;
  }

  private async db_(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Failed to initialize CoworkSessionDB');
    return this.db;
  }

  async getAll(): Promise<CoworkSession[]> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const sessions = req.result as CoworkSession[];
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(sessions);
      };
    });
  }

  async save(session: CoworkSession): Promise<void> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(session);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }
}

export const coworkSessionDB = new CoworkSessionDB();
