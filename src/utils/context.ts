import type { Message } from '../types';
import { Tiktoken, getEncoding } from 'js-tiktoken';

// Initialize tokenizer with cl100k_base (compatible with most models)
let tokenizer: Tiktoken | null = null;

function getTokenizer(): Tiktoken | null {
  if (!tokenizer) {
    try {
      tokenizer = getEncoding('cl100k_base');
    } catch (error) {
      console.warn('Failed to load tokenizer, falling back to estimation:', error);
      return null;
    }
  }
  return tokenizer;
}

/**
 * Accurate token counting using js-tiktoken library
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  
  const tk = getTokenizer();
  if (!tk) {
    // Fallback to simple estimation if tokenizer fails
    return Math.ceil(text.length / 4);
  }
  
  try {
    const tokens = tk.encode(text);
    return tokens.length;
  } catch (error) {
    console.warn('Tokenization error, falling back to estimation:', error);
    return Math.ceil(text.length / 4);
  }
}

/**
 * Cleanup function to reset tokenizer (js-tiktoken handles memory automatically)
 */
export function cleanupTokenizer(): void {
  // js-tiktoken handles memory management automatically
  // Just reset the reference if needed
  tokenizer = null;
}

/**
 * Calculate total tokens used in a conversation
 */
export function calculateConversationTokens(messages: Message[]): number {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Count tokens in message content
    totalTokens += estimateTokens(message.content);
    
    // Count tokens in images (rough estimate - images typically use ~85-100 tokens each)
    if (message.images && message.images.length > 0) {
      totalTokens += message.images.length * 100;
    }
    
    // Add tokens for role (system/user/assistant/tool)
    totalTokens += estimateTokens(message.role || '');
    
    // Add minimal overhead for message metadata (role, timestamp, etc.)
    totalTokens += 5; // Small overhead for message structure
    
    // Add tokens for tool calls if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        totalTokens += estimateTokens(toolCall.function.name);
        totalTokens += estimateTokens(toolCall.function.arguments);
        totalTokens += 10; // Minimal tool call overhead
      }
    }
    
    // Add tokens for tool results
    if (message.tool_call_id && message.tool_name) {
      totalTokens += estimateTokens(message.tool_name);
      totalTokens += 10; // Minimal tool result overhead
    }
    
    // Add tokens for artifacts if present
    if (message.artifacts && message.artifacts.length > 0) {
      for (const artifact of message.artifacts) {
        totalTokens += estimateTokens(artifact.message);
        totalTokens += 15; // Minimal artifact metadata overhead
      }
    }
    
    // Add tokens for follow-up suggestions
    if (message.followUps && message.followUps.length > 0) {
      for (const followUp of message.followUps) {
        totalTokens += estimateTokens(followUp);
      }
    }
  }
  
  // Add system prompt overhead (if not already counted in messages)
  const systemMessages = messages.filter(m => m.role === 'system');
  if (systemMessages.length === 0) {
    totalTokens += 50; // Conservative system prompt overhead
  }
  
  // Add tool descriptions overhead (estimated based on common tools)
  totalTokens += 150; // Conservative estimate for available tool descriptions
  
  // Add completion tokens overhead (estimated response size)
  totalTokens += 100; // Conservative estimate for assistant response
  
  return totalTokens;
}

/**
 * Get context usage percentage
 */
export function getContextUsagePercentage(usedTokens: number, maxTokens: number): number {
  if (!maxTokens || maxTokens <= 0) return 0;
  return Math.min((usedTokens / maxTokens) * 100, 100);
}

/**
 * Get context status color based on usage percentage
 */
export function getContextStatusColor(percentage: number): string {
  if (percentage < 50) return 'rgb(59, 130, 246)'; // blue-500
  if (percentage < 80) return 'rgb(234, 179, 8)'; // yellow-500
  return 'rgb(239, 68, 68)'; // red-500
}

/**
 * Get context status text
 */
export function getContextStatusText(percentage: number): string {
  if (percentage < 50) return 'Low';
  if (percentage < 80) return 'Medium';
  return 'High';
}
