import { defineTool } from '../types/tools';
import { createPresentation, PresentationData } from './presentationGenerator';

export default defineTool(
  'presentation',
  'Generate beautiful PowerPoint presentations. Creates professional-looking slides with various layouts including title slides, three-cards layouts, bar charts, bullet points, quotes, and two-column layouts. Returns a downloadable PowerPoint file.\n\nSupported slide types:\n- title: Main title slide with optional subtitle and hero icon\n- three-cards: Three parallel content cards\n- bar-chart: Data visualization with bar charts\n- bullet-points: Traditional bullet point lists\n- quote: Large quote with attribution\n- two-column: Side-by-side content comparison\n\nTheme options:\n- Dark themes with bold accent colors\n- Light themes with professional palettes\n- Custom fonts and styling\n\nThe presentation will be automatically provided as a downloadable PowerPoint file.',
  {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        description: 'Complete presentation data structure with deck info and slides array',
        properties: {
          deck: {
            type: 'object',
            description: 'Presentation metadata and theme configuration',
            properties: {
              title: { type: 'string', description: 'Presentation title' },
              subtitle: { type: 'string', description: 'Presentation subtitle' },
              audience: { type: 'string', description: 'Target audience' },
              goal: { type: 'string', description: 'Presentation goal' },
              style_preset: { type: 'string', description: 'Style preset name' },
              theme: {
                type: 'object',
                description: 'Visual theme configuration',
                properties: {
                  mode: { type: 'string', enum: ['dark', 'light'], description: 'Theme mode' },
                  palette: {
                    type: 'object',
                    description: 'Color palette',
                    properties: {
                      bg: { type: 'string', description: 'Background color (hex)' },
                      text: { type: 'string', description: 'Text color (hex)' },
                      accent: { type: 'string', description: 'Primary accent color (hex)' },
                      accent2: { type: 'string', description: 'Secondary accent color (hex)' }
                    },
                    required: ['bg', 'text', 'accent', 'accent2']
                  },
                  fonts: {
                    type: 'object',
                    description: 'Font configuration',
                    properties: {
                      display: { type: 'string', description: 'Display font for headings' },
                      body: { type: 'string', description: 'Body font for content' }
                    },
                    required: ['display', 'body']
                  }
                },
                required: ['mode', 'palette', 'fonts']
              }
            },
            required: ['title', 'subtitle', 'audience', 'goal', 'style_preset', 'theme']
          },
          slides: {
            type: 'array',
            description: 'Array of slide objects',
            items: {
              type: 'object',
              description: 'Individual slide configuration',
              properties: {
                type: {
                  type: 'string',
                  enum: ['title', 'three-cards', 'bar-chart', 'bullet-points', 'quote', 'two-column'],
                  description: 'Slide layout type'
                },
                headline: { type: 'string', description: 'Slide headline/title' },
                subheadline: { type: 'string', description: 'Subtitle for title slides' },
                visual: {
                  type: 'object',
                  description: 'Visual elements for title slides',
                  properties: {
                    kind: { type: 'string', description: 'Visual type' },
                    icon: { type: 'string', description: 'Icon or emoji for hero section' }
                  }
                },
                cards: {
                  type: 'array',
                  description: 'Cards data for three-cards layout',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'Card title' },
                      body: { type: 'string', description: 'Card content' }
                    },
                    required: ['title', 'body']
                  }
                },
                chart: {
                  type: 'object',
                  description: 'Chart data for bar-chart layout',
                  properties: {
                    labels: { type: 'array', items: { type: 'string' }, description: 'Chart labels' },
                    values: { type: 'array', items: { type: 'number' }, description: 'Chart values' },
                    unit: { type: 'string', description: 'Unit for chart values (e.g., "%", "$")' }
                  },
                  required: ['labels', 'values']
                },
                insight: { type: 'string', description: 'Insight text for chart slides' },
                bullets: {
                  type: 'array',
                  description: 'Bullet points for bullet-points or quote slides',
                  items: { type: 'string' }
                },
                leftColumn: { type: 'string', description: 'Left column content for two-column layout' },
                rightColumn: { type: 'string', description: 'Right column content for two-column layout' }
              },
              required: ['type']
            }
          }
        },
        required: ['deck', 'slides']
      }
    },
    required: ['data']
  },
  async (args) => {
    try {
      const { data } = args;
      
      // Parse data if it's a string
      let presentationData: PresentationData;
      if (typeof data === 'string') {
        try {
          presentationData = JSON.parse(data);
        } catch (e) {
          throw new Error('Invalid JSON data format for presentation');
        }
      } else {
        presentationData = data;
      }

      // Validate required structure
      if (!presentationData.deck || !presentationData.slides) {
        throw new Error('Presentation must contain both deck and slides');
      }

      if (!Array.isArray(presentationData.slides) || presentationData.slides.length === 0) {
        throw new Error('Presentation must contain at least one slide');
      }

      // Generate the presentation
      const pptxBuffer = await createPresentation(presentationData);

      // Convert to base64 for transmission (browser compatible)
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pptxBuffer)));
      
      // Create a markdown block with the presentation file
      const presentationMarkdown = `\`\`\`presentation
${presentationData.deck.title.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 20)}.pptx
data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64Data}
\`\`\``;

      // Return a simple message to the AI - the actual presentation will be injected automatically
      return "The result was automatically published to user";
    } catch (error) {
      throw new Error(`Failed to generate presentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
