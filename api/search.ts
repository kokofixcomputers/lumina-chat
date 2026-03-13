export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { query } = await req.json();
    const apiKey = req.headers.get('x-serper-key');
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Serper API key not configured' }), { status: 400 });
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query })
    });
    
    if (!response.ok) {
      throw new Error('Serper API request failed');
    }
    
    const data = await response.json();
    
    return new Response(JSON.stringify({
      knowledgeGraph: data.knowledgeGraph,
      organic: data.organic,
      peopleAlsoAsk: data.peopleAlsoAsk
    }), { status: 200 });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Search failed' }), { status: 500 });
  }
}
