import { defineTool } from '../types/tools';

export default defineTool(
  'google_search',
  'Search Google for information on any topic',
  {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up on Google'
      }
    },
    required: ['query']
  },
  async (args: { query: string }) => {
    const serpApiKey = localStorage.getItem('lumina_settings');
    let apiKey = '';
    if (serpApiKey) {
      try {
        const settings = JSON.parse(serpApiKey);
        apiKey = settings.serpApiKey || '';
      } catch {}
    }
    
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-serpapi-key': apiKey
      },
      body: JSON.stringify({ query: args.query })
    });
    
    if (!response.ok) {
      throw new Error('Search failed');
    }
    
    const data = await response.json();
    return data;
  }
);
