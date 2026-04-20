import type { AppSettings } from '../types';

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

export interface ExtensionAPI {
  registerExtension: (extension: Extension) => void;
  unregisterExtension: (id: string) => void;
  getExtensions: () => Extension[];
  getExtension: (id: string) => Extension | null;
}

class ExtensionManager {
  private extensions: Map<string, Extension> = new Map();
  private enabledExtensions: Set<string> = new Set();
  private console: ExtensionConsole;

  constructor() {
    this.console = new ExtensionConsole();
  }

  createAPI(): ExtensionAPI {
    return {
      registerExtension: (extension: Extension) => this.registerExtension(extension),
      unregisterExtension: (id: string) => this.unregisterExtension(id),
      getExtensions: () => this.getExtensions(),
      getExtension: (id: string) => this.getExtension(id)
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
    console.log(`[Extension] ${message}`);
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

// Create the API that extensions will use
export function createChatExtensionAPI(): ExtensionAPI {
  return extensionManager.createAPI();
}

// Export manager for internal use
export { extensionManager };
