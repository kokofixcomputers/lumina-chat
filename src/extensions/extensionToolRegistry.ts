import { defineTool, type Tool } from '../types/tools';
import { extensionManager } from './extensionSystem';
import { extensionLoader } from './extensionLoader';
import type { AppSettings } from '../types';

class ExtensionToolRegistry {
  private dynamicTools: Map<string, Tool> = new Map();
  private toolDefinitions: Map<string, any> = new Map();

  registerExtensionTools(extensionId: string, tools: any[]): void {
    // Unregister existing tools for this extension
    this.unregisterExtensionTools(extensionId);

    // Register each tool as a dynamic tool
    tools.forEach(tool => {
      const toolName = `${extensionId.replace(/\./g, '_')}_${tool.name}`;
      const dynamicTool = defineTool(
        toolName,
        tool.description,
        tool.inputSchema,
        async (args: any) => {
          // Get settings from localStorage
          const settingsData = localStorage.getItem('lumina_settings');
          let settings: AppSettings = {
            theme: 'system',
            providers: [],
            defaultModelId: '',
            defaultProviderModelId: '',
            modelSettings: {
              temperature: 0.7,
              maxTokens: 2048,
              topP: 1,
              frequencyPenalty: 0,
              presencePenalty: 0,
              systemPrompt: '',
              stream: true
            }
          };
          
          if (settingsData) {
            try {
              const parsed = JSON.parse(settingsData);
              settings = { ...settings, ...parsed };
            } catch {}
          }

          try {
            const result = await extensionManager.executeTool(
              extensionId,
              tool.name,
              args,
              settings
            );
            
            return result;
          } catch (error) {
            throw new Error(`Extension tool failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      );

      this.dynamicTools.set(toolName, dynamicTool);
      this.toolDefinitions.set(toolName, { extensionId, tool });
    });
  }

  unregisterExtensionTools(extensionId: string): void {
    // Find and remove all tools for this extension
    const toolsToRemove: string[] = [];
    
    for (const [toolName, definition] of this.toolDefinitions.entries()) {
      if (definition.extensionId === extensionId) {
        toolsToRemove.push(toolName);
      }
    }

    toolsToRemove.forEach(toolName => {
      this.dynamicTools.delete(toolName);
      this.toolDefinitions.delete(toolName);
    });
  }

  getDynamicTools(): Tool[] {
    return Array.from(this.dynamicTools.values());
  }

  getTool(toolName: string): Tool | null {
    return this.dynamicTools.get(toolName) || null;
  }

  getToolDefinition(toolName: string): any {
    return this.toolDefinitions.get(toolName);
  }

  getAllToolNames(): string[] {
    return Array.from(this.dynamicTools.keys());
  }

  clear(): void {
    this.dynamicTools.clear();
    this.toolDefinitions.clear();
  }
}

export const extensionToolRegistry = new ExtensionToolRegistry();
