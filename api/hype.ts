export const config = {
  runtime: 'edge',
};

import { Redis } from '@upstash/redis';

// Initialize Redis using Vercel-configured Upstash env vars
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Return all hype counts grouped by os/arch
  if (req.method === 'GET') {
    try {
      const keys = await redis.keys('vote:*');
      let votes: { os: string; arch: string; count: number }[] = [];

      if (keys.length > 0) {
        const values = await redis.mget<(number | string | null)[]>(...keys);
        votes = keys.map((key, i) => {
          const [, os, arch] = key.split(':');
          return { os, arch, count: Number(values[i]) || 0 };
        });
      }

      return new Response(JSON.stringify({ votes }), {
        status: 200,
        headers: corsHeaders(),
      });
    } catch (error) {
      console.error('Hype fetch error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to fetch hype counts',
        details: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders(),
    });
  }

  try {
    const { os, arch } = await req.json();

    if (!os || !arch) {
      return new Response(JSON.stringify({ error: 'Missing os or arch' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    console.log('Hyping for:', { os, arch });

    // Increment counter for this os/arch combination
    const result = await redis.incr(`vote:${os}:${arch}`);
    
    console.log('Redis incr result:', result);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Thanks for hyping!',
      os,
      arch,
      newCount: result
    }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (error) {
    console.error('Hype error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return new Response(JSON.stringify({ 
      error: 'Hype request failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}