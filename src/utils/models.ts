import { Bot, Sparkles, Zap, Brain, Cpu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ModelInfo {
  displayName: string;
  icon?: LucideIcon | string;
}

// List of OpenAI models that have icons on developers.openai.com
const openaiModels = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-4-32k',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
  'o1',
  'o1-mini',
  'o1-preview',
  'gpt-5',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5.2-pro',
  'gpt-5-pro',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3',
  'o3-mini',
  'o3-pro',
  'o4-mini',
  'o1-pro',
  'gpt-4o-audio-preview',
];

// Custom image URLs for non-OpenAI models
const modelImages: Record<string, string> = {
  'sonar': 'https://asset.1min.ai//resources/model-logos/perplexity_ai.webp',
  'sonar-pro': 'https://asset.1min.ai//resources/model-logos/perplexity_ai.webp',
  'sonar-reasoning-pro': 'https://asset.1min.ai//resources/model-logos/perplexity_ai.webp',
  'sonar-deep-research': 'https://asset.1min.ai//resources/model-logos/perplexity_ai.webp',
};

// Cache for 1min.ai API model logos
let modelLogosCache: Record<string, string> = {};
let isFetching = false;

// Initialize cache on module load
fetch('https://api.1min.ai/models?feature=UNIFY_CHAT_WITH_AI')
  .then(res => res.json())
  .then(data => {
    data.models?.forEach((model: any) => {
      if (model.modelId && model.logoUrl) {
        modelLogosCache[model.modelId] = `https://asset.1min.ai/${model.logoUrl}`;
      }
    });
  })
  .catch(() => {});


function formatModelName(modelId: string): string {
  return modelId
    .split(/[-_]/)
    .map(part => {
      // Handle special cases
      if (part.toLowerCase() === 'gpt') return 'GPT';
      if (part.match(/^\d+$/)) return part; // Keep numbers as-is
      // Capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export function getModelInfo(modelId: string): ModelInfo {
  const displayName = formatModelName(modelId);
  
  // Check custom image URLs first
  if (modelImages[modelId]) {
    return {
      displayName,
      icon: modelImages[modelId],
    };
  }
  
  // Check if it's a known OpenAI model or contains "gpt"
  if (openaiModels.includes(modelId) || modelId.toLowerCase().includes('gpt')) {
    return {
      displayName,
      icon: `https://developers.openai.com/images/api/models/icons/${modelId}.png`,
    };
  }
  
  // Check cache for 1min.ai logos
  if (modelLogosCache[modelId]) {
    return {
      displayName,
      icon: modelLogosCache[modelId],
    };
  }
  
  // Fallback icons for other providers
  if (modelId.includes('claude')) return { displayName, icon: Brain };
  if (modelId.includes('llama')) return { displayName, icon: Cpu };
  if (modelId.includes('mistral')) return { displayName, icon: Cpu };
  if (modelId.includes('gemini')) return { displayName, icon: Sparkles };
  
  // Default fallback
  return { displayName, icon: Bot };
}
