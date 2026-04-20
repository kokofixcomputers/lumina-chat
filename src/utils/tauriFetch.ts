/**
 * Tauri HTTP plugin fetch wrapper
 * Replaces browser fetch in Tauri environment to avoid CORS issues
 */

// Dynamic import for Tauri HTTP plugin
let tauriFetch: any = null;

async function getTauriFetch() {
  if (!tauriFetch && isTauri) {
    try {
      const plugin = await import('@tauri-apps/plugin-http');
      tauriFetch = plugin.fetch;
    } catch (error) {
      console.warn('Tauri HTTP plugin not available, falling back to browser fetch');
    }
  }
  return tauriFetch;
}

// Helper function to get response body as text
async function getResponseBody(response: any): Promise<string> {
  try {
    if (response.body) {
      if (typeof response.body === 'string') {
        return response.body;
      }
      // Try to read as text if it's a stream or buffer
      const arrayBuffer = await response.arrayBuffer();
      return new TextDecoder().decode(arrayBuffer);
    }
    return '';
  } catch (error) {
    console.warn('Failed to read response body:', error);
    return '';
  }
}

// Check if we're running in Tauri
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Universal fetch function that uses Tauri HTTP plugin in Tauri, browser fetch otherwise
export async function universalFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isTauri) {
    // Use Tauri HTTP plugin
    const fetchFn = await getTauriFetch();
    if (fetchFn) {
      const response = await fetchFn(url, options);
      
      // For Tauri, preserve the original stream and response
      let body: ArrayBuffer | string | null = null;
      if (response.body) {
        if (typeof response.body === 'string') {
          body = response.body;
        } else if (response.body instanceof ReadableStream) {
          // For streaming, return original response with preserved stream
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(Object.entries(response.headers)),
          });
        } else {
          body = await response.arrayBuffer();
        }
      }
      
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(Object.entries(response.headers)),
      });
    }
  }
  
  // Use browser fetch
  return fetch(url, options);
}

// Streaming fetch for SSE (Server-Sent Events)
export async function universalStreamingFetch(url: string, options: RequestInit = {}): Promise<{
  response: Response;
  stream: AsyncIterable<Uint8Array>;
}> {
  if (isTauri) {
    // Use Tauri HTTP plugin for streaming
    const fetchFn = await getTauriFetch();
    if (fetchFn) {
      const response = await fetchFn(url, options);
      
      // Debug: Log Tauri response details
      console.log('Tauri HTTP Plugin Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        ok: response.ok,
        bodyType: typeof response.body,
        bodyExists: !!response.body,
        bodyContent: response.body
      });
      
      // Try to log the actual body content for debugging
      if (response.body) {
        console.log('Tauri response body type:', typeof response.body);
        console.log('Tauri response body:', response.body);
        
        // If it's a string, log first 200 chars
        if (typeof response.body === 'string') {
          console.log('Body preview (first 200 chars):', response.body.substring(0, 200));
        }
      }
      
      // Check if response is successful
      if (!response.ok) {
        // Create error response with proper body
        const errorText = await getResponseBody(response);
        const browserResponse = new Response(errorText, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(Object.entries(response.headers)),
        });
        
        return {
          response: browserResponse,
          stream: (async function* () {}() as AsyncIterable<Uint8Array>) // Empty stream for errors
        };
      }
      
      // Create a browser-like Response but keep the original stream
      const browserResponse = new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(Object.entries(response.headers)),
      });
      
      return {
        response: browserResponse,
        stream: response.body || (async function* () {}() as AsyncIterable<Uint8Array>)
      };
    }
  }
  
  // Use browser fetch with streaming
  const response = await fetch(url, options);
  
  if (!response.body) {
    throw new Error('Response body is null');
  }
  
  // Convert ReadableStream to AsyncIterable
  const reader = response.body.getReader();
  const stream = (async function* () {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  })();
  
  return {
    response,
    stream
  };
}

// Process SSE chunks from streaming response
export async function* processSSEStream(stream: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    for await (const chunk of stream) {
      // Skip empty chunks
      if (!chunk) continue;
      // Handle different chunk formats
      let decoded: string;
      if (chunk instanceof Uint8Array) {
        decoded = decoder.decode(chunk, { stream: true });
      } else if (typeof chunk === 'string') {
        decoded = chunk;
      } else {
        // Convert any other format to string
        decoded = String(chunk);
      }
      
      buffer += decoded;
      
      // Split by lines and process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            return; // End of stream
          }
          if (data) {
            yield data;
          }
        } else if (line.startsWith('event: ')) {
          // Handle event types if needed
          const event = line.slice(7).trim();
          yield { type: 'event', data: event };
        }
      }
    }
  } catch (error) {
    console.error('Error processing SSE stream:', error);
    throw error;
  }
  
  // Process any remaining data
  if (buffer.trim()) {
    const lines = buffer.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data !== '[DONE]' && data) {
          yield data;
        }
      }
    }
  }
}
