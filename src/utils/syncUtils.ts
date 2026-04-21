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
        // Merge messages to avoid duplicates by UUID
        const mergedMessages = mergeMessagesSafely(
          existing?.messages || [], 
          conv.messages || []
        );
        
        merged.set(conv.id, {
          ...conv,
          messages: mergedMessages
        });
      } else {
        // Remote is older, but might have newer messages - merge them in
        const mergedMessages = mergeMessagesSafely(
          existing.messages || [], 
          conv.messages || []
        );
        
        merged.set(conv.id, {
          ...existing,
          messages: mergedMessages
        });
      }
    });
  }
  
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Merge messages safely, avoiding duplicates by UUID
 */
function mergeMessagesSafely(localMessages: any[], remoteMessages: any[]): any[] {
  const mergedMessages = new Map<string, any>();
  
  // Add all local messages
  localMessages.forEach(msg => {
    mergedMessages.set(msg.id, msg);
  });
  
  // Add remote messages, but don't overwrite existing ones by UUID
  remoteMessages.forEach(msg => {
    if (!mergedMessages.has(msg.id)) {
      mergedMessages.set(msg.id, msg);
    }
  });
  
  // Convert back to array and sort by timestamp
  return Array.from(mergedMessages.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}
