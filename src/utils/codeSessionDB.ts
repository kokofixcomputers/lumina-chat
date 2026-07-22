import type { Message } from '../types';

const DB_NAME = 'LuminaCodeDB';
const DB_VERSION = 1;
const STORE_NAME = 'code_sessions';

export interface PlanItem {
  text: string;
  completed: boolean;
}

export interface CodeSession {
  id: string;
  title: string;
  workspace: string;
  messages: Message[];
  modelId?: string;
  plan?: PlanItem[];
  // Absolute paths of other project folders the AI can read from/write to alongside the
  // primary `workspace` — e.g. a reference project to port code out of, or into.
  additionalWorkspaces?: string[];
  createdAt: number;
  updatedAt: number;
}

class CodeSessionDB {
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
    if (!this.db) throw new Error('Failed to initialize CodeSessionDB');
    return this.db;
  }

  async getAll(): Promise<CodeSession[]> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const sessions = req.result as CodeSession[];
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(sessions);
      };
    });
  }

  async save(session: CodeSession): Promise<void> {
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

  async putAll(sessions: CodeSession[]): Promise<void> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      const store = tx.objectStore(STORE_NAME);
      for (const s of sessions) store.put(s);
    });
  }
}

export const codeSessionDB = new CodeSessionDB();
