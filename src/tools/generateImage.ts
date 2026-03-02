import { defineTool } from '../types/tools';

export default defineTool(
  'generate_image',
  'Generate an image based on a text description',
  {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed description of the image to generate'
      },
      size: {
        type: 'string',
        description: 'Image size (1024x1024, 1792x1024, or 1024x1792)',
        enum: ['1024x1024', '1792x1024', '1024x1792']
      }
    },
    required: ['prompt']
  },
  async (args: { prompt: string; size?: string }) => {
    // This will be handled specially in the hook
    return {
      prompt: args.prompt,
      size: args.size || '1024x1024',
      _requiresImageGeneration: true
    };
  }
);
