// Per-conversation streaming content — written by useSendMessage, read by streaming UI components.
// Using a plain Map + subscriber callbacks avoids React re-renders on every token.

type Subscriber = (content: string) => void;

const contentMap = new Map<string, string>();
const subscribers = new Map<string, Set<Subscriber>>();

export const streamingRegistry = {
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
