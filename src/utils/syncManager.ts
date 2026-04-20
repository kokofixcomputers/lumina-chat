import type { 
  SyncActionTypes, 
  SyncWebSocketMessage, 
  AuthRequest, 
  AuthResponse,
  UserCredentials,
  CreateConversationAction,
  CreateMessageAction,
  DeleteMessageAction,
  DeleteConversationAction,
  UpdateTitleAction,
  UpdateFollowupAction,
  AddRetryAction
} from '../types/sync';
import type { Conversation, Message, AppSettings } from '../types';

export interface SyncManagerOptions {
  onSyncAction?: (action: SyncActionTypes) => void;
  onConnectionChange?: (connected: boolean) => void;
  onAuthSuccess?: (userId: string, isNewUser: boolean) => void;
  onAuthError?: (error: string) => void;
  onInitialState?: (data: any) => void;
}

export class SyncManager {
  private ws: WebSocket | null = null;
  private credentials: UserCredentials | null = null;
  private userId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private isDestroyed = false;
  private options: SyncManagerOptions;

  constructor(options: SyncManagerOptions = {}) {
    this.options = options;
  }

  async connect(credentials: UserCredentials): Promise<boolean> {
    if (this.isConnecting || this.isDestroyed) return false;
    
    this.credentials = credentials;
    this.isConnecting = true;

    try {
      await this._connectWebSocket();
      return true;
    } catch (error) {
      console.error('Sync connection failed:', error);
      this.isConnecting = false;
      this.options.onAuthError?.(error instanceof Error ? error.message : 'Connection failed');
      return false;
    }
  }

  disconnect() {
    this.isDestroyed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.options.onConnectionChange?.(false);
  }

  private async _connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this._getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.options.onConnectionChange?.(true);
        
        // Send authentication immediately
        this._authenticate();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.options.onConnectionChange?.(false);
        this._handleReconnect();
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  private _getWebSocketUrl(): string {
    // Hardcode the Workers.dev URL for sync WebSocket
    return 'wss://my-ai-chat.kokofixcomputers.workers.dev/sync-ws';
  }

  private _authenticate() {
    if (!this.ws || !this.credentials) return;

    const authMsg: AuthRequest = {
      type: 'auth',
      username: this.credentials.username,
      password: this.credentials.password
    };

    this.ws.send(JSON.stringify(authMsg));
  }

  private _handleMessage(data: string) {
    try {
      const message: SyncWebSocketMessage = JSON.parse(data);
      
      switch (message.type) {
        case 'auth_response':
          this._handleAuthResponse(message as AuthResponse);
          break;
          
        case 'sync_action':
          if (message.data) {
            this.options.onSyncAction?.(message.data as SyncActionTypes);
          }
          break;
          
        case 'initial_state':
          if (message.data) {
            this.options.onInitialState?.(message.data);
          }
          break;
          
        case 'data_erased':
          console.warn('All cloud data has been erased');
          this.options.onAuthError?.('Cloud data erased - you may need to reconnect');
          break;
          
        case 'erase_data_response':
          if (message.success) {
            console.log('Cloud data erased successfully');
          } else {
            console.error('Failed to erase cloud data:', message.error);
          }
          break;
          
        case 'error':
          console.error('Sync error:', message.error);
          if (message.details) {
            console.error('Error details:', message.details);
          }
          this.options.onAuthError?.(message.error || 'Unknown sync error');
          break;
      }
    } catch (error) {
      console.error('Failed to handle sync message:', error);
    }
  }

  private _handleAuthResponse(response: AuthResponse) {
    if (response.success && response.userId) {
      this.userId = response.userId;
      this.options.onAuthSuccess?.(response.userId, response.isNewUser || false);
    } else {
      this.options.onAuthError?.(response.error || 'Authentication failed');
      this.disconnect();
    }
  }

