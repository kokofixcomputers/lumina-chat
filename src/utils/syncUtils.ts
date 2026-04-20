import type { Conversation } from '../types';

/**
 * Simple merge function for conversations that prevents data loss
 * when multiple clients are active simultaneously
 */
export function mergeConversationsSafely(local: Conversation[], remote: Conversation[]): Conversation[] {
  const merged = new Map<string, Conversation>();
  
  // Add all local conversations
  if (local) {
    local.forEach(conv => merged.set(conv.id, conv));
  }
  
  // Add/overwrite with remote conversations (newer versions)
  if (remote) {
    remote.forEach(conv => {
      const existing = merged.get(conv.id);
      if (!existing || conv.updatedAt > existing.updatedAt) {
        merged.set(conv.id, conv);
      }
    });
  }
  
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
