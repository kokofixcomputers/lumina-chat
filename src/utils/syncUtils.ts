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
        if (!existingMsg) {
          // New message - add it
          messageMap.set(msg.id, msg);
        } else if (msg.timestamp > existingMsg.timestamp) {
          // Newer version of message - replace
          messageMap.set(msg.id, msg);
        } else if (msg.timestamp === existingMsg.timestamp && msg.id !== existingMsg.id) {
          // Same timestamp but different IDs - these are different messages added simultaneously
          // Keep both by using the different ID as the key
          messageMap.set(msg.id, msg);
        }
        // If timestamps are equal and same ID, keep existing (avoid conflicts)
      });
      
      // Update with merged messages
      existing.messages = Array.from(messageMap.values())
        .sort((a, b) => {
          if (a.timestamp !== b.timestamp) {
            return a.timestamp - b.timestamp;
          }
          // If timestamps are equal, sort by ID to ensure consistent ordering
          return a.id.localeCompare(b.id);
        });
    }
  }
  
  return Array.from(merged.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
