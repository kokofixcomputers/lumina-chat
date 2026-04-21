import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

export class SyncBackend {
  constructor(ctx, env) {
    console.log('SyncBackend Durable Object initialized');
    this.ctx = ctx;
    this.env = env;
    this.authenticatedConnections = new Map(); // userId -> Set of WebSocket connections
    this.userStates = new Map(); // userId -> UserState

    // Initialize database tables
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login INTEGER
      )
    `);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS user_data (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sync_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        processed INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    this.ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_actions_user_timestamp 
      ON sync_actions (user_id, timestamp)
    `);
  }

  // Authentication methods
  _generateSalt() {
    return randomBytes(16).toString('hex');
  }

  _hashPassword(password, salt) {
    return createHash('sha256').update(password + salt).digest('hex');
  }

  _generateUserId() {
    return randomBytes(16).toString('hex');
  }

  async authenticateUser(username, password) {
    try {
      // Check if user exists
      const user = [...this.ctx.storage.sql.exec(
        "SELECT id, password_hash, salt FROM users WHERE username = ?",
        username
      )][0];

      if (!user) {
        // Create new user
        const salt = this._generateSalt();
        const passwordHash = this._hashPassword(password, salt);
        const userId = this._generateUserId();
        const now = Date.now();

        this.ctx.storage.sql.exec(
          "INSERT INTO users (id, username, password_hash, salt, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)",
          userId, username, passwordHash, salt, now, now
        );

        return { success: true, userId, isNewUser: true };
      } else {
        // Verify existing user
        const expectedHash = this._hashPassword(password, user.salt);
        if (expectedHash === user.password_hash) {
          // Update last login
          this.ctx.storage.sql.exec(
            "UPDATE users SET last_login = ? WHERE id = ?",
            Date.now(), user.id
          );
          return { success: true, userId: user.id, isNewUser: false };
        } else {
          return { success: false, error: 'Invalid password' };
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  // Encryption methods (server-side)
  _encryptData(data, password) {
    try {
      const salt = randomBytes(16);
      const key = createHash('sha256').update(password + salt.toString('hex')).digest();
      const iv = randomBytes(16);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Encryption failed');
    }
  }

  _decryptData(encryptedData, password) {
    try {
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      const key = createHash('sha256').update(password + salt.toString('hex')).digest();
      
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Decryption failed');
    }
  }

  // User data storage
  async setUserData(userId, key, value, password = null) {
    try {
      let storedValue;
      const now = Date.now();
      
      if (password) {
        // Encrypt sensitive data (like settings)
        const encrypted = this._encryptData(value, password);
        storedValue = JSON.stringify(encrypted);
      } else {
        // Store sync data unencrypted (conversations, messages)
        storedValue = JSON.stringify(value);
      }
      
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)",
        userId, key, storedValue, now
      );
      
      return true;
    } catch (error) {
      console.error('Set user data error:', error);
      return false;
    }
  }

  async getUserData(userId, key, password = null) {
    try {
      const row = [...this.ctx.storage.sql.exec(
        "SELECT value FROM user_data WHERE user_id = ? AND key = ?",
        userId, key
      )][0];
      
      if (!row) return null;
      
      const storedData = JSON.parse(row.value);
      
      // Check if data is encrypted (has encrypted structure)
      if (storedData.encrypted && password) {
        return this._decryptData(storedData, password);
      } else {
        // Return unencrypted data
        return storedData;
      }
    } catch (error) {
      console.error('Get user data error:', error);
      return null;
    }
  }

  // Sync action methods
  async storeSyncAction(userId, action) {
    try {
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_actions (user_id, action_type, action_data, timestamp) VALUES (?, ?, ?, ?)",
        userId, action.type, JSON.stringify(action), action.timestamp
      );
      return true;
    } catch (error) {
      console.error('Store sync action error:', error);
      return false;
    }
  }

  async getSyncActions(userId, sinceTimestamp = 0) {
    try {
      const rows = [...this.ctx.storage.sql.exec(
        "SELECT action_data, timestamp FROM sync_actions WHERE user_id = ? AND timestamp > ? ORDER BY timestamp",
        userId, sinceTimestamp
      )];
      
      return rows.map(row => ({
        ...JSON.parse(row.action_data),
        timestamp: row.timestamp
      }));
    } catch (error) {
      console.error('Get sync actions error:', error);
      return [];
    }
  }

  // WebSocket message handling
  async handleWebSocketMessage(ws, message) {
    console.log('SyncBackend received WebSocket message:', message);
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'auth':
          await this._handleAuth(ws, msg);
          break;
          
        case 'sync_action':
          await this._handleSyncAction(ws, msg);
          break;
          
        case 'erase_data':
          await this._handleEraseData(ws, msg);
          break;
          
        default:
          ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
    }
  }

  async _handleAuth(ws, authMsg) {
    const { username, password } = authMsg;
    const authResult = await this.authenticateUser(username, password);
    
    if (authResult.success) {
      // Mark connection as authenticated
      if (!this.authenticatedConnections.has(authResult.userId)) {
        this.authenticatedConnections.set(authResult.userId, new Set());
      }
      this.authenticatedConnections.get(authResult.userId).add(ws);
      
      // Store userId on WebSocket for cleanup
      ws.userId = authResult.userId;
      
      // Send success response
      ws.send(JSON.stringify({
        type: 'auth_response',
        success: true,
        userId: authResult.userId,
        isNewUser: authResult.isNewUser
      }));
      
      // Send initial state if not new user
      if (!authResult.isNewUser) {
        const initialData = await this._getInitialState(authResult.userId, password);
        if (initialData) {
          ws.send(JSON.stringify({
            type: 'initial_state',
            data: initialData
          }));
        }
      }
    } else {
      ws.send(JSON.stringify({
        type: 'auth_response',
        success: false,
        error: authResult.error
      }));
    }
  }

  async _handleSyncAction(ws, syncMsg) {
    if (!ws.userId) {
      ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
      return;
    }
    
    const action = syncMsg.data;
    console.log(`[SYNC] Received ${action.type} from user ${ws.userId}`, action.data?.conversationId || '');
    
    // Apply action to user data and clean up old data
    const applied = await this._applyActionToUserData(ws.userId, action, ws);
    console.log(`[SYNC] Applied ${action.type}:`, applied);
    
    if (applied) {
      // Store action for history/replay
      const stored = await this.storeSyncAction(ws.userId, action);
      console.log(`[SYNC] Stored ${action.type}:`, stored);
      
      if (stored) {
        // Broadcast only the specific action to all authenticated connections for this user (except sender)
        const userConnections = this.authenticatedConnections.get(ws.userId);
        console.log(`[SYNC] Broadcasting ${action.type} to ${userConnections?.size || 0} connections (excluding sender)`);
        
        if (userConnections) {
          const broadcast = JSON.stringify({
            type: 'sync_action',
            data: action
          });
          
          let broadcastCount = 0;
          for (const connection of userConnections) {
            if (connection !== ws && connection.readyState === 1) { // WebSocket.OPEN = 1
              try {
                connection.send(broadcast);
                broadcastCount++;
                console.log(`[SYNC] Broadcast ${action.type} to connection`);
              } catch (error) {
                console.error('[SYNC] Broadcast failed:', error);
                // Connection dead, remove it
                userConnections.delete(connection);
              }
            }
          }
          console.log(`[SYNC] Successfully broadcast ${action.type} to ${broadcastCount} connections`);
        }
        
        // Send acknowledgment
        ws.send(JSON.stringify({
          type: 'sync_ack',
          actionId: `${action.type}_${action.timestamp}`,
          success: true
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'sync_ack',
          actionId: `${action.type}_${action.timestamp}`,
          success: false,
          error: 'Failed to store action'
        }));
      }
    } else {
      ws.send(JSON.stringify({
        type: 'sync_ack',
        actionId: `${action.type}_${action.timestamp}`,
        success: false,
        error: 'Failed to apply action'
      }));
    }
  }

  async _applyActionToUserData(userId, action, ws = null) {
    try {
      // Get current conversations data (unencrypted for sync actions)
      const conversationsData = await this.getUserData(userId, 'conversations') || [];
      const conversations = new Map(conversationsData.map(conv => [conv.id, conv]));
      
      // Additional deduplication check - get fresh data to handle race conditions
      const freshConversationsData = await this.getUserData(userId, 'conversations') || [];
      const freshConversations = new Map(freshConversationsData.map(conv => [conv.id, conv]));
      
      let dataChanged = false;
      
      switch (action.type) {
        case 'create_conversation': {
          const { id, title, messages, modelId, systemPrompt, mode, createdAt, updatedAt } = action.data;
          
          // Check if conversation already exists by UUID (double check with fresh data)
          if (conversations.has(id) || freshConversations.has(id)) {
            console.log(`[SYNC] Conversation ${id} already exists, ignoring create_conversation`);
            return false; // Don't store duplicate action
          }
          
          conversations.set(id, {
            id,
            title,
            messages: messages || [],
            modelId,
            systemPrompt,
            mode,
            createdAt,
            updatedAt
          });
          dataChanged = true;
          break;
        }
        
        case 'create_message': {
          const { conversationId, message } = action.data;
          console.log('Processing create_message for conversation:', conversationId);
          console.log('Available conversations:', Array.from(conversations.keys()));
          
          const conversation = conversations.get(conversationId);
          const freshConversation = freshConversations.get(conversationId);
          
          if (conversation || freshConversation) {
            // Check if message already exists by UUID (check both current and fresh data)
            const existingMessage = conversation?.messages.find(msg => msg.id === message.id) || 
                                  freshConversation?.messages.find(msg => msg.id === message.id);
            
            if (existingMessage) {
              console.log(`[SYNC] Message ${message.id} already exists in conversation ${conversationId}, ignoring create_message`);
              return false; // Don't store duplicate action
            }
            
            console.log('Found conversation, adding message:', message.id);
            const targetConversation = conversation || freshConversation;
            targetConversation.messages.push(message);
            targetConversation.updatedAt = action.timestamp;
            dataChanged = true;
          } else {
            console.error('Conversation not found:', conversationId);
            // Create conversation if it doesn't exist (fallback)
            conversations.set(conversationId, {
              id: conversationId,
              title: 'Untitled Conversation',
              messages: [message],
              createdAt: action.timestamp,
              updatedAt: action.timestamp
            });
            dataChanged = true;
            console.log('Created new conversation as fallback');
          }
          break;
        }
        
        case 'delete_message': {
          const { conversationId, messageId } = action.data;
          const conversation = conversations.get(conversationId);
          if (conversation) {
            conversation.messages = conversation.messages.filter(msg => msg.id !== messageId);
            conversation.updatedAt = action.timestamp;
            dataChanged = true;
          }
          break;
        }
        
        case 'delete_conversation': {
          const { conversationId } = action.data;
          conversations.delete(conversationId);
          dataChanged = true;
          break;
        }
        
        case 'update_title': {
          const { conversationId, title } = action.data;
          const conversation = conversations.get(conversationId);
          if (conversation) {
            conversation.title = title;
            conversation.updatedAt = action.timestamp;
            dataChanged = true;
          }
          break;
        }
        
        case 'update_followup': {
          const { conversationId, messageId, followUps } = action.data;
          const conversation = conversations.get(conversationId);
          if (conversation) {
            const message = conversation.messages.find(msg => msg.id === messageId);
            if (message) {
              message.followUps = followUps;
              conversation.updatedAt = action.timestamp;
              dataChanged = true;
            }
          }
          break;
        }
        
        case 'add_retry': {
          const { conversationId, messageId, newVersion } = action.data;
          const conversation = conversations.get(conversationId);
          if (conversation) {
            const message = conversation.messages.find(msg => msg.id === messageId);
            if (message) {
              if (!message.versions) message.versions = [];
              message.versions.push(newVersion);
              message.currentVersionIndex = (message.currentVersionIndex || 0) + 1;
              conversation.updatedAt = action.timestamp;
              dataChanged = true;
            }
          }
          break;
        }
        
        case 'update_settings': {
          // Merge new settings with existing settings
          const currentSettings = await this.getUserData(userId, 'settings') || {};
          const newSettings = { ...currentSettings, ...action.data.settings };
          // Don't store cloudSync credentials in server storage
          delete newSettings.cloudSync;
          await this.setUserData(userId, 'settings', newSettings);
          dataChanged = true;
          break;
        }
        
        case 'overwrite_data': {
          // Complete data overwrite
          if (action.data.conversations) {
            // Replace all conversations
            const newConversations = new Map();
            for (const conv of action.data.conversations) {
              newConversations.set(conv.id, conv);
            }
            conversations.clear();
            for (const [id, conv] of newConversations) {
              conversations.set(id, conv);
            }
            dataChanged = true;
          }
          break;
        }
        
        default:
          console.error('Unknown action type:', action.type);
          return false;
      }
      
      // Save updated conversations if changed (unencrypted for sync data)
      if (dataChanged) {
        await this.setUserData(userId, 'conversations', Array.from(conversations.values()));
      }
      
      return true;
    } catch (error) {
      const errorMsg = `Apply action error: ${error.message}`;
      console.error(errorMsg);
      console.error('Action details:', JSON.stringify(action, null, 2));
      
      // Send error details back to client
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'error',
          error: errorMsg,
          details: {
            action: action.type,
            message: error.message,
            stack: error.stack
          }
        }));
      }
      
      return false;
    }
  }

  async _handleEraseData(ws, msg) {
    if (!ws.userId) {
      ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
      return;
    }

    try {
      // Delete all user data
      this.ctx.storage.sql.exec("DELETE FROM user_data WHERE user_id = ?", ws.userId);
      
      // Delete all sync actions
      this.ctx.storage.sql.exec("DELETE FROM sync_actions WHERE user_id = ?", ws.userId);
      
      // Notify all connected clients for this user to clear their data
      const userConnections = this.authenticatedConnections.get(ws.userId);
      if (userConnections) {
        const broadcast = JSON.stringify({
          type: 'data_erased',
          userId: ws.userId
        });
        
        for (const connection of userConnections) {
          if (connection.readyState === 1) { // WebSocket.OPEN = 1
            try {
              connection.send(broadcast);
            } catch (error) {
              // Connection dead, remove it
              userConnections.delete(connection);
            }
          }
        }
      }
      
      // Send success response
      ws.send(JSON.stringify({
        type: 'erase_data_response',
        success: true
      }));
      
      console.log(`All data erased for user ${ws.userId}`);
      
    } catch (error) {
      console.error('Erase data error:', error);
      ws.send(JSON.stringify({
        type: 'erase_data_response',
        success: false,
        error: 'Failed to erase data'
      }));
    }
  }

  async _getInitialState(userId, password) {
    try {
      // Clean up old sync actions (keep only last 1000 per user to prevent bloat)
      await this._cleanupOldSyncActions(userId);
      
      // Get all user data
      const rows = [...this.ctx.storage.sql.exec(
        "SELECT key, value FROM user_data WHERE user_id = ?",
        userId
      )];
      
      const state = {};
      for (const row of rows) {
        try {
          const storedData = JSON.parse(row.value);
          
          // Check if data is encrypted
          if (storedData.encrypted && password) {
            state[row.key] = this._decryptData(storedData, password);
          } else {
            // Unencrypted data (like conversations)
            state[row.key] = storedData;
          }
        } catch (error) {
          console.error(`Failed to process data for key ${row.key}:`, error);
        }
      }
      
      return state;
    } catch (error) {
      console.error('Get initial state error:', error);
      return null;
    }
  }

  async _cleanupOldSyncActions(userId) {
    try {
      // Get total count of sync actions for this user
      const countResult = [...this.ctx.storage.sql.exec(
        "SELECT COUNT(*) as count FROM sync_actions WHERE user_id = ?",
        userId
      )][0];
      
      const actionCount = countResult.count;
      
      // Keep only the most recent 1000 actions
      if (actionCount > 1000) {
        const deleteCount = actionCount - 1000;
        
        // Find the timestamp threshold
        const thresholdResult = [...this.ctx.storage.sql.exec(
          "SELECT timestamp FROM sync_actions WHERE user_id = ? ORDER BY timestamp LIMIT 1 OFFSET ?",
          userId, deleteCount
        )][0];
        
        if (thresholdResult) {
          // Delete older actions
          this.ctx.storage.sql.exec(
            "DELETE FROM sync_actions WHERE user_id = ? AND timestamp < ?",
            userId, thresholdResult.timestamp
          );
          
          console.log(`Cleaned up ${deleteCount} old sync actions for user ${userId}`);
        }
      }
    } catch (error) {
      console.error('Cleanup old sync actions error:', error);
    }
  }

  handleWebSocketClose(ws) {
    if (ws.userId && this.authenticatedConnections.has(ws.userId)) {
      const connections = this.authenticatedConnections.get(ws.userId);
      connections.delete(ws);
      
      if (connections.size === 0) {
        this.authenticatedConnections.delete(ws.userId);
      }
    }
  }

  // WebSocket upgrade handler
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    server.addEventListener("message", (event) => {
      this.handleWebSocketMessage(server, event.data);
    });

    server.addEventListener("close", () => {
      this.handleWebSocketClose(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
