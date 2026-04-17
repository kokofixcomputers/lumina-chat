import { defineTool } from '../types/tools';

function getMemories(): string[] {
  try {
    const s = localStorage.getItem('lumina_settings');
    if (!s) return [];
    const settings = JSON.parse(s);
    return Array.isArray(settings.memories) ? settings.memories : [];
  } catch { return []; }
}

function saveMemory(fact: string) {
  try {
    const s = localStorage.getItem('lumina_settings');
    const settings = s ? JSON.parse(s) : {};
    const memories: string[] = Array.isArray(settings.memories) ? settings.memories : [];
    if (!memories.includes(fact)) {
      memories.push(fact);
      settings.memories = memories;
      localStorage.setItem('lumina_settings', JSON.stringify(settings));
    }
  } catch { /* ignore */ }
}

function deleteMemory(index: number) {
  try {
    const s = localStorage.getItem('lumina_settings');
    const settings = s ? JSON.parse(s) : {};
    const memories: string[] = Array.isArray(settings.memories) ? settings.memories : [];
    memories.splice(index, 1);
    settings.memories = memories;
    localStorage.setItem('lumina_settings', JSON.stringify(settings));
  } catch { /* ignore */ }
}

export const memoryGetTool = defineTool(
  'memory_get',
  'Retrieve all stored memories about the user. Call this at the start of conversations to recall preferences, facts, and context about the user.',
  { type: 'object', properties: {}, required: [] },
  async () => {
    const memories = getMemories();
    return { memories, count: memories.length };
  }
);

export const memorySaveTool = defineTool(
  'memory_save',
  'Save an important fact or preference about the user to persistent memory. Use this for: timezone/location, preferred coding languages, name, job, recurring preferences, or any fact that would be useful in future conversations.',
  {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description: 'A concise fact to remember, e.g. "User prefers TypeScript over JavaScript" or "User lives in Vancouver, BC (timezone: America/Vancouver)"',
      },
    },
    required: ['fact'],
  },
  async (args: { fact: string }) => {
    saveMemory(args.fact.trim());
    return { success: true, saved: args.fact.trim() };
  }
);

export const memoryDeleteTool = defineTool(
  'memory_delete',
  'Delete a memory by its index (0-based). Use memory_get first to see current memories and their indices.',
  {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Zero-based index of the memory to delete' },
    },
    required: ['index'],
  },
  async (args: { index: number }) => {
    const before = getMemories();
    if (args.index < 0 || args.index >= before.length) {
      return { success: false, error: `Index ${args.index} out of range (${before.length} memories)` };
    }
    deleteMemory(args.index);
    return { success: true, deleted: before[args.index] };
  }
);

export const memoryTools = [memoryGetTool, memorySaveTool, memoryDeleteTool];
