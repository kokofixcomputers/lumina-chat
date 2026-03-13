import { defineTool } from '../types/tools';

export default defineTool(
  'web_request',
  'Fetch and scrape content from any web URL, returns markdown content',
  {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch and scrape'
      },
      fallback: {
        type: 'boolean',
        description: 'Please try with this mode off. This is a fallback option that uses a different scraping method if the main one fails. It may be less reliable but can work for some sites.',
      }
    },
    required: ['url']
  },
  async (args: { url: string, fallback?: boolean }) => {
    const settingsData = localStorage.getItem('lumina_settings');
    let apiKey = '';
    if (settingsData) {
      try {
        const settings = JSON.parse(settingsData);
        apiKey = settings.scrapingBeeApiKey || '';
      } catch {}
    }
    
    if (!apiKey) {
      throw new Error('ScrapingBee API key not configured');
    }

    const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1?api_key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(args.url)}&render_js=${args.fallback ? 'true' : 'false'}&return_page_markdown=true`;

    const response = await fetch(scrapingBeeUrl);

    if (!response.ok) {
      throw new Error('Web request failed');
    }
    
    const content = await response.text();
    
    return {
      content
    };
  }
);
