import { createChatExtensionAPI, createSandboxedExtensionAPI, Extension } from './extensionSystem';
import { extensionStorage, StoredExtension } from './extensionStorage';
import { extensionToolRegistry } from './extensionToolRegistry';
import { extensionUIRegistry } from './extensionUIRegistry';
import { extensionPatchRegistry } from './extensionPatchRegistry';
import { extensionLogRegistry } from './extensionLogRegistry';

class ExtensionLoader {
  private loadedExtensions: Map<string, any> = new Map();

  async loadExtension(storedExtension: StoredExtension): Promise<boolean> {
    try {
      // Prevent double-execution if already running
      if (this.loadedExtensions.has(storedExtension.id)) {
        await this.unloadExtension(storedExtension.id);
      }
      const safeConsole = this.createSafeConsole(storedExtension.id);
      const isSandboxed = (storedExtension.type ?? 'sandboxed') === 'sandboxed';

      if (isSandboxed) {
        // Block dangerous globals by shadowing them as function parameters
        const blockedGlobals = [
          'document','window','fetch','XMLHttpRequest','WebSocket',
          'localStorage','sessionStorage','indexedDB','crypto',
          'navigator','location','history','eval','Function',
          'Worker','Blob','URL','URLSearchParams','setTimeout','setInterval',
          'clearTimeout','clearInterval','open','alert','confirm','prompt',
        ];
        const blockedArgs = blockedGlobals.map(() => 'undefined').join(',');
        const wrappedCode = `(function(${blockedGlobals.join(',')}) {\n${storedExtension.code}\n})(${blockedArgs});`;
        const extensionFunction = new Function('api', 'console', wrappedCode);
        extensionFunction(createSandboxedExtensionAPI(storedExtension.id), safeConsole);
      } else {
        // Unsandboxed: full API + raw DOM access
        const extensionFunction = new Function('api', 'console', storedExtension.code);
        extensionFunction(createChatExtensionAPI(storedExtension.id), safeConsole);
      }
      
      // Get the registered extension
      const api = createChatExtensionAPI();
      const extension = api.getExtension(storedExtension.id);
      
      if (!extension) {
        throw new Error('Extension did not register itself');
      }

      // Get current stored extension to preserve latest enabled state
      const currentStored = extensionStorage.getExtension(storedExtension.id);
      
      // Update the stored extension with the actual tools and metadata
      const updatedExtension: StoredExtension = {
        ...storedExtension,
        id: extension.id,
        name: extension.name,
        version: extension.version,
        description: extension.description || storedExtension.description,
        author: extension.author || storedExtension.author,
        tools: extension.tools,
        enabled: currentStored?.enabled ?? storedExtension.enabled // Use current enabled state
      };

      // Save the updated extension with proper tools
      extensionStorage.saveExtension(updatedExtension);

      // Only register tools if the extension is enabled
      if (currentStored?.enabled) {
        extensionToolRegistry.registerExtensionTools(extension.id, extension.tools);
      }

      this.loadedExtensions.set(storedExtension.id, extension);
      return true;
    } catch (error) {
      console.error(`Failed to load extension '${storedExtension.id}':`, error);
      extensionLogRegistry.append(storedExtension.id, 'error', error instanceof Error ? error : String(error));
      return false;
    }
  }

  async unloadExtension(id: string): Promise<boolean> {
    try {
      extensionToolRegistry.unregisterExtensionTools(id);
      extensionUIRegistry.removeAllByExtension(id);
      extensionPatchRegistry.cleanup(id);
      this.loadedExtensions.delete(id);
      return true;
    } catch (error) {
      console.error(`Failed to unload extension '${id}':`, error);
      return false;
    }
  }

  async reloadExtension(storedExtension: StoredExtension): Promise<boolean> {
    await this.unloadExtension(storedExtension.id);
    return await this.loadExtension(storedExtension);
  }

  isExtensionLoaded(id: string): boolean {
    return this.loadedExtensions.has(id);
  }

  getLoadedExtension(id: string): any {
    return this.loadedExtensions.get(id);
  }

  private createSandbox(): any {
    // Create a sandboxed environment with limited global access
    const sandbox = {
      // Safe built-ins
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Date: Date,
      Math: Math,
      JSON: JSON,
      Promise: Promise,
      
      // Safe utilities
      setTimeout: (fn: Function, delay: number) => setTimeout(fn, Math.min(delay, 30000)),
      clearTimeout: clearTimeout,
      setInterval: (fn: Function, delay: number) => setInterval(fn, Math.min(delay, 30000)),
      clearInterval: clearInterval,
      
      // Block dangerous globals
      eval: undefined,
      Function: undefined,
      document: undefined,
      window: undefined,
      global: undefined,
      process: undefined,
      require: undefined,
      import: undefined,
      fetch: undefined,
      XMLHttpRequest: undefined,
      WebSocket: undefined,
      Worker: undefined,
      Blob: undefined,
      URL: undefined,
      URLSearchParams: undefined,
      localStorage: undefined,
      sessionStorage: undefined,
      indexedDB: undefined,
      crypto: undefined,
      navigator: undefined,
      location: undefined,
      history: undefined,
    };

    return sandbox;
  }

  private createSafeConsole(extensionId: string): any {
    const reg = extensionLogRegistry;
    return {
      log:   (...args: any[]) => { console.log(`[Extension:${extensionId}]`, ...args);   reg.append(extensionId, 'log',  ...args); },
      info:  (...args: any[]) => { console.info(`[Extension:${extensionId}]`, ...args);  reg.append(extensionId, 'info', ...args); },
      warn:  (...args: any[]) => { console.warn(`[Extension:${extensionId}]`, ...args);  reg.append(extensionId, 'warn', ...args); },
      error: (...args: any[]) => { console.error(`[Extension:${extensionId}]`, ...args); reg.append(extensionId, 'error', ...args); },
      debug: (...args: any[]) => { console.debug(`[Extension:${extensionId}]`, ...args); reg.append(extensionId, 'log',  ...args); },
    };
  }

  async loadAllExtensions(): Promise<{ loaded: number; failed: number; errors: string[] }> {
    const result = { loaded: 0, failed: 0, errors: [] as string[] };
    const extensions = extensionStorage.getAllExtensions();

    for (const [id, storedExtension] of Object.entries(extensions)) {
      if (!storedExtension.enabled) {
        continue; // Skip disabled extensions
      }

      try {
        const success = await this.loadExtension(storedExtension);
        if (success) {
          result.loaded++;
        } else {
          result.failed++;
          result.errors.push(`Failed to load extension: ${id}`);
        }
      } catch (error) {
        result.failed++;
        result.errors.push(`Error loading extension ${id}: ${error}`);
      }
    }

    return result;
  }

  // Initialize extension system respecting user preferences
  async initializeExtensions(): Promise<void> {
    // Unload everything first so re-initialization doesn't double-execute extension code
    await this.unloadAllExtensions();
    extensionToolRegistry.clear();
    await this.loadAllExtensions();
  }

  async unloadAllExtensions(): Promise<void> {
    const extensionIds = Array.from(this.loadedExtensions.keys());
    for (const id of extensionIds) {
      await this.unloadExtension(id);
    }
  }
}

export const extensionLoader = new ExtensionLoader();
