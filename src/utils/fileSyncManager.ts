import {
  s3PutMain, s3GetMain, s3PutImage, s3GetImage, s3ListImageIds,
  type S3Config,
} from './s3Sync';
import {
  webdavPut, webdavGet, webdavPutImage, webdavGetImage, webdavListImageIds,
  type WebDAVConfig,
} from './webdavSync';
import { setFileSyncStatus } from './fileSyncStatus';

export type FileSyncProvider = 's3' | 'webdav';

export interface MainSnapshot {
  version: number;
  pushedAt: number;
  conversations: unknown[];
  codeSessions: unknown[];
  coworkSessions: unknown[];
  settings?: unknown;
  [key: string]: unknown;
}

class FileSyncManager {
  private provider: FileSyncProvider | null = null;
  private cfg: S3Config | WebDAVConfig | null = null;
  private _connected = false;

  get connected() { return this._connected; }

  async connect(provider: FileSyncProvider, cfg: S3Config | WebDAVConfig): Promise<MainSnapshot | null> {
    this.provider = provider;
    this.cfg = cfg;
    setFileSyncStatus('connecting');
    try {
      let data: MainSnapshot | null = null;
      try {
        data = await this._pullMain() as MainSnapshot;
      } catch (e) {
        // 404 / NoSuchKey = no remote file yet, treat as empty
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('404') && !msg.includes('NoSuchKey') && !msg.includes('Not Found')) {
          setFileSyncStatus('error');
          throw e;
        }
      }
      this._connected = true;
      setFileSyncStatus('connected', Date.now());
      return data;
    } catch (e) {
      this._connected = false;
      setFileSyncStatus('error');
      throw e;
    }
  }

  disconnect() {
    this._connected = false;
    this.provider = null;
    this.cfg = null;
    setFileSyncStatus('idle');
  }

  // ── Main data push/pull ───────────────────────────────────────────────────

  async push(data: object): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      await this._pushMain(data);
      setFileSyncStatus('connected', Date.now());
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  async pull(): Promise<MainSnapshot | null> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      const data = await this._pullMain() as MainSnapshot;
      setFileSyncStatus('connected', Date.now());
      return data;
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  private async _pushMain(data: object): Promise<void> {
    if (this.provider === 's3') await s3PutMain(this.cfg as S3Config, data);
    else await webdavPut(this.cfg as WebDAVConfig, data);
  }

  private async _pullMain(): Promise<object> {
    if (this.provider === 's3') return s3GetMain(this.cfg as S3Config);
    return webdavGet(this.cfg as WebDAVConfig);
  }

  // ── Image push/pull ───────────────────────────────────────────────────────

  /** Upload only images not already on remote (dedup by id). */
  async pushImages(images: { id: string; [key: string]: unknown }[]): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) return;
    if (images.length === 0) return;
    setFileSyncStatus('syncing');
    try {
      const existingIds = new Set(await this._listImageIds());
      const toUpload = images.filter(img => !existingIds.has(img.id));
      for (const img of toUpload) {
        await this._putImage(img.id, img);
      }
      setFileSyncStatus('connected', Date.now());
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  /** Pull all remote images and return them. */
  async pullImages(): Promise<unknown[]> {
    if (!this._connected || !this.provider || !this.cfg) return [];
    const ids = await this._listImageIds();
    const results: unknown[] = [];
    for (const id of ids) {
      try {
        results.push(await this._getImage(id));
      } catch {
        // skip missing or corrupt entries
      }
    }
    return results;
  }

  /** Push a single image (used during real-time sync). */
  async pushImage(id: string, data: object): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) return;
    await this._putImage(id, data);
  }

  private async _listImageIds(): Promise<string[]> {
    if (this.provider === 's3') return s3ListImageIds(this.cfg as S3Config);
    return webdavListImageIds(this.cfg as WebDAVConfig);
  }

  private async _putImage(id: string, data: object): Promise<void> {
    if (this.provider === 's3') await s3PutImage(this.cfg as S3Config, id, data);
    else await webdavPutImage(this.cfg as WebDAVConfig, id, data);
  }

  private async _getImage(id: string): Promise<object> {
    if (this.provider === 's3') return s3GetImage(this.cfg as S3Config, id);
    return webdavGetImage(this.cfg as WebDAVConfig, id);
  }

  // ── Force sync ────────────────────────────────────────────────────────────

  /**
   * Force-push main data + all local images to remote.
   * `buildSnapshot` should return the main data (without images array).
   * `localImages` is the full local image list.
   */
  async forcePush(
    mainData: object,
    localImages: { id: string; [key: string]: unknown }[],
  ): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      await this._pushMain(mainData);
      // Upload all images (force = don't dedup, just overwrite)
      for (const img of localImages) {
        await this._putImage(img.id, img);
      }
      setFileSyncStatus('connected', Date.now());
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  /**
   * Force-pull main data + all remote images.
   * Returns { main, images }.
   */
  async forcePull(): Promise<{ main: MainSnapshot | null; images: unknown[] }> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      let main: MainSnapshot | null = null;
      try {
        main = await this._pullMain() as MainSnapshot;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('404') && !msg.includes('NoSuchKey') && !msg.includes('Not Found')) throw e;
      }
      const images = await this.pullImages();
      setFileSyncStatus('connected', Date.now());
      return { main, images };
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  /**
   * Force push then pull (ensures remote is current, then refreshes local).
   */
  async forceSync(
    mainData: object,
    localImages: { id: string; [key: string]: unknown }[],
  ): Promise<{ main: MainSnapshot | null; images: unknown[] }> {
    await this.forcePush(mainData, localImages);
    return this.forcePull();
  }
}

export const fileSyncManager = new FileSyncManager();
