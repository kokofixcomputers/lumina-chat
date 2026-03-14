import { defineTool } from '../types/tools';

export default defineTool(
  'city_search',
  'Search for cities to use with hotel_search. Returns cityId values needed for hotel searches.',
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'City name to search for' },
    },
    required: ['query'],
  },
  async (args: { query: string }) => {
    const response = await fetch('https://locktrip.com/mcp/tools/search_location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: args.query }),
    });

    if (!response.ok) throw new Error(`City search failed: ${response.status}`);

    const data = await response.json();
    return {
      locations: (data.locations || []).map(({ id, name, type, fullName }: any) => ({
        cityId: id,
        name,
        type,
        fullName,
      })),
      totalCount: data.totalCount,
    };
  }
);
