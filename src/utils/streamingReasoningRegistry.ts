// Per-conversation streaming reasoning content — written by useSendMessage, read by streaming UI components.
// Mirrors streamingRegistry.ts but tracks the model's reasoning/thinking trace separately from the reply text.

type Subscriber = (content: string) => void;

const contentMap = new Map<string, string>();
const subscribers = new Map<string, Set<Subscriber>>();

export const streamingReasoningRegistry = {
  set(convId: string, content: string) {
    contentMap.set(convId, content);
    subscribers.get(convId)?.forEach(fn => fn(content));
  },

  get(convId: string): string {
    return contentMap.get(convId) ?? '';
  },

  clear(convId: string) {
    contentMap.delete(convId);
    subscribers.get(convId)?.forEach(fn => fn(''));
    subscribers.delete(convId);
  },

  subscribe(convId: string, fn: Subscriber): () => void {
    if (!subscribers.has(convId)) subscribers.set(convId, new Set());
    subscribers.get(convId)!.add(fn);
    return () => subscribers.get(convId)?.delete(fn);
  },
};
