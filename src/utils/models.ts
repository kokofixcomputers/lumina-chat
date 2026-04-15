import type { LucideIcon } from 'lucide-react';

export interface ModelCapabilities {
  text_input: boolean;
  text_output: boolean;
  image_input: boolean;
  image_output: boolean;
  audio_input: boolean;
  audio_output: boolean;
  video_input: boolean;
  video_output: boolean;
  embeddings: boolean;
  moderation: boolean;
  realtime: boolean;
  deep_research: boolean;
  reasoning: boolean;
}

export interface ModelInfo {
  displayName: string;
  icon?: LucideIcon | string;
  capabilities?: ModelCapabilities;
}

// ---------------------------------------------------------------------------
// Icon metadata cache
// ---------------------------------------------------------------------------

const ICON_BASE_URL = 'https://website-files.github.io/ai-model-icons';
const METADATA_URL = `${ICON_BASE_URL}/generated_metadata.json`;

let availableIconsCache: Set<string> | null = null;
let metadataPromise: Promise<Set<string>> | null = null;

async function loadIconMetadata(): Promise<Set<string>> {
  if (availableIconsCache !== null) return availableIconsCache;
  if (metadataPromise) return metadataPromise;

  metadataPromise = fetch(METADATA_URL)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ files: string[] }>;
    })
    .then(({ files }) => {
      availableIconsCache = new Set(files.map(f => f.replace(/\.png$/, '')));
      return availableIconsCache;
    })
    .catch(err => {
      console.warn('[model-icons] Failed to load metadata, icons disabled:', err);
      availableIconsCache = new Set();
      return availableIconsCache;
    });

  return metadataPromise;
}

/**
 * Call once at app startup (e.g. main.ts / layout.tsx) to pre-warm the cache.
 */
export function warmModelIconCache(): Promise<void> {
  return loadIconMetadata().then(() => undefined);
}

function hasIcon(modelId: string): boolean {
  return availableIconsCache?.has(modelId) ?? false;
}

