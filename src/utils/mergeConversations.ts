import type { Conversation } from '../types';

/**
 * Merge conversations from two clients intelligently
 * - Keep newer versions of conversations
 * - Merge messages within the same conversation
 * - Preserve unique conversations from both sides
 */
export function mergeConversations(local: Conversation[], remote: Conversation[]): Conversation[] {
  const mergedMap = new Map<string, Conversation>();
  
  // Add all local conversations first
  for (const conv of local) {
    mergedMap.set(conv.id, { ...conv });
  }
  
  // Merge remote conversations
  for (const remoteConv of remote) {
    const existing = mergedMap.get(remoteConv.id);
    
    if (!existing) {
      // New conversation from remote - add it
      mergedMap.set(remoteConv.id, { ...remoteConv });
    } else {
      // Existing conversation - merge intelligently
      const merged: Conversation = {
        ...existing,
        // Use the most recently updated version as base
        ...(remoteConv.updatedAt > existing.updatedAt ? remoteConv : existing),
      };
      
      // Merge messages by timestamp (keep newer messages)
      const messageMap = new Map<string, typeof existing.messages[0]>();
      
      // Add all local messages
      for (const msg of existing.messages) {
        messageMap.set(msg.id, { ...msg });
      }
      
      // Add/merge remote messages
      for (const remoteMsg of remoteConv.messages) {
        const existingMsg = messageMap.get(remoteMsg.id);
        if (!existingMsg) {
          // New message - add it
          messageMap.set(remoteMsg.id, { ...remoteMsg });
        } else if (remoteMsg.timestamp > existingMsg.timestamp) {
          // Newer version of message - replace
          messageMap.set(remoteMsg.id, { ...remoteMsg });
        }
        // If timestamps are equal, keep existing (avoid conflicts)
      }
      
      // Sort messages by timestamp
      merged.messages = Array.from(messageMap.values())
        .sort((a, b) => a.timestamp - b.timestamp);
      
      // Update metadata
      merged.updatedAt = Math.max(existing.updatedAt, remoteConv.updatedAt);
      
      mergedMap.set(remoteConv.id, merged);
    }
  }
  
  // Convert back to array and sort by updatedAt
  return Array.from(mergedMap.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
