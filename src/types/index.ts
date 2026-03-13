export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[]; // base64
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
  imageGenerationCall?: any; // Store image_generation_call for follow-up edits
  versions?: Message[]; // Store previous versions when retrying
  currentVersionIndex?: number; // Track which version is currently displayed
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
  devEnvSession?: string;
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
  responsesApiUnsupported?: boolean;
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
  useResponsesApi?: boolean;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
}

export interface Workflow {
  id: string;
  slug: string;
  prompt: string;
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
  serperApiKey?: string;
  scrapingBeeApiKey?: string;
  workflows?: Workflow[];
  cloudSync?: {
    enabled: boolean;
    email: string;
    password: string;
  };
  devEnv?: {
    address?: string;
    apiKey?: string;
    tools?: {
      createDevEnv?: boolean;
      commandDevEnv?: boolean;
      artifactDevEnv?: boolean;
    };
  };
}

export type Panel = 'chat' | 'settings' | 'providers';
