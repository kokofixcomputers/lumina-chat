export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: number;
}

const MAX_PER_EXT = 200;

class ExtensionLogRegistry {
  private logs = new Map<string, LogEntry[]>();
  private counter = 0;

  append(extensionId: string, level: LogLevel, ...args: unknown[]) {
    const message = args
      .map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? '\n' + a.stack : ''}`;
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      })
      .join(' ');

    const entry: LogEntry = { id: ++this.counter, level, message, timestamp: Date.now() };
    const bucket = this.logs.get(extensionId) ?? [];
    bucket.push(entry);
    if (bucket.length > MAX_PER_EXT) bucket.splice(0, bucket.length - MAX_PER_EXT);
    this.logs.set(extensionId, bucket);
    window.dispatchEvent(new CustomEvent('ext-log-update', { detail: { extensionId } }));
  }

  getLogs(extensionId: string): LogEntry[] {
    return this.logs.get(extensionId) ?? [];
  }

  clear(extensionId: string) {
    this.logs.set(extensionId, []);
    window.dispatchEvent(new CustomEvent('ext-log-update', { detail: { extensionId } }));
  }

  clearAll() {
    this.logs.clear();
    window.dispatchEvent(new CustomEvent('ext-log-update', { detail: { extensionId: null } }));
  }
}

export const extensionLogRegistry = new ExtensionLogRegistry();
