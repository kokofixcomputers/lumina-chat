import { Extension } from './extensionSystem';

export interface StoredExtension extends Extension {
  code: string;
  enabled: boolean;
  installedAt: number;
  lastModified: number;
}

class ExtensionStorage {
  private readonly STORAGE_KEY = 'lumina_extensions';

  saveExtension(extension: StoredExtension): void {
    try {
      const extensions = this.getAllExtensions();
      extensions[extension.id] = extension;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(extensions));
    } catch (error) {
      console.error('Failed to save extension:', error);
      throw new Error('Failed to save extension');
    }
  }

  getExtension(id: string): StoredExtension | null {
    try {
      const extensions = this.getAllExtensions();
      return extensions[id] || null;
    } catch (error) {
      console.error('Failed to get extension:', error);
      return null;
    }
  }

  getAllExtensions(): Record<string, StoredExtension> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load extensions:', error);
      return {};
    }
  }

  deleteExtension(id: string): boolean {
    try {
      const extensions = this.getAllExtensions();
      delete extensions[id];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(extensions));
      return true;
    } catch (error) {
      console.error('Failed to delete extension:', error);
      return false;
    }
  }

  updateExtension(id: string, updates: Partial<StoredExtension>): boolean {
    try {
      const extension = this.getExtension(id);
      if (!extension) return false;

      const updatedExtension = { ...extension, ...updates, lastModified: Date.now() };
      this.saveExtension(updatedExtension);
      return true;
    } catch (error) {
      console.error('Failed to update extension:', error);
      return false;
    }
  }

  exportExtensions(): string {
    try {
      const extensions = this.getAllExtensions();
      return JSON.stringify(extensions, null, 2);
    } catch (error) {
      console.error('Failed to export extensions:', error);
      throw new Error('Failed to export extensions');
    }
  }

  importExtensions(jsonData: string): { success: number; failed: number; errors: string[] } {
    try {
      const extensions = JSON.parse(jsonData);
      const result = { success: 0, failed: 0, errors: [] as string[] };

      for (const [id, extension] of Object.entries(extensions)) {
        try {
          // Validate extension structure
          if (!this.isValidStoredExtension(extension)) {
            result.failed++;
            result.errors.push(`Invalid extension format: ${id}`);
            continue;
          }

          this.saveExtension(extension as StoredExtension);
          result.success++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Failed to import ${id}: ${error}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to import extensions:', error);
      throw new Error('Invalid JSON data');
    }
  }

  private isValidStoredExtension(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      typeof obj.id === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.version === 'string' &&
      typeof obj.code === 'string' &&
      typeof obj.enabled === 'boolean' &&
      Array.isArray(obj.tools)
    );
  }
}

export const extensionStorage = new ExtensionStorage();
