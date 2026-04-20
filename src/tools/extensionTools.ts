import { defineTool } from '../types/tools';
import { extensionManager } from '../extensions/extensionSystem';
import { extensionLoader } from '../extensions/extensionLoader';
import { extensionStorage } from '../extensions/extensionStorage';
import type { AppSettings } from '../types';

// Create a tool that can execute extension tools
export default defineTool(
  'extension_tool',
  'Execute a tool from a user-installed extension',
  {
    type: 'object',
    properties: {
      extension_id: {
        type: 'string',
        description: 'The ID of the extension containing the tool'
      },
      tool_name: {
        type: 'string',
        description: 'The name of the tool to execute'
      },
      arguments: {
        type: 'object',
        description: 'The arguments to pass to the tool (JSON object)'
      }
    },
    required: ['extension_id', 'tool_name', 'arguments']
  },
  async (args: { extension_id: string; tool_name: string; arguments: any }) => {
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
        args.extension_id,
        args.tool_name,
        args.arguments,
        settings
      );
      
      return {
        success: true,
        result,
        extension_id: args.extension_id,
        tool_name: args.tool_name
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        extension_id: args.extension_id,
        tool_name: args.tool_name
      };
    }
  }
);

// Tool to list available extensions
export const listExtensions = defineTool(
  'list_extensions',
  'List all installed extensions and their tools',
  {
    type: 'object',
    properties: {
      include_disabled: {
        type: 'boolean',
        description: 'Whether to include disabled extensions in the list'
      }
    }
  },
  async (args: { include_disabled?: boolean }) => {
    try {
      const extensions = args.include_disabled 
        ? extensionManager.getExtensions()
        : extensionManager.getEnabledExtensions();
      
      const extensionList = extensions.map(ext => ({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        description: ext.description,
        author: ext.author,
        tools: ext.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema
        })),
        enabled: extensionManager.isExtensionEnabled(ext.id),
        loaded: extensionLoader.isExtensionLoaded(ext.id)
      }));

      return {
        success: true,
        extensions: extensionList,
        count: extensionList.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
);
