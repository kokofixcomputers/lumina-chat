export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: any;
  properties?: Record<string, any>;
  required?: string[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameter>;
      required?: string[];
    };
  };
}

export interface Tool {
  definition: ToolDefinition;
  execute: (args: any) => Promise<any>;
}

export function defineTool(
  name: string,
  description: string,
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  },
  execute: (args: any) => Promise<any>
): Tool {
  return {
    definition: {
      type: 'function',
      function: { name, description, parameters }
    },
    execute
  };
}
