import { defineTool } from '../types/tools';

export default defineTool(
  'google_search',
  'Search Google for current information, news, facts, or any topic',
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
    try {
      const apiKey = localStorage.getItem('serpapi_key');
      if (!apiKey) {
        throw new Error('SerpAPI key not configured. Please add it in settings.');
      }
      
      const url = `https://cors-proxy-rouge.vercel.app/?url=https://serpapi.com/search?engine=google&q=${encodeURIComponent(args.query)}&apikey=${apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      const results = data.organic_results?.slice(0, 5).map((r: any) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet
      })) || [];
      
      return {
        query: args.query,
        results,
        total_results: data.search_information?.total_results || 0
      };
    } catch (error) {
      return {
        query: args.query,
        error: error instanceof Error ? error.message : 'Search failed',
        results: []
      };
    }
  }
);
