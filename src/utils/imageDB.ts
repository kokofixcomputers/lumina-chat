const DB_NAME = 'LuminaImageDB';
const DB_VERSION = 1;
const STORE = 'images';

export interface GeneratedImage {
  id: string;
  prompt: string;        // prompt sent to the API (may be optimized)
  userPrompt?: string;   // original text the user typed before optimization
  revisedPrompt?: string;
  b64: string; // data:image/png;base64,...
  createdAt: number;
  model: string;
  rootId?: string; // id of the original image in this edit chain
}

class ImageDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onupgradeneeded = e => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
    return this.initPromise;
  }

  private async db_() {
    if (!this.db) await this.init();
    return this.db!;
  }

  async getAll(): Promise<GeneratedImage[]> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const req = db.transaction([STORE], 'readonly').objectStore(STORE).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve((req.result as GeneratedImage[]).sort((a, b) => b.createdAt - a.createdAt));
    });
  }

  async save(img: GeneratedImage) {
    const db = await this.db_();
    return new Promise<void>((resolve, reject) => {
      const req = db.transaction([STORE], 'readwrite').objectStore(STORE).put(img);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async delete(id: string) {
    const db = await this.db_();
    return new Promise<void>((resolve, reject) => {
      const req = db.transaction([STORE], 'readwrite').objectStore(STORE).delete(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async putAll(images: GeneratedImage[]): Promise<void> {
    const db = await this.db_();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readwrite');
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      const store = tx.objectStore(STORE);
      for (const img of images) store.put(img);
    });
  }
}

export const imageDB = new ImageDB();
