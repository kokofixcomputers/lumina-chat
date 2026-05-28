export const config = {
  runtime: 'edge',
};

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

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
    const { os, arch } = await req.json();

    if (!os || !arch) {
      return new Response(JSON.stringify({ error: 'Missing os or arch' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    // Get user identifier (from Authorization header, cookie, or IP)
    const userId = req.headers.get('authorization')?.split(' ')[1] 
                   || req.headers.get('x-user-id') 
                   || req.headers.get('x-forwarded-for') 
                   || 'anonymous';

    const userKey = `hype:${userId}`;

    // Store the hype vote (atomic SET with 1-year TTL)
    await redis.set(userKey, JSON.stringify({ os, arch }), {
      ex: 31536000,
    });

    // Increment counter for this os/arch combination
    await redis.incr(`vote:${os}:${arch}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Thanks for hyping!',
      os,
      arch
    }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (error) {
    console.error('Hype error:', error);
    return new Response(JSON.stringify({ error: 'Hype request failed' }), {
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