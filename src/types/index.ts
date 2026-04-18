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
  hotelSearchKey?: string;
  buildMode?: boolean;
  shareInfo?: {
    code: string;
    expiresAt: string;
    createdAt: string;
  };
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
  useProxy?: boolean;
  proxyMode?: 'auto' | 'on' | 'off'; // 'auto' = app decides, 'on' = always proxy, 'off' = never proxy
  apiFormatId?: string; // references ProviderApiFormat.id, defaults to 'openai'
  directUrl?: boolean;  // if true, baseUrl is the exact endpoint — no path appending
}

export interface ProviderApiFormat {
  id: string;
  name: string;
  // Auth
  authHeader: string;         // e.g. "Authorization"
  authPrefix: string;         // e.g. "Bearer "
  // Model placement
  modelIn: 'body' | 'url' | 'header'; // where to put the model id
  modelKey: string;           // body key or url placeholder or header name
  // Endpoints
  chatPath: string;           // e.g. "/chat/completions"
  modelsPath: string;         // e.g. "/models" — empty = no model fetching
  // Extra static headers / body fields (JSON strings)
  extraHeaders: string;       // JSON object string
  extraBody: string;          // JSON object string
  // Custom request/response templates (optional — if set, overrides extraBody logic)
  // Built-in variables: {{messages}}, {{model}}, {{apiKey}}, {{stream}},
  //                     {{temperature}}, {{maxTokens}}, {{topP}}
  // Custom variables defined in customVars below.
  requestBodyTemplate?: string;         // JSON template string, non-streaming
  streamingRequestBodyTemplate?: string;// JSON template string, streaming
  responseTextPath?: string;            // dot-path to assistant text, e.g. "choices.0.message.content"
  streamingChunkPath?: string;          // dot-path to delta text per SSE chunk, e.g. "choices.0.delta.content"
  streamingDoneSentinel?: string;       // SSE data value that signals end, default "[DONE]"
  customVars?: Record<string, string>;  // user-defined static variable values
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
  sttModel?: string;
  sttBaseUrl?: string;
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
  disabledTools?: string[];
  apiFormats?: ProviderApiFormat[];
  memoriesEnabled?: boolean;
  memories?: string[]; // each entry is a plain-text memory fact
  localAgent?: {
    enabled: boolean;
    port: string;
    protocol: 'ws' | 'wss';
  };
}

export type Panel = 'chat' | 'settings' | 'share' | 'providers';
