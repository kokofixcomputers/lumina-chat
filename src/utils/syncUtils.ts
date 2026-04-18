import type { Conversation } from '../types';

/**
 * Simple merge function for conversations that prevents data loss
 * when multiple clients are active simultaneously
 */
export function mergeConversationsSafely(local: Conversation[], remote: Conversation[]): Conversation[] {
  const merged = new Map<string, Conversation>();
  
  // Add all conversations with their latest versions
  const allConvs = [...local, ...remote];
  
  for (const conv of allConvs) {
    const existing = merged.get(conv.id);
    
    if (!existing || conv.updatedAt > existing.updatedAt) {
      // Keep the newer version
      merged.set(conv.id, { ...conv });
    } else if (conv.updatedAt === existing.updatedAt) {
      // Same timestamp - merge messages to avoid data loss
      const messageMap = new Map();
      
      // Add existing messages
      existing.messages.forEach(msg => messageMap.set(msg.id, msg));
      
      // Add newer messages from remote
      conv.messages.forEach(msg => {
        const existingMsg = messageMap.get(msg.id);
        if (!existingMsg || msg.timestamp > existingMsg.timestamp) {
          messageMap.set(msg.id, msg);
        }
      });
      
      // Update with merged messages
      existing.messages = Array.from(messageMap.values())
        .sort((a, b) => a.timestamp - b.timestamp);
    }
  }
  
  return Array.from(merged.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
