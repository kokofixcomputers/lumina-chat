export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[]; // base64
  timestamp: number;
  model?: string;
  isError?: boolean;
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
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  modelId: string;
  systemPrompt?: string;
  mode?: 'chat' | 'image';
  attachments?: string[];
}

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  enabled: boolean;
  isIntegrated?: boolean;
  customFieldValues?: Record<string, string>;
}

export interface ModelConfig {
  id: string;
  name: string;
  contextLength?: number;
  supportsImages?: boolean;
  supportsStreaming?: boolean;
}

export interface ModelSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt: string;
  stream: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  providers: ModelProvider[];
  defaultModelId: string;
  defaultProviderModelId: string; // "providerId/modelId"
  modelSettings: ModelSettings;
  prettifyModelNames?: boolean;
  maxHistory?: number;
  generateTitle?: boolean;
  generateFollowUps?: boolean;
  allowImageGeneration?: boolean;
  imageGenerationModel?: string;
  cloudSync?: {
    enabled: boolean;
    email: string;
    password: string;
  };
}

export type Panel = 'chat' | 'settings' | 'providers';
