import type { AppSettings } from '../../types';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  providers: [],
  defaultModelId: 'gpt-4o',
  defaultProviderModelId: 'openai/gpt-4o',
  modelSettings: {
    temperature: 1.0,
    maxTokens: 2048,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: `You are a concise assistant with tool access.
After using a tool, if another is needed, add:
{"status": "request_another_tool"}
While using tools, please tell the user what you are doing by adding {"status": "step"} on the same line as {"status": "request_another_tool"} Keep these messages brief, 2-8 words Example: "Installing Node.js." {"status": "step"} {"status": "request_another_tool"}`,
    stream: true,
  },
};

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

export function saveToStorage(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      localStorage.setItem(key, serialized);
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'QuotaExceededError' && key === 'lumina_conversations') {
        try {
          const convs: any[] = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
          if (convs.length === 0) break;
          convs.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
          convs.shift();
          localStorage.setItem('lumina_conversations', JSON.stringify(convs));
        } catch { break; }
      } else {
        console.error('Failed to save to localStorage:', err);
        break;
      }
    }
  }
}
