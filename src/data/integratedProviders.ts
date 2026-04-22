export interface IntegratedProviderTemplate {
  id: string;
  name: string;
  description?: string;
  baseUrlTemplate: string;
  requireAuth: boolean;
  autoAuth?: string;
  defaultApiFormatId?: string;
  customFields?: Array<{ name: string; id: string; placeholder?: string; blur?: boolean }>;
  defaultModels: Array<{
    id: string;
    name: string;
    contextLength: number;
    supportsImages: boolean;
    supportsStreaming: boolean;
  }>;
}

export const integratedProviders: IntegratedProviderTemplate[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Official OpenAI API',
    baseUrlTemplate: 'https://api.openai.com/v1',
    requireAuth: true,
    defaultModels: [
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000, supportsImages: true, supportsStreaming: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128000, supportsImages: true, supportsStreaming: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextLength: 128000, supportsImages: true, supportsStreaming: true },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextLength: 16385, supportsImages: false, supportsStreaming: true },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models via native Anthropic API',
    baseUrlTemplate: 'https://api.anthropic.com/v1',
    requireAuth: true,
    defaultApiFormatId: 'anthropic',
    defaultModels: [
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', contextLength: 200000, supportsImages: true, supportsStreaming: true },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextLength: 200000, supportsImages: true, supportsStreaming: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000, supportsImages: true, supportsStreaming: true },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextLength: 200000, supportsImages: true, supportsStreaming: true },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local AI models',
    baseUrlTemplate: 'http://localhost:11434/v1',
    requireAuth: false,
    defaultModels: [
      { id: 'llama3.2', name: 'Llama 3.2', contextLength: 128000, supportsImages: false, supportsStreaming: true },
      { id: 'mistral', name: 'Mistral 7B', contextLength: 8192, supportsImages: false, supportsStreaming: true },
    ],
  },
  {
    id: 'pollinations',
    name: 'Pollinations.ai',
    description: 'AI image generation with various models',
    baseUrlTemplate: 'https://gen.pollinations.ai/v1',
    requireAuth: true,
    autoAuth: 'pollinations',
    defaultModels: [
      { id: 'flux', name: 'FLUX.1', contextLength: 8000, supportsImages: true, supportsStreaming: true },
      { id: 'flux-dev', name: 'FLUX.1-dev', contextLength: 8000, supportsImages: true, supportsStreaming: true },
      { id: 'stable-diffusion', name: 'Stable Diffusion', contextLength: 8000, supportsImages: true, supportsStreaming: true },
    ],
  },
  {
    id: '1minrelay',
    name: '1minrelay',
    description: 'Relay service for AI models',
    baseUrlTemplate: 'https://1minrelay.kokodev.cc/{1ak}/v1',
    requireAuth: true,
    customFields: [
      { name: '1minrelay API Key', id: '1ak', placeholder: 'Enter your 1minrelay key', blur: true },
    ],
    defaultModels: [
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000, supportsImages: true, supportsStreaming: true },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Official Mistral API',
    baseUrlTemplate: 'https://api.mistral.ai/v1',
    requireAuth: true,
    defaultModels: [
      { id: 'mistral-large', name: 'Mistral Large', contextLength: 32768, supportsImages: false, supportsStreaming: true },
      { id: 'codestral', name: 'Codestral', contextLength: 32768, supportsImages: false, supportsStreaming: true },
    ],
  },
];