  private _handleReconnect() {
    if (this.isDestroyed || !this.credentials) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      setTimeout(() => {
        if (!this.isDestroyed && this.credentials) {
          this.connect(this.credentials);
        }
      }, delay);
    } else {
      this.options.onAuthError?.('Max reconnection attempts reached');
    }
  }

  // Action methods
  sendCreateConversation(conversation: Omit<Conversation, 'messages'>) {
    console.log('sendCreateConversation called with:', conversation.id);
    const action: CreateConversationAction = {
      type: 'create_conversation',
      timestamp: Date.now(),
      data: conversation
    };
    this._sendAction(action);
  }

  sendCreateMessage(conversationId: string, message: Message) {
    const action: CreateMessageAction = {
      type: 'create_message',
      timestamp: Date.now(),
      data: {
        conversationId,
        message: {
          id: message.id,
          role: message.role,
          content: message.content,
          images: message.images,
          artifacts: message.artifacts,
          timestamp: message.timestamp,
          model: message.model,
          isError: message.isError,
          finishReason: message.finishReason,
          tool_calls: message.tool_calls,
          tool_call_id: message.tool_call_id,
          tool_name: message.tool_name,
          tool_status: message.tool_status,
          followUps: message.followUps,
          tokens: message.tokens,
          tokensPerSecond: message.tokensPerSecond,
          isStep: message.isStep,
          requestsAnotherTool: message.requestsAnotherTool,
          imageGenerationCall: message.imageGenerationCall
        }
      }
    };
    this._sendAction(action);
  }

  sendDeleteMessage(conversationId: string, messageId: string) {
    const action: DeleteMessageAction = {
      type: 'delete_message',
      timestamp: Date.now(),
      data: { conversationId, messageId }
    };
    this._sendAction(action);
  }

  sendDeleteConversation(conversationId: string) {
    const action: DeleteConversationAction = {
      type: 'delete_conversation',
      timestamp: Date.now(),
      data: { conversationId }
    };
    this._sendAction(action);
  }

  sendUpdateTitle(conversationId: string, title: string) {
    const action: UpdateTitleAction = {
      type: 'update_title',
      timestamp: Date.now(),
      data: { conversationId, title }
    };
    this._sendAction(action);
  }

  sendUpdateFollowup(conversationId: string, messageId: string, followUps: string[]) {
    const action: UpdateFollowupAction = {
      type: 'update_followup',
      timestamp: Date.now(),
      data: { conversationId, messageId, followUps }
    };
    this._sendAction(action);
  }

  sendAddRetry(conversationId: string, messageId: string, newVersion: any) {
    const action: AddRetryAction = {
      type: 'add_retry',
      timestamp: Date.now(),
      data: { conversationId, messageId, newVersion }
    };
    this._sendAction(action);
  }

  sendOverwriteData(data: any) {
    const action: OverwriteDataAction = {
      type: 'overwrite_data',
      timestamp: Date.now(),
      data
    };
    this._sendAction(action);
  }

  private _sendAction(action: SyncActionTypes) {
    console.log('_sendAction called with:', action.type, 'WebSocket ready state:', this.ws?.readyState);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'sync_action',
        data: action
      });
      console.log('Sending WebSocket message:', message);
      this.ws.send(message);
    } else {
      console.warn('Cannot send sync action: WebSocket not connected');
    }
  }

  eraseData(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const messageHandler = (event: MessageEvent) => {
          try {
            const response = JSON.parse(event.data);
            if (response.type === 'erase_data_response') {
              this.ws?.removeEventListener('message', messageHandler);
              resolve(response.success || false);
            }
          } catch (error) {
            console.error('Failed to parse erase data response:', error);
            resolve(false);
          }
        };

        this.ws.addEventListener('message', messageHandler);
        
        // Set timeout
        setTimeout(() => {
          this.ws?.removeEventListener('message', messageHandler);
          resolve(false);
        }, 10000);

        this.ws.send(JSON.stringify({
          type: 'erase_data'
        }));
      } else {
        resolve(false);
      }
    });
  }

  // Utility methods
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.userId !== null;
  }

  getUserId(): string | null {
    return this.userId;
  }

  getCredentials(): UserCredentials | null {
    return this.credentials;
  }
}

// Singleton instance for app-wide usage
let syncManagerInstance: SyncManager | null = null;

export function getSyncManager(options?: SyncManagerOptions): SyncManager {
  if (!syncManagerInstance) {
    syncManagerInstance = new SyncManager(options);
  }
  return syncManagerInstance;
}

export function destroySyncManager() {
  if (syncManagerInstance) {
    syncManagerInstance.disconnect();
    syncManagerInstance = null;
  }
}
