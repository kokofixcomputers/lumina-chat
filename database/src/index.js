export { UserStore } from './user-store.js';
export { SyncBackend } from './sync-backend.js';

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// Simple sync WebSocket handler using KV storage
async function handleSyncWebSocket(request, env) {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  let userId = null;
  let isAuthenticated = false;

  server.addEventListener("message", async (event) => {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'auth':
          const { username, password } = message;
          
          // Simple authentication using KV
          const userKey = `user:${username}`;
          const userData = await env.LUMINA_CHAT_USER_KV.get(userKey);
          
          if (userData) {
            const user = JSON.parse(userData);
            const hash = createHash('sha256');
            hash.update(password + user.salt);
            const passwordHash = hash.digest('hex');
            
            if (passwordHash === user.passwordHash) {
              userId = user.id;
              isAuthenticated = true;
              
              server.send(JSON.stringify({
                type: 'auth_response',
                success: true,
                userId: user.id,
                isNewUser: false
              }));
              
              // Send initial state
              const conversationsData = await env.LUMINA_CHAT_USER_KV.get(`conversations:${user.id}`);
              const settingsData = await env.LUMINA_CHAT_USER_KV.get(`settings:${user.id}`);
              const initialState = {};
              if (conversationsData) {
                initialState.conversations = JSON.parse(conversationsData);
              }
              if (settingsData) {
                initialState.settings = JSON.parse(settingsData);
              }
              if (Object.keys(initialState).length > 0) {
                server.send(JSON.stringify({
                  type: 'initial_state',
                  data: initialState
                }));
              }
            } else {
              server.send(JSON.stringify({
                type: 'auth_response',
                success: false,
                error: 'Invalid credentials'
              }));
            }
          } else {
            // Create new user
            const salt = randomBytes(16).toString('hex');
            const hash = createHash('sha256');
            hash.update(password + salt);
            const passwordHash = hash.digest('hex');
            const newUserId = randomBytes(16).toString('hex');
            
            const newUser = {
              id: newUserId,
              username,
              passwordHash,
              salt,
              createdAt: Date.now()
            };
            
            await env.LUMINA_CHAT_USER_KV.put(userKey, JSON.stringify(newUser));
            
            userId = newUserId;
            isAuthenticated = true;
            
            server.send(JSON.stringify({
              type: 'auth_response',
              success: true,
              userId: newUserId,
              isNewUser: true
            }));
          }
          break;
          
        case 'sync_action':
          if (!isAuthenticated) {
            server.send(JSON.stringify({
              type: 'error',
              error: 'Not authenticated'
            }));
            return;
          }
          
          const action = message.data; // This is the actual sync action
          
          try {
            // Store the sync action
            const actionKey = `action:${userId}:${Date.now()}`;
            await env.LUMINA_CHAT_USER_KV.put(actionKey, JSON.stringify(action));
            
            // Apply action to conversations
            const conversationsKey = `conversations:${userId}`;
            const conversationsData = await env.LUMINA_CHAT_USER_KV.get(conversationsKey);
            let conversations = conversationsData ? JSON.parse(conversationsData) : [];
            
            // Handle different action types
            if (action.type === 'create_conversation') {
              // Ensure the conversation has required fields
              const newConv = {
                ...action.data,
                messages: action.data.messages || [],
                createdAt: action.data.createdAt || Date.now(),
                updatedAt: action.data.updatedAt || Date.now()
              };
              conversations.unshift(newConv);
            } else if (action.type === 'create_message') {
              const conv = conversations.find(c => c.id === action.data.conversationId);
              if (conv) {
                conv.messages = conv.messages || [];
                conv.messages.push(action.data.message);
                conv.updatedAt = action.timestamp;
              }
            } else if (action.type === 'delete_conversation') {
              conversations = conversations.filter(c => c.id !== action.data.conversationId);
            } else if (action.type === 'update_title') {
              const conv = conversations.find(c => c.id === action.data.conversationId);
              if (conv) {
                conv.title = action.data.title;
                conv.updatedAt = action.timestamp;
              }
            } else if (action.type === 'delete_message') {
              const conv = conversations.find(c => c.id === action.data.conversationId);
              if (conv) {
                conv.messages = conv.messages.filter(m => m.id !== action.data.messageId);
                conv.updatedAt = action.timestamp;
              }
            } else if (action.type === 'overwrite_data') {
              // Complete data overwrite
              if (action.data.conversations) {
                conversations = action.data.conversations;
              }
              if (action.data.settings) {
                // Store settings separately
                const settingsKey = `settings:${userId}`;
                await env.LUMINA_CHAT_USER_KV.put(settingsKey, JSON.stringify(action.data.settings));
              }
              console.log('Data overwritten for user:', userId);
            } else {
              console.log('Unhandled action type:', action.type);
            }
            
            await env.LUMINA_CHAT_USER_KV.put(conversationsKey, JSON.stringify(conversations));
            
            server.send(JSON.stringify({
              type: 'sync_ack',
              actionId: `${action.type}_${action.timestamp}`,
              success: true
            }));
          } catch (error) {
            console.error('Error processing sync action:', error);
            server.send(JSON.stringify({
              type: 'sync_ack',
              actionId: `${action.type}_${action.timestamp}`,
              success: false,
              error: 'Failed to process action'
            }));
          }
          break;
          
        case 'erase_data':
          if (!isAuthenticated) {
            server.send(JSON.stringify({
              type: 'error',
              error: 'Not authenticated'
            }));
            return;
          }
          
          // Delete all user data
          const list = await env.LUMINA_CHAT_USER_KV.list({ prefix: `${userId}:` });
          await Promise.all(list.keys.map(key => env.LUMINA_CHAT_USER_KV.delete(key.name)));
          
          server.send(JSON.stringify({
            type: 'erase_data_response',
            success: true
          }));
          break;
          
        default:
          server.send(JSON.stringify({
            type: 'error',
            error: 'Unknown message type'
          }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      server.send(JSON.stringify({
        type: 'error',
        error: 'Internal server error'
      }));
    }
  });

  server.addEventListener("close", () => {
    console.log('WebSocket connection closed');
  });

  return new Response(null, { status: 101, webSocket: client });
}

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

    // New sync WebSocket endpoint using Durable Objects
    if (url.pathname === "/sync-ws") {
      const id = env.LUMINA_CHAT_SYNC_DO.idFromName("global-sync");
      const stub = env.LUMINA_CHAT_SYNC_DO.get(id);
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