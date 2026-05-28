import { defineTool } from '../types/tools';

export default defineTool(
  'remotion',
  `Generate a single React component that uses Remotion for creating animation videos using LLMs.

Rules:
- Export the component as a named export called "MyComposition"
- Use useCurrentFrame() and useVideoConfig() from "remotion"
- Animate values with interpolate() or spring() as appropriate
- Use AbsoluteFill for full-screen elements
- Use Sequence for timing elements
- Use Series for sequential elements
- Use TransitionSeries for transitions between elements
- Use Video from @remotion/media for video elements
- Use Img from remotion for images
- Use Audio from @remotion/media for audio
- Use random() from remotion for randomness (not Math.random())
- Default fps should be 30
- Default height should be 1080
- Default width should be 1920
- Default id should be "MyComp"
- Use staticFile() from remotion for assets in public folder
- All code must be deterministic - no Math.random()

The tool will compile the generated Remotion code using @babel/standalone and return a preview component.`,
  {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The Remotion React component code to compile and preview'
      },
      durationInFrames: {
        type: 'number',
        description: 'Duration of the video in frames (default: 150)'
      },
      fps: {
        type: 'number',
        description: 'Frames per second (default: 30)'
      },
      compositionWidth: {
        type: 'number',
        description: 'Composition width in pixels (default: 1920)'
      },
      compositionHeight: {
        type: 'number',
        description: 'Composition height in pixels (default: 1080)'
      }
    },
    required: ['code']
  },
  async (args) => {
    try {
      const { 
        code, 
        durationInFrames = 150, 
        fps = 30, 
        compositionWidth = 1920, 
        compositionHeight = 1080 
      } = args;

      // Return the compiled code metadata for the frontend to handle
      return {
        success: true,
        code,
        durationInFrames,
        fps,
        compositionWidth,
        compositionHeight,
        message: 'Remotion component generated successfully. The frontend will compile and preview this component.'
      };
    } catch (error) {
      throw new Error(`Failed to generate Remotion component: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