// ---------------------------------------------------------------------------
// Model capabilities
// ---------------------------------------------------------------------------

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'claude-haiku-4-5-20251001':       { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-opus-4-1-20250805':        { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-opus-4-20250514':          { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-opus-4-5-20251101':        { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-sonnet-4-20250514':        { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-sonnet-4-5-20250929':      { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-sonnet-4.6':               { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'claude-opus-4.6':                 { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'command-r-08-2024':               { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'deepseek-chat':                   { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'deepseek-reasoner':               { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gemini-2.5-flash':                { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gemini-2.5-pro':                  { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gemini-3-flash-preview':          { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gemini-3.1-pro-preview':          { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gemini-3.1-pro':                  { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // OpenAI GPT
  'gpt-3.5-turbo':                   { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4-turbo':                     { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4.1':                         { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4.1-mini':                    { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4.1-nano':                    { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4o':                          { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4o-mini':                     { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5':                           { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5-chat-latest':               { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5-mini':                      { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5-nano':                      { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5.1':                         { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5.1-codex':                   { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5.1-codex-mini':              { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5.1-codex-max':               { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },
  'gpt-5.2':                         { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5.2-pro':                     { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-5.2-codex':                   { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },
  'gpt-5.3-codex':                   { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },
  'gpt-5.4':                         { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },
  'gpt-5.4-pro':                     { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },

  // OpenAI o-series
  'o3':                              { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'o3-deep-research':                { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: true,  reasoning: false },
  'o3-mini':                         { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'o3-pro':                          { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'o4-mini':                         { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'o4-mini-deep-research':           { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: true,  reasoning: false },

  // OpenAI audio
  'gpt-audio':                       { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-audio-1.5':                   { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-audio-mini':                  { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4o-audio':                    { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4o-mini-audio':               { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // OpenAI realtime
  'gpt-realtime':                    { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: true,  deep_research: false, reasoning: false },
  'gpt-realtime-1.5':                { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: true,  deep_research: false, reasoning: false },
  'gpt-realtime-mini':               { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: true,  deep_research: false, reasoning: false },
  'gpt-4o-realtime':                 { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: true,  deep_research: false, reasoning: false },
  'gpt-4o-mini-realtime':            { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: true,  deep_research: false, reasoning: false },

  // OpenAI transcribe / TTS
  'gpt-4o-transcribe':               { text_input: false, text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4o-mini-transcribe':          { text_input: false, text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-4o-mini-tts':                 { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'tts-1':                           { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'tts-1-hd':                        { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: true,  video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'whisper-1':                       { text_input: false, text_output: true,  image_input: false, image_output: false, audio_input: true,  audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // OpenAI image generation
  'gpt-image-1':                     { text_input: true,  text_output: false, image_input: true,  image_output: true,  audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-image-1-mini':                { text_input: true,  text_output: false, image_input: true,  image_output: true,  audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'gpt-image-1.5':                   { text_input: true,  text_output: false, image_input: true,  image_output: true,  audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Sora video
  'sora-2':                          { text_input: true,  text_output: false, image_input: true,  image_output: false, audio_input: false, audio_output: true,  video_input: false, video_output: true,  embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'sora-2-pro':                      { text_input: true,  text_output: false, image_input: true,  image_output: false, audio_input: false, audio_output: true,  video_input: false, video_output: true,  embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Embeddings
  'text-embedding-3-large':          { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: true,  moderation: false, realtime: false, deep_research: false, reasoning: false },
  'text-embedding-3-small':          { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: true,  moderation: false, realtime: false, deep_research: false, reasoning: false },
  'text-embedding-ada-002':          { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: true,  moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Moderation
  'text-moderation':                 { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: true,  realtime: false, deep_research: false, reasoning: false },
  'text-moderation-stable':          { text_input: true,  text_output: false, image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: true,  realtime: false, deep_research: false, reasoning: false },
  'omni-moderation-latest':          { text_input: true,  text_output: false, image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: true,  realtime: false, deep_research: false, reasoning: false },

  // OpenAI OSS
  'openai/gpt-oss-120b':             { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'openai/gpt-oss-20b':              { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // xAI Grok
  'grok-3':                          { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'grok-3-mini':                     { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'grok-4-0709':                     { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'grok-4-fast-non-reasoning':       { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'grok-4-fast-reasoning':           { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },
  'grok-4.20':                       { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Mistral
  'magistral-medium-latest':         { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'magistral-small-latest':          { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'ministral-14b-latest':            { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'mistral-large-latest':            { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'mistral-medium-latest':           { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'mistral-small-latest':            { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'open-mistral-nemo':               { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Meta Llama
  'meta/llama-2-70b-chat':           { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'meta/llama-4-maverick-instruct':  { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'meta/llama-4-scout-instruct':     { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'meta/meta-llama-3-70b-instruct':  { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'meta/meta-llama-3.1-405b-instruct': { text_input: true, text_output: true, image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Alibaba Qwen
  'qwen-flash':                      { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen-max':                        { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen-plus':                       { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen-vl-max':                     { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen-vl-plus':                    { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen3-max':                       { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen3-vl-flash':                  { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen3-vl-plus':                   { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'qwen-3.5':                        { text_input: true,  text_output: true,  image_input: true,  image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },

  // Perplexity Sonar
  'sonar':                           { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'sonar-deep-research':             { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: true,  reasoning: false },
  'sonar-pro':                       { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: false },
  'sonar-reasoning-pro':             { text_input: true,  text_output: true,  image_input: false, image_output: false, audio_input: false, audio_output: false, video_input: false, video_output: false, embeddings: false, moderation: false, realtime: false, deep_research: false, reasoning: true  },
};

// ---------------------------------------------------------------------------
// Display name formatter
// ---------------------------------------------------------------------------

function formatModelName(modelId: string): string {
  return modelId
    .split(/[-_]/)
    .map(part => {
      if (part.toLowerCase() === 'gpt') return 'GPT';
      if (part.match(/^\d+$/)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronous. Returns icon only if the metadata cache is already warm.
 * Call warmModelIconCache() at app startup for best results.
 */
export function getModelInfo(modelId: string): ModelInfo {
  return {
    displayName: formatModelName(modelId),
    icon: hasIcon(modelId) ? `${ICON_BASE_URL}/${modelId}.png` : undefined,
    capabilities: MODEL_CAPABILITIES[modelId],
  };
}

/**
 * Async. Guaranteed to resolve the icon even on the very first call,
 * without needing warmModelIconCache() first.
 */
export async function getModelInfoAsync(modelId: string): Promise<ModelInfo> {
  const icons = await loadIconMetadata();
  return {
    displayName: formatModelName(modelId),
    icon: icons.has(modelId) ? `${ICON_BASE_URL}/${modelId}.png` : undefined,
    capabilities: MODEL_CAPABILITIES[modelId],
  };
}