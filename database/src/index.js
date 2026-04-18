export { UserStore } from './user-store.js';

// Generate a random 6-character code
function generateShareCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Helper function to add CORS headers to responses
    const addCorsHeaders = (response) => {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });
    };

    if (url.pathname === "/ws") {
      const userId = url.searchParams.get("userId");
      if (!userId) return addCorsHeaders(new Response("Missing userId", { status: 400 }));

      const id = env.LUMINA_CHAT_USER_DO.idFromName(userId);
      const stub = env.LUMINA_CHAT_USER_DO.get(id);
      return stub.fetch(request);
    }

    // Share conversation endpoint
    if (url.pathname === "/share") {
      if (request.method === 'POST') {
        try {
          const { conversation, expiryDays = 7 } = await request.json();
          
          if (!conversation) {
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Missing conversation data' }), { 
              status: 400, 
              headers: { 'Content-Type': 'application/json' } 
            }));
          }

          // Generate unique code
          let code;
          let attempts = 0;
          do {
            code = generateShareCode();
            attempts++;
            if (attempts > 10) {
              return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to generate unique code' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
              }));
            }
          } while (await env.LUMINA_CHAT_SHARED.get(code));

          // Calculate expiry date
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + expiryDays);

          // Store shared conversation
          const shareData = {
            conversation,
            createdAt: new Date().toISOString(),
            expiresAt: expiryDate.toISOString(),
            expiryDays
          };

          await env.LUMINA_CHAT_SHARED.put(code, JSON.stringify(shareData), {
            expirationTtl: expiryDays * 24 * 60 * 60 // Convert days to seconds
          });

          return addCorsHeaders(new Response(JSON.stringify({ 
            success: true, 
            code,
            expiresAt: expiryDate.toISOString()
          }), { 
            headers: { 'Content-Type': 'application/json' } 
          }));

        } catch (error) {
          return addCorsHeaders(new Response(JSON.stringify({ 
            error: 'Failed to share conversation',
            details: error.message 
          }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
          }));
        }
      }
      
      if (request.method === 'GET') {
        const code = url.searchParams.get('code');
        if (!code) {
          return addCorsHeaders(new Response(JSON.stringify({ error: 'Missing share code' }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          }));
        }

        try {
          const sharedData = await env.LUMINA_CHAT_SHARED.get(code);
          if (!sharedData) {
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Share not found or expired' }), { 
              status: 404, 
              headers: { 'Content-Type': 'application/json' } 
            }));
          }

          const data = JSON.parse(sharedData);
          
          // Check if expired
          if (new Date(data.expiresAt) < new Date()) {
            await env.LUMINA_CHAT_SHARED.delete(code);
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Share has expired' }), { 
              status: 410, 
              headers: { 'Content-Type': 'application/json' } 
            }));
          }

          return addCorsHeaders(new Response(JSON.stringify({ 
            success: true, 
            conversation: data.conversation,
            expiresAt: data.expiresAt 
          }), { 
            headers: { 'Content-Type': 'application/json' } 
          }));

        } catch (error) {
          return addCorsHeaders(new Response(JSON.stringify({ 
            error: 'Failed to retrieve shared conversation',
            details: error.message 
          }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
          }));
        }
      }
      
      if (request.method === 'DELETE') {
        const code = url.searchParams.get('code');
        if (!code) {
          return addCorsHeaders(new Response(JSON.stringify({ error: 'Missing share code' }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          }));
        }

        try {
          await env.LUMINA_CHAT_SHARED.delete(code);
          return addCorsHeaders(new Response(JSON.stringify({ success: true }), { 
            headers: { 'Content-Type': 'application/json' } 
          }));
        } catch (error) {
          return addCorsHeaders(new Response(JSON.stringify({ 
            error: 'Failed to unshare conversation',
            details: error.message 
          }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
          }));
        }
      }
    }

    return addCorsHeaders(new Response("Not found", { status: 404 }));
  }
};