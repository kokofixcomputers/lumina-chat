export interface SyncAction {
  type: 'create_conversation' | 'create_message' | 'delete_message' | 'delete_conversation' | 'update_title' | 'update_followup' | 'add_retry' | 'overwrite_data';
  timestamp: number;
  data: any;
}

export interface CreateConversationAction extends SyncAction {
  type: 'create_conversation';
  data: {
    id: string;
    title: string;
    modelId: string;
    systemPrompt?: string;
    mode?: 'chat' | 'image';
    createdAt: number;
    updatedAt: number;
  };
}

export interface CreateMessageAction extends SyncAction {
  type: 'create_message';
  data: {
    conversationId: string;
    message: {
      id: string;
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      images?: string[];
      artifacts?: Array<{
        url: string;
        direct_download: string;
        original_path: string;
        file_hash: string;
        message: string;
      }>;
      timestamp: number;
      model?: string;
      isError?: boolean;
      finishReason?: 'stop' | 'length' | 'max_tokens' | 'error' | 'function_call' | 'tool_calls' | 'stopped';
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
      tool_name?: string;
      tool_status?: 'loading' | 'success' | 'error';
      followUps?: string[];
      tokens?: number;
      tokensPerSecond?: number;
      isStep?: boolean;
      requestsAnotherTool?: boolean;
      imageGenerationCall?: any;
    };
  };
}

export interface DeleteMessageAction extends SyncAction {
  type: 'delete_message';
  data: {
    conversationId: string;
    messageId: string;
  };
}

export interface DeleteConversationAction extends SyncAction {
  type: 'delete_conversation';
  data: {
    conversationId: string;
  };
}

export interface UpdateTitleAction extends SyncAction {
  type: 'update_title';
  data: {
    conversationId: string;
    title: string;
  };
}

export interface UpdateFollowupAction extends SyncAction {
  type: 'update_followup';
  data: {
    conversationId: string;
    messageId: string;
    followUps: string[];
  };
}

export interface AddRetryAction extends SyncAction {
  type: 'add_retry';
  data: {
    conversationId: string;
    messageId: string;
    newVersion: any;
  };
}

export interface OverwriteDataAction extends SyncAction {
  type: 'overwrite_data';
  data: any;
}

export type SyncActionTypes = 
  | CreateConversationAction
  | CreateMessageAction
  | DeleteMessageAction
  | DeleteConversationAction
  | UpdateTitleAction
  | UpdateFollowupAction
  | AddRetryAction
  | OverwriteDataAction;

export interface AuthRequest {
  type: 'auth';
  username: string;
  password: string;
}

export interface AuthResponse {
  type: 'auth_response';
  success: boolean;
  userId?: string;
  isNewUser?: boolean;
  error?: string;
}

export interface SyncWebSocketMessage {
  type: 'auth' | 'auth_response' | 'sync_action' | 'sync_ack' | 'error' | 'initial_state' | 'data_erased' | 'erase_data_response';
  data?: any;
  error?: string;
  success?: boolean;
  userId?: string;
}

export interface SyncState {
  conversations: Record<string, any>;
  lastSyncTimestamp: number;
  userId: string;
}

export interface UserCredentials {
  username: string;
  password: string;
}
