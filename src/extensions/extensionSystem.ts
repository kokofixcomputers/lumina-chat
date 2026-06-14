import type { AppSettings } from '../types';
import { extensionUIRegistry } from './extensionUIRegistry';
import type { ToastType, AlertType, ButtonLocation } from './extensionUIRegistry';
import { extensionPatchRegistry } from './extensionPatchRegistry';

export interface ExtensionTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required: string[];
  };
  call: (args: any, ctx: ExtensionContext) => Promise<any>;
}

export interface Extension {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  tools: ExtensionTool[];
  permissions?: string[];
}

export interface ExtensionContext {
  settings: AppSettings;
  log: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
}

export interface ExtensionUIAPI {
  /** Show a themed alert dialog. Returns a promise that resolves when dismissed. */
  alert: (message: string, opts?: { title?: string; type?: AlertType; confirmLabel?: string }) => Promise<void>;
  /** Show a themed confirm dialog. Resolves true/false. */
  confirm: (message: string, opts?: { title?: string; type?: AlertType; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  /** Show a themed prompt dialog. Resolves the entered string or null on cancel. */
  prompt: (message: string, opts?: { title?: string; placeholder?: string; defaultValue?: string }) => Promise<string | null>;
  /** Show a toast notification. */
  toast: (message: string, opts?: { type?: ToastType; duration?: number }) => void;
  /** Open a rich modal with HTML body content and custom buttons. Returns a close() function. */
  openModal: (opts: {
    title: string;
    body: string;
    width?: 'sm' | 'md' | 'lg';
    buttons?: Array<{ label: string; primary?: boolean; danger?: boolean; onClick: () => void }>;
    onClose?: () => void;
  }) => () => void;
  /** Add a button to the UI. Returns a remove() function. */
  addButton: (opts: {
    id?: string;
    label: string;
    icon?: string;
    tooltip?: string;
    location?: ButtonLocation;
    onClick: () => void;
  }) => () => void;
  /** Add a section of items to the sidebar. Returns a remove() function. */
  addSidebarSection: (opts: {
    id?: string;
    title?: string;
    items: Array<{ id: string; label: string; icon?: string; onClick: () => void }>;
  }) => () => void;
}

export interface ExtensionDOMAPI {
  /** Add an event listener to any DOM element. Returns a remove() function and is cleaned up automatically when the extension unloads. */
  on(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): () => void;
  /** Shorthand: listen on `document`. */
  onDocument(type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): () => void;
  /** Shorthand: listen on `window`. */
  onWindow(type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): () => void;
  /** Inject a CSS string into the page as a <style> tag. Returns a remove() function. */
  addStyle(css: string): () => void;
  /** querySelector scoped to the live document. */
  query(selector: string): Element | null;
  /** querySelectorAll scoped to the live document. Returns a real array. */
  queryAll(selector: string): Element[];
  /** Watch for DOM mutations. Returns a disconnect() function. */
  observe(target: Node, callback: MutationCallback, options: MutationObserverInit): () => void;
  /** setInterval with automatic cleanup on extension unload. */
  setInterval(fn: () => void, ms: number): () => void;
  /** setTimeout with automatic cleanup on extension unload. */
  setTimeout(fn: () => void, ms: number): () => void;
  /** Register an arbitrary cleanup function to run when this extension is disabled/unloaded. */
  onCleanup(fn: () => void): void;
}

export interface ExtensionAppAPI {
  sidebar: {
    /** Collapse the sidebar. */
    collapse(): void;
    /** Expand the sidebar. */
    expand(): void;
    /** Toggle the sidebar collapsed state. */
    toggle(): void;
    /** Returns true if the sidebar is currently collapsed. */
    isCollapsed(): boolean;
    /** Listen for sidebar collapse/expand. Returns an unlisten function. */
    onChange(fn: (collapsed: boolean) => void): () => void;
  };
  /** Dispatch a custom Lumina app event. */
  emit(event: string, detail?: unknown): void;
  /** Listen to a custom Lumina app event. Returns an unlisten function. */
  on(event: string, handler: (detail: unknown) => void): () => void;
}

export interface ExtensionSandboxAPI {
  /** Returns true if this extension is running sandboxed (no DOM/app access). */
  isSandboxed(): boolean;
  /** Returns true if this extension is running unsandboxed (full DOM/app access). */
  isUnsandboxed(): boolean;
  /**
   * Throws if the extension is NOT running unsandboxed.
   * Call at the top of your extension to ensure it only runs with full DOM access.
   */
  requireUnsandboxed(message?: string): void;
  /**
   * Throws if the extension is NOT running sandboxed.
   * Call at the top of your extension to enforce that it only runs in the restricted environment.
   */
  requireSandboxed(message?: string): void;
}

export interface ExtensionAPI {
  registerExtension: (extension: Extension) => void;
  unregisterExtension: (id: string) => void;
  getExtensions: () => Extension[];
  getExtension: (id: string) => Extension | null;
  ui: ExtensionUIAPI;
  dom: ExtensionDOMAPI;
  app: ExtensionAppAPI;
  sandbox: ExtensionSandboxAPI;
}

export interface SandboxedExtensionAPI {
  registerExtension: (extension: Extension) => void;
  unregisterExtension: (id: string) => void;
  getExtensions: () => Extension[];
  getExtension: (id: string) => Extension | null;
  ui: ExtensionUIAPI;
  sandbox: ExtensionSandboxAPI;
}

class ExtensionManager {
  private extensions: Map<string, Extension> = new Map();
  private enabledExtensions: Set<string> = new Set();
  private console: ExtensionConsole;

  constructor() {
    this.console = new ExtensionConsole();
  }

  createAPI(extensionId?: string, sandboxed = false): ExtensionAPI {
    const eid = extensionId ?? 'unknown';
    const pr = extensionPatchRegistry;

    const sandbox: ExtensionSandboxAPI = {
      isSandboxed: () => sandboxed,
      isUnsandboxed: () => !sandboxed,
      requireUnsandboxed: (message) => {
        if (sandboxed) throw new Error(message ?? 'This extension requires unsandboxed mode. Change the extension type to Unsandboxed in Settings → Extensions.');
      },
      requireSandboxed: (message) => {
        if (!sandboxed) throw new Error(message ?? 'This extension requires sandboxed mode. Change the extension type to Sandboxed in Settings → Extensions.');
      },
    };

    const ui: ExtensionUIAPI = {
      alert: (msg, opts) => extensionUIRegistry.alert(msg, opts),
      confirm: (msg, opts) => extensionUIRegistry.confirm(msg, opts),
      prompt: (msg, opts) => extensionUIRegistry.prompt(msg, opts),
      toast: (msg, opts) => extensionUIRegistry.toast(msg, opts),
      openModal: (opts) => extensionUIRegistry.openModal(opts),
      addButton: (opts) => extensionUIRegistry.addButton({
        ...opts,
        extensionId: eid,
        location: opts.location ?? 'chat-toolbar',
      }),
      addSidebarSection: (opts) => extensionUIRegistry.addSidebarSection({
        ...opts,
        extensionId: eid,
      }),
    };

    const dom: ExtensionDOMAPI = {
      on: (target, type, handler, options) => pr.on(eid, target, type, handler, options),
      onDocument: (type, handler, options) => pr.on(eid, document, type, handler, options),
      onWindow: (type, handler, options) => pr.on(eid, window, type, handler, options),
      addStyle: (css) => pr.addStyle(eid, css),
      query: (selector) => document.querySelector(selector),
      queryAll: (selector) => Array.from(document.querySelectorAll(selector)),
      observe: (target, callback, options) => pr.observe(eid, target, callback, options),
      setInterval: (fn, ms) => pr.setInterval(eid, fn, ms),
      setTimeout: (fn, ms) => pr.setTimeout(eid, fn, ms),
      onCleanup: (fn) => pr.onCleanup(eid, fn),
    };

    const app: ExtensionAppAPI = {
      sidebar: {
        collapse: () => window.dispatchEvent(new CustomEvent('lumina:sidebar', { detail: { collapsed: true } })),
        expand:   () => window.dispatchEvent(new CustomEvent('lumina:sidebar', { detail: { collapsed: false } })),
        toggle:   () => window.dispatchEvent(new CustomEvent('lumina:sidebar', { detail: { toggle: true } })),
        isCollapsed: () => localStorage.getItem('sidebar-collapsed') === 'true',
        onChange: (fn) => {
          const h = (e: Event) => {
            const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
            fn(collapsed);
          };
          return pr.on(eid, window, 'lumina:sidebar:changed', h);
        },
      },
      emit: (event, detail) => window.dispatchEvent(new CustomEvent(`lumina:ext:${event}`, { detail })),
      on: (event, handler) => pr.on(eid, window, `lumina:ext:${event}`, (e) => handler((e as CustomEvent).detail)),
    };

    return {
      registerExtension: (extension: Extension) => this.registerExtension(extension),
      unregisterExtension: (id: string) => this.unregisterExtension(id),
      getExtensions: () => this.getExtensions(),
      getExtension: (id: string) => this.getExtension(id),
      ui,
      dom,
      app,
      sandbox,
    };
  }

  registerExtension(extension: Extension): boolean {
    try {
      // Validate extension
      const validation = this.validateExtension(extension);
      if (!validation.valid) {
        this.console.error(`Extension validation failed: ${validation.error}`);
        return false;
      }

      // Check for ID conflicts
      if (this.extensions.has(extension.id)) {
        this.console.error(`Extension with ID '${extension.id}' already exists`);
        return false;
      }

      // Store extension
      this.extensions.set(extension.id, extension);
      this.enabledExtensions.add(extension.id);
      
      this.console.log(`Extension '${extension.name}' (${extension.id}) registered successfully`);
      return true;
    } catch (error) {
      this.console.error(`Failed to register extension '${extension.id}': ${error}`);
      return false;
    }
  }

  unregisterExtension(id: string): boolean {
    try {
      if (!this.extensions.has(id)) {
        this.console.warn(`Extension '${id}' not found`);
        return false;
      }

      this.extensions.delete(id);
      this.enabledExtensions.delete(id);
      
      this.console.log(`Extension '${id}' unregistered successfully`);
      return true;
    } catch (error) {
      this.console.error(`Failed to unregister extension '${id}': ${error}`);
      return false;
    }
  }

  getExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }

  getExtension(id: string): Extension | null {
    return this.extensions.get(id) || null;
  }

  getEnabledExtensions(): Extension[] {
    return Array.from(this.extensions.values()).filter(ext => this.enabledExtensions.has(ext.id));
  }

  enableExtension(id: string): boolean {
    if (!this.extensions.has(id)) {
      this.console.error(`Extension '${id}' not found`);
      return false;
    }
    
    this.enabledExtensions.add(id);
    this.console.log(`Extension '${id}' enabled`);
    return true;
  }

  disableExtension(id: string): boolean {
    if (!this.extensions.has(id)) {
      this.console.error(`Extension '${id}' not found`);
      return false;
    }
    
    this.enabledExtensions.delete(id);
    this.console.log(`Extension '${id}' disabled`);
    return true;
  }

  isExtensionEnabled(id: string): boolean {
    return this.enabledExtensions.has(id);
  }

  async executeTool(extensionId: string, toolName: string, args: any, settings: AppSettings): Promise<any> {
    try {
      const extension = this.extensions.get(extensionId);
      if (!extension) {
        throw new Error(`Extension '${extensionId}' not found`);
      }

      if (!this.enabledExtensions.has(extensionId)) {
        throw new Error(`Extension '${extensionId}' is disabled`);
      }

      const tool = extension.tools.find(t => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool '${toolName}' not found in extension '${extensionId}'`);
      }

      // Create context for the tool
      const context: ExtensionContext = {
        settings,
        log: this.console.log.bind(this.console),
        error: this.console.error.bind(this.console),
        warn: this.console.warn.bind(this.console)
      };

      // Validate input
      this.validateToolInput(tool, args);

      // Execute tool with timeout
      const result = await Promise.race([
        tool.call(args, context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
        )
      ]);

      return result;
    } catch (error) {
      this.console.error(`Tool execution failed: ${error}`);
      throw error;
    }
  }

  private validateExtension(extension: Extension): { valid: boolean; error?: string } {
    // Check required fields
    if (!extension.id || typeof extension.id !== 'string') {
      return { valid: false, error: 'Extension ID is required and must be a string' };
    }

    if (!extension.name || typeof extension.name !== 'string') {
      return { valid: false, error: 'Extension name is required and must be a string' };
    }

    if (!extension.version || typeof extension.version !== 'string') {
      return { valid: false, error: 'Extension version is required and must be a string' };
    }

    if (!Array.isArray(extension.tools)) {
      return { valid: false, error: 'Extension tools must be an array' };
    }

    // Validate tools
    for (const tool of extension.tools) {
      const toolValidation = this.validateTool(tool);
      if (!toolValidation.valid) {
        return { valid: false, error: `Tool '${tool.name}': ${toolValidation.error}` };
      }
    }

    // Check for dangerous permissions
    if (extension.permissions) {
      const dangerousPermissions = ['filesystem', 'network', 'system', 'eval'];
      for (const permission of extension.permissions) {
        if (dangerousPermissions.includes(permission)) {
          return { valid: false, error: `Dangerous permission '${permission}' not allowed` };
        }
      }
    }

    return { valid: true };
  }

  private validateTool(tool: ExtensionTool): { valid: boolean; error?: string } {
    if (!tool.name || typeof tool.name !== 'string') {
      return { valid: false, error: 'Tool name is required and must be a string' };
    }

    if (!tool.description || typeof tool.description !== 'string') {
      return { valid: false, error: 'Tool description is required and must be a string' };
    }

    if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
      return { valid: false, error: 'Tool inputSchema is required and must be an object' };
    }

    if (typeof tool.call !== 'function') {
      return { valid: false, error: 'Tool call must be a function' };
    }

    return { valid: true };
  }

  private validateToolInput(tool: ExtensionTool, args: any): void {
    if (!tool.inputSchema.required) return;

    for (const required of tool.inputSchema.required) {
      if (!(required in args)) {
        throw new Error(`Required parameter '${required}' is missing`);
      }
    }

    // Basic type checking
    for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
      if (key in args) {
        const value = args[key];
        const expectedType = schema.type;
        
        if (expectedType === 'string' && typeof value !== 'string') {
          throw new Error(`Parameter '${key}' must be a string`);
        }
        if (expectedType === 'number' && typeof value !== 'number') {
          throw new Error(`Parameter '${key}' must be a number`);
        }
        if (expectedType === 'boolean' && typeof value !== 'boolean') {
          throw new Error(`Parameter '${key}' must be a boolean`);
        }
        if (schema.enum && !schema.enum.includes(value)) {
          throw new Error(`Parameter '${key}' must be one of: ${schema.enum.join(', ')}`);
        }
      }
    }
  }
}

class ExtensionConsole {
  private logs: Array<{ level: 'log' | 'warn' | 'error'; message: string; timestamp: number }> = [];

  log(message: string): void {
    const entry = { level: 'log' as const, message, timestamp: Date.now() };
    this.logs.push(entry);
  }

  warn(message: string): void {
    const entry = { level: 'warn' as const, message, timestamp: Date.now() };
    this.logs.push(entry);
    console.warn(`[Extension] ${message}`);
  }

  error(message: string): void {
    const entry = { level: 'error' as const, message, timestamp: Date.now() };
    this.logs.push(entry);
    console.error(`[Extension] ${message}`);
  }

  getLogs(): Array<{ level: 'log' | 'warn' | 'error'; message: string; timestamp: number }> {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}

// Global extension manager instance
const extensionManager = new ExtensionManager();

// Full API for unsandboxed extensions
export function createChatExtensionAPI(extensionId?: string): ExtensionAPI {
  return extensionManager.createAPI(extensionId, false);
}

// Restricted API for sandboxed extensions (no dom/app)
export function createSandboxedExtensionAPI(extensionId?: string): SandboxedExtensionAPI {
  const full = extensionManager.createAPI(extensionId, true);
  return {
    registerExtension: full.registerExtension,
    unregisterExtension: full.unregisterExtension,
    getExtensions: full.getExtensions,
    getExtension: full.getExtension,
    ui: full.ui,
    sandbox: full.sandbox,
  };
}

// Export manager for internal use
export { extensionManager };
