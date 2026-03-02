import { defineTool } from '../types/tools';

export default defineTool(
  'calculate',
  'Perform basic mathematical calculations',
  {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2", "10 * 5 - 3")'
      }
    },
    required: ['expression']
  },
  async (args: { expression: string }) => {
    try {
      // Safe eval using Function constructor with limited scope
      const result = Function(`'use strict'; return (${args.expression})`)();
      return {
        expression: args.expression,
        result: result,
        success: true
      };
    } catch (error) {
      return {
        expression: args.expression,
        error: error instanceof Error ? error.message : 'Invalid expression',
        success: false
      };
    }
  }
);
