export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders(),
    });
  }

  try {
    const { url, headers: forwardHeaders, body, method = 'POST' } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const upstream = await fetch(url, {
      method,
      headers: forwardHeaders ?? {},
      body: body ? JSON.stringify(body) : undefined,
    });

    // Stream the response body directly back to the client
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}
