export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { query } = await req.json();
    const apiKey = req.headers.get('x-serpapi-key');
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'SerpAPI key not configured' }), { status: 400 });
    }

    const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('SerpAPI request failed');
    }
    
    const data = await response.json();
    const organicResults = data.organic_results || [];
    
    const results = organicResults.slice(0, 5).map((result: any) => ({
      title: result.title,
      link: result.link,
      snippet: result.snippet
    }));
    
    return new Response(JSON.stringify({ results }), { status: 200 });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Search failed' }), { status: 500 });
  }
}
