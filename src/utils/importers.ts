import { unzipSync, strFromU8 } from 'fflate';
import type { AppSettings, Conversation } from '../types';

export type ImportSourceId = 'lumina' | 'typingmind' | 'auto';

export interface ImportSource {
  id: ImportSourceId;
  label: string;
  description: string;
  accept: string;
  beta?: boolean;
}

export interface ImportPayload {
  settings?: AppSettings;
  conversations?: Conversation[];
  extensions?: Record<string, any>;
}

export const importSources: ImportSource[] = [
  {
    id: 'lumina',
    label: 'Lumina',
    description: 'Import a Lumina export (.json).',
    accept: '.json',
  },
  {
    id: 'typingmind',
    label: 'Typingmind',
    description: 'Import a Typingmind export (.zip).',
    accept: '.zip',
  },
  {
    id: 'auto',
    label: 'Auto detect',
    description: 'Detect file format automatically (beta).',
    accept: '.json,.zip',
    beta: true,
  },
];

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function parseJSON<T = any>(text: string): T {
  return JSON.parse(text);
}

function resolveTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeMessage(raw: any): any {
  const rawRole = String(raw.role || raw.speaker || raw.type || '').toLowerCase();
  const content = raw.content ?? raw.text ?? raw.body ?? raw.message ?? '';
  const id = raw.id || raw.messageId || raw.uuid || `msg-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const role = rawRole === 'assistant' || rawRole === 'ai' || rawRole === 'bot'
    ? 'assistant'
    : rawRole === 'system'
    ? 'system'
    : 'user';
  const images = Array.isArray(raw.images)
    ? raw.images.map(String)
    : Array.isArray(raw.attachments)
      ? raw.attachments.map(String)
      : undefined;

  return {
    id,
    role,
    content: String(content ?? ''),
    timestamp: resolveTimestamp(raw.timestamp ?? raw.createdAt ?? raw.created_at ?? raw.time),
    images,
  };
}

function normalizeConversation(raw: any): Conversation {
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(normalizeMessage)
    : Array.isArray(raw.chat)
      ? raw.chat.map(normalizeMessage)
      : Array.isArray(raw.events)
        ? raw.events.map(normalizeMessage)
        : [];

  const createdAt = resolveTimestamp(raw.createdAt ?? raw.created_at ?? raw.timestamp ?? messages[0]?.timestamp);
  const updatedAt = resolveTimestamp(raw.updatedAt ?? raw.updated_at ?? raw.timestamp ?? messages[messages.length - 1]?.timestamp ?? createdAt);

  return {
    id: raw.id || raw.uuid || `typingmind-${createdAt}-${Math.random().toString(36).slice(2)}`,
    title: String(raw.title || raw.name || raw.subject || 'Imported conversation'),
    messages,
    createdAt,
    updatedAt,
    modelId: 'openai',
    mode: 'chat',
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(String) : undefined,
    systemPrompt: String(raw.systemPrompt || raw.prompt || raw.context || ''),
  };
}

function isMessageLike(value: any): boolean {
  return value && typeof value === 'object' && (Array.isArray(value.messages) || Array.isArray(value.chat) || typeof value.content === 'string');
}

function normalizeTypingmindData(raw: any): Conversation[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeConversation);
  }

  const items = raw.conversations ?? raw.threads ?? raw.threadsList ?? raw.data ?? raw.items ?? raw;
  if (Array.isArray(items)) {
    return items.map(normalizeConversation);
  }

  if (items && typeof items === 'object') {
    if (items.conversations && !Array.isArray(items.conversations)) {
      return Object.values(items.conversations).map(normalizeConversation);
    }

    if (items.threads && !Array.isArray(items.threads)) {
      return Object.values(items.threads).map(normalizeConversation);
    }

    if (items.data && !Array.isArray(items.data) && Object.values(items.data).every((value) => isMessageLike(value) || Array.isArray(value))) {
      return Object.values(items.data).flatMap((value) => Array.isArray(value) ? value.map(normalizeConversation) : normalizeConversation(value));
    }

    const values = Object.values(items);
    const conversationValues = values.filter((value) => isMessageLike(value) || Array.isArray(value));
    if (conversationValues.length > 0 && conversationValues.length <= 10) {
      return conversationValues.flatMap((value) =>
        Array.isArray(value)
          ? value.map(normalizeConversation)
          : normalizeConversation(value)
      );
    }
  }

  if (raw.messages || raw.chat || raw.events) {
    return [normalizeConversation(raw)];
  }

  throw new Error('Typingmind export format not recognized.');
}

function isLuminaExport(value: any): boolean {
  return value && (value.settings || value.conversations || value.extensions);
}

function isTypingmindExport(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.every(item => !!item.messages || !!item.chat || !!item.conversations || !!item.title || !!item.text);
  if (value.messages || value.chat || value.events) return true;
  if (value.conversations || value.threads || value.threadsList || value.data || value.items) return true;
  return false;
}

export async function importLuminaFile(file: File): Promise<ImportPayload> {
  const rawText = await readFileAsText(file);
  const parsed = parseJSON<any>(rawText);
  if (parsed && typeof parsed === 'object') {
    return {
      settings: parsed.settings,
      conversations: parsed.conversations,
      extensions: parsed.extensions,
    };
  }

  throw new Error('Lumina JSON file could not be parsed.');
}

export async function importTypingmindFile(file: File): Promise<ImportPayload> {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const entries = unzipSync(new Uint8Array(arrayBuffer));
  const jsonEntryName = Object.keys(entries).find((name) => name.toLowerCase().endsWith('data.json') || name.toLowerCase().endsWith('.json'));

  if (!jsonEntryName) {
    throw new Error('Typingmind ZIP archive does not contain a JSON export.');
  }

  const jsonText = strFromU8(entries[jsonEntryName]);
  const parsed = parseJSON<any>(jsonText);
  const conversations = normalizeTypingmindData(parsed);
  return { conversations };
}

export async function detectImportSource(file: File): Promise<ImportSourceId> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.zip') || file.type === 'application/zip') {
    return 'typingmind';
  }

  const text = await readFileAsText(file);
  try {
    const parsed = parseJSON<any>(text);
    if (isLuminaExport(parsed)) return 'lumina';
    if (isTypingmindExport(parsed)) return 'typingmind';
  } catch {
    // ignore invalid JSON
  }

  return 'lumina';
}

export async function importChatFile(file: File, source: ImportSourceId): Promise<ImportPayload> {
  if (source === 'auto') {
    const detected = await detectImportSource(file);
    if (detected === 'typingmind') {
      return importTypingmindFile(file);
    }
    return importLuminaFile(file);
  }

  if (source === 'typingmind') {
    return importTypingmindFile(file);
  }

  return importLuminaFile(file);
}
