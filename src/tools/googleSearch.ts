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
    const settingsData = localStorage.getItem('lumina_settings');
    let apiKey = '';
    if (settingsData) {
      try {
        const settings = JSON.parse(settingsData);
        apiKey = settings.serperApiKey || '';
      } catch {}
    }
    
    if (!apiKey) {
      throw new Error('Serper API key not configured');
    }
    
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: args.query })
    });
    
    if (!response.ok) {
      throw new Error('Search failed');
    }
    
    const data = await response.json();
    
    return {
      knowledgeGraph: data.knowledgeGraph,
      organic: data.organic,
      peopleAlsoAsk: data.peopleAlsoAsk
    };
  }
);
