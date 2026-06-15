import {
  s3PutMain, s3GetMain, s3PutImage, s3GetImage, s3ListImageIds,
  type S3Config,
} from './s3Sync';
import {
  webdavPut, webdavGet, webdavPutImage, webdavGetImage, webdavListImageIds,
  type WebDAVConfig,
} from './webdavSync';
import {
  onedrivePutMain, onedriveGetMain,
  onedrivePutImage, onedriveGetImage, onedriveListImageIds,
} from './onedriveSync';

import { setFileSyncStatus } from './fileSyncStatus';

export type FileSyncProvider = 's3' | 'webdav' | 'onedrive';

export interface MainSnapshot {
  version: number;
  pushedAt: number;
  conversations: unknown[];
  codeSessions: unknown[];
  coworkSessions: unknown[];
  settings?: unknown;
  [key: string]: unknown;
}

type Cfg = S3Config | WebDAVConfig | Record<string, never>;

class FileSyncManager {
  private provider: FileSyncProvider | null = null;
  private cfg: Cfg | null = null;
  private _connected = false;

  get connected() { return this._connected; }

  async connect(provider: FileSyncProvider, cfg: Cfg): Promise<MainSnapshot | null> {
    this.provider = provider;
    this.cfg = cfg;
    setFileSyncStatus('connecting');
    try {
      let data: MainSnapshot | null = null;
      try {
        data = await this._pullMain() as MainSnapshot;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('404') && !msg.includes('NoSuchKey') && !msg.includes('Not Found') && !msg.includes('itemNotFound')) {
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
    if (this.provider === 's3')          await s3PutMain(this.cfg as S3Config, data);
    else if (this.provider === 'webdav') await webdavPut(this.cfg as WebDAVConfig, data);
    else                                 await onedrivePutMain(data);
  }

  private async _pullMain(): Promise<object> {
    if (this.provider === 's3')       return s3GetMain(this.cfg as S3Config);
    if (this.provider === 'webdav')   return webdavGet(this.cfg as WebDAVConfig);
    return onedriveGetMain();
  }

  // ── Image push/pull ───────────────────────────────────────────────────────

  async pushImages(images: { id: string; [key: string]: unknown }[]): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) return;
    if (images.length === 0) return;
    setFileSyncStatus('syncing');
    try {
      const existingIds = new Set(await this._listImageIds());
      const toUpload = images.filter(img => !existingIds.has(img.id));
      for (const img of toUpload) await this._putImage(img.id, img);
      setFileSyncStatus('connected', Date.now());
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  async pullImages(): Promise<unknown[]> {
    if (!this._connected || !this.provider || !this.cfg) return [];
    const ids = await this._listImageIds();
    const results: unknown[] = [];
    for (const id of ids) {
      try { results.push(await this._getImage(id)); } catch { /* skip */ }
    }
    return results;
  }

  async pushImage(id: string, data: object): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) return;
    await this._putImage(id, data);
  }

  private async _listImageIds(): Promise<string[]> {
    if (this.provider === 's3')       return s3ListImageIds(this.cfg as S3Config);
    if (this.provider === 'webdav')   return webdavListImageIds(this.cfg as WebDAVConfig);
    return onedriveListImageIds();
  }

  private async _putImage(id: string, data: object): Promise<void> {
    if (this.provider === 's3')          await s3PutImage(this.cfg as S3Config, id, data);
    else if (this.provider === 'webdav') await webdavPutImage(this.cfg as WebDAVConfig, id, data);
    else                                 await onedrivePutImage(id, data);
  }

  private async _getImage(id: string): Promise<object> {
    if (this.provider === 's3')       return s3GetImage(this.cfg as S3Config, id);
    if (this.provider === 'webdav')   return webdavGetImage(this.cfg as WebDAVConfig, id);
    return onedriveGetImage(id);
  }

  // ── Force sync ────────────────────────────────────────────────────────────

  async forcePush(mainData: object, localImages: { id: string; [key: string]: unknown }[]): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      await this._pushMain(mainData);
      for (const img of localImages) await this._putImage(img.id, img);
      setFileSyncStatus('connected', Date.now());
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  async forcePull(): Promise<{ main: MainSnapshot | null; images: unknown[] }> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      let main: MainSnapshot | null = null;
      try {
        main = await this._pullMain() as MainSnapshot;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('404') && !msg.includes('NoSuchKey') && !msg.includes('Not Found') && !msg.includes('itemNotFound')) throw e;
      }
      const images = await this.pullImages();
      setFileSyncStatus('connected', Date.now());
      return { main, images };
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  async forceSync(
    mainData: object,
    localImages: { id: string; [key: string]: unknown }[],
  ): Promise<{ main: MainSnapshot | null; images: unknown[] }> {
    await this.forcePush(mainData, localImages);
    return this.forcePull();
  }
}

export const fileSyncManager = new FileSyncManager();
