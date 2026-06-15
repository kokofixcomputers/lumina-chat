import { s3Put, s3Get, type S3Config } from './s3Sync';
import { webdavPut, webdavGet, type WebDAVConfig } from './webdavSync';
import { setFileSyncStatus } from './fileSyncStatus';

export type FileSyncProvider = 's3' | 'webdav';

class FileSyncManager {
  private provider: FileSyncProvider | null = null;
  private cfg: S3Config | WebDAVConfig | null = null;
  private _connected = false;

  get connected() { return this._connected; }

  async connect(provider: FileSyncProvider, cfg: S3Config | WebDAVConfig): Promise<object | null> {
    this.provider = provider;
    this.cfg = cfg;
    setFileSyncStatus('connecting');
    try {
      let data: object | null = null;
      try {
        data = await this._pull();
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

  async push(data: object): Promise<void> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      if (this.provider === 's3') await s3Put(this.cfg as S3Config, data);
      else await webdavPut(this.cfg as WebDAVConfig, data);
      setFileSyncStatus('connected', Date.now());
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  async pull(): Promise<object | null> {
    if (!this._connected || !this.provider || !this.cfg) throw new Error('Not connected');
    setFileSyncStatus('syncing');
    try {
      const data = await this._pull();
      setFileSyncStatus('connected', Date.now());
      return data;
    } catch (e) {
      setFileSyncStatus('error');
      throw e;
    }
  }

  private async _pull(): Promise<object> {
    if (this.provider === 's3') return s3Get(this.cfg as S3Config);
    return webdavGet(this.cfg as WebDAVConfig);
  }
}

export const fileSyncManager = new FileSyncManager();
