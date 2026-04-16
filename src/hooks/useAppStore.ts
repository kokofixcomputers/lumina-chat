import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message, AppSettings, ModelProvider, ModelSettings } from '../types';
import type { IntegratedProviderTemplate } from '../data/integratedProviders';
import { getToolDefinitions, getToolByName, getToolDefinitionsForResponsesApi } from '../tools';
import { fetchWithProxyFallback } from '../utils/proxyFetch';
import { resolveFormat, applyVars, getByPath } from '../components/ProvidersPanel';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  providers: [
  ],
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
While using tools, please tell the user what you are doing by adding {"status": "step"} on the same line as {"status": "request_another_tool"} Keep these messages brief, 2-8 words Example: “Installing Node.js.” {"status": "step"} {"status": "request_another_tool"}`,
    stream: true,
  },
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

function saveToStorage(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      localStorage.setItem(key, serialized);
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'QuotaExceededError' && key === 'lumina_conversations') {
        // Evict oldest conversation and retry
        try {
          const convs: any[] = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
          if (convs.length === 0) break;
          convs.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
          convs.shift();
          localStorage.setItem('lumina_conversations', JSON.stringify(convs));
        } catch {
          break;
        }
      } else {
        console.error('Failed to save to localStorage:', err);
        break;
      }
    }
  }
}

export function useAppStore() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadFromStorage('lumina_conversations', [])
  );
  const conversationsRef = useRef<Conversation[]>(conversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [storageQuotaExceeded, setStorageQuotaExceeded] = useState(false);
  const storageQuotaResolverRef = useRef<((action: 'evict' | 'retry' | 'ignore') => void) | null>(null);

  const promptStorageQuota = useCallback((): Promise<'evict' | 'retry' | 'ignore'> => {
    return new Promise(resolve => {
      storageQuotaResolverRef.current = resolve;
      setStorageQuotaExceeded(true);
    });
  }, []);

  const resolveStorageQuota = useCallback((action: 'evict' | 'retry' | 'ignore') => {
    setStorageQuotaExceeded(false);
    storageQuotaResolverRef.current?.(action);
    storageQuotaResolverRef.current = null;
  }, []);
  
  // Store active conversation ID in sessionStorage for tools to access
  useEffect(() => {
    if (activeConvId) {
      sessionStorage.setItem('activeConvId', activeConvId);
    } else {
      sessionStorage.removeItem('activeConvId');
    }
  }, [activeConvId]);
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadFromStorage('lumina_settings', DEFAULT_SETTINGS)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
    // Async save with quota handling
    (async () => {
      const serialized = JSON.stringify(conversations);
      while (true) {
        try {
          localStorage.setItem('lumina_conversations', serialized);
          return;
        } catch (err) {
          if (err instanceof Error && err.name === 'QuotaExceededError') {
            const action = await promptStorageQuota();
            if (action === 'evict') {
              try {
                const convs: any[] = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
                convs.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
                convs.splice(0, 3);
                localStorage.setItem('lumina_conversations', JSON.stringify(convs));
              } catch { return; }
              // loop to retry saving
            } else if (action === 'retry') {
              // loop to retry saving
            } else {
              return; // ignore
            }
          } else {
            console.error('Failed to save to localStorage:', err);
            return;
          }
        }
      }
    })();
  }, [conversations, promptStorageQuota]);

  useEffect(() => {
    saveToStorage('lumina_settings', settings);
  }, [settings]);

  // Theme
  useEffect(() => {
    const theme = settings.theme;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, [settings.theme]);

  const activeConversation = conversations.find(c => c.id === activeConvId) ?? null;

  const newConversation = useCallback((mode: 'chat' | 'image' = 'chat', attachments: string[] = []) => {
    const id = uuidv4();
    const conv: Conversation = {
      id,
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelId: settings.defaultProviderModelId,
      mode,
      attachments,
    };
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(id);
    return id;
  }, [settings.defaultProviderModelId]);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeConvId === id) {
        setActiveConvId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [activeConvId]);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  }, []);

  const addMessage = useCallback((convId: string, msg: Message) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const messages = [...c.messages, msg];
      // Auto-title from first user message
      const title = c.messages.length === 0 && msg.role === 'user'
        ? msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '')
        : c.title;
      return { ...c, messages, title, updatedAt: Date.now() };
    }));
  }, []);

  const getProviderAndModel = useCallback((providerModelId: string) => {
    const slashIdx = providerModelId.indexOf('/');
    const providerId = slashIdx !== -1 ? providerModelId.slice(0, slashIdx) : providerModelId;
    const modelId = slashIdx !== -1 ? providerModelId.slice(slashIdx + 1) : '';
    const provider = settings.providers.find(p => p.id === providerId);
    const model = provider?.models.find(m => m.id === modelId);
    return { provider, model };
  }, [settings.providers]);

  const sendMessage = useCallback(async (
    content: string,
    images: string[],
    convId: string,
  ) => {
    // Helper function to parse rate limit headers and wait
    const handleRateLimit = async (headers: Headers): Promise<void> => {
      const resetRequests = headers.get('x-ratelimit-reset-requests');
      const resetTokens = headers.get('x-ratelimit-reset-tokens');
      
      let waitTime = 1000; // Default 1 second
      
      if (resetRequests) {
        const match = resetRequests.match(/(\d+)(ms|s|m)/);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2];
          if (unit === 'ms') waitTime = value;
          else if (unit === 's') waitTime = value * 1000;
          else if (unit === 'm') waitTime = value * 60 * 1000;
        }
      } else if (resetTokens) {
        const match = resetTokens.match(/(\d+)(ms|s|m)/);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2];
          if (unit === 'ms') waitTime = value;
          else if (unit === 's') waitTime = value * 1000;
          else if (unit === 'm') waitTime = value * 60 * 1000;
        }
      }
      
      // Add a small buffer
      waitTime += 100;
      
      return new Promise(resolve => setTimeout(resolve, waitTime));
    };

    // Helper function to fetch with retry on 429
    const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetchWithProxyFallback(
          url,
          options,
          !!provider?.useProxy,
          () => {
            if (provider) updateProvider(provider.id, { useProxy: true });
          },
          provider?.proxyMode,
        );
        
        if (response.status === 429) {
          const resetRequests = response.headers.get('x-ratelimit-reset-requests');
          const resetTokens = response.headers.get('x-ratelimit-reset-tokens');
          const waitTimeStr = resetRequests || resetTokens || '1s';
          
          // Show rate limit message
          const rateLimitMsg: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: `⏳ Rate limit reached. Retrying in ${waitTimeStr}... (Attempt ${attempt + 1}/${maxRetries})`,
            timestamp: Date.now(),
            isError: false,
          };
          const msgId = rateLimitMsg.id;
          addMessage(convId, rateLimitMsg);
          
          if (attempt < maxRetries - 1) {
            await handleRateLimit(response.headers);
            
            // Remove the rate limit message before retry
            setConversations(prev => prev.map(c => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: c.messages.filter(m => m.id !== msgId)
              };
            }));
          } else {
            // Update message to show failure
            setConversations(prev => prev.map(c => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: c.messages.map(m => 
                  m.id === msgId 
                    ? { ...m, content: '❌ Rate limit exceeded. Please try again in a moment.', isError: true }
                    : m
                )
              };
            }));
            throw new Error('Rate limit exceeded after retries');
          }
        } else {
          return response;
        }
      }
      
      throw new Error('Max retries exceeded');
    };

    // Helper function to handle continuation responses
    const handleContinuationResponse = async (
      response: Response,
      convId: string,
      provider: any,
      model: any,
      chatUrl: string,
      headers: Record<string, string>,
      requestBody: any,
      previousMessages: any[],
      useResponsesApi: boolean = false
    ) => {
      let assistantContent = '';
      let toolCalls: any[] = [];
      const toolCallsMap = new Map<number, any>();
      let tokenCount = 0;
      const startTime = Date.now();

      if (useResponsesApi) {
        // Responses API streaming
        if (settings.modelSettings.stream) {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error('No response body');

          let buffer = '';
          const functionCallsMap = new Map<string, any>();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.trim()) continue;
              if (line.startsWith('event:')) continue;
              if (!line.startsWith('data: ')) continue;
              
              let data = line.slice(6).trim();
              const _cSentinel = activeApiFormat?.streamingDoneSentinel ?? '[DONE]';
              if (data === _cSentinel) continue;
              try { if (JSON.parse(data)?.type === _cSentinel) continue; } catch { /* not JSON */ }
              
              // Decode HTML entities comprehensively
              data = data
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'");
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'error' && parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
                if (parsed.type === 'response.failed' && parsed.response?.error) throw new Error(parsed.response.error.message || JSON.stringify(parsed.response.error));
                
                if (parsed.type === 'response.output_text.delta' && parsed.delta) {
                  assistantContent += parsed.delta;
                  setStreamingContent(assistantContent);
                  tokenCount++;
                }
                
                if (parsed.type === 'response.output_text.done' && parsed.text) {
                  assistantContent = parsed.text;
                  setStreamingContent(assistantContent);
                }
                
                if (parsed.type === 'response.output_item.added' && parsed.item?.type === 'function_call') {
                  functionCallsMap.set(parsed.item.id, {
                    id: parsed.item.call_id,
                    type: 'function',
                    function: { name: parsed.item.name, arguments: '' },
                    fc_id: parsed.item.id
                  });
                }
                
                if (parsed.type === 'response.function_call_arguments.delta' && parsed.delta) {
                  const call = functionCallsMap.get(parsed.item_id);
                  if (call) call.function.arguments += parsed.delta;
                }
                
                if (parsed.type === 'response.completed' && parsed.response) {
                  if (parsed.response.usage) {
                    tokenCount = parsed.response.usage.output_tokens || tokenCount;
                  }
                  
                  // Extract assistant message from completed response output
                  if (parsed.response.output) {
                    for (const item of parsed.response.output) {
                      if (item.type === 'message' && item.content) {
                        let messageText = '';
                        for (const contentItem of item.content) {
                          if (contentItem.type === 'output_text' && contentItem.text) {
                            messageText += contentItem.text;
                          }
                        }
                        if (messageText && !assistantContent) {
                          assistantContent = messageText;
                          setStreamingContent(assistantContent);
                        }
                      }
                    }
                  }
                  
                  // Note: Don't store reasoning in previousMessages as it shouldn't be sent back
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && !parseErr.message.includes('JSON')) throw parseErr;
              }
            }
          }
          
          toolCalls = Array.from(functionCallsMap.values());
        } else {
          // Non-streaming responses API
          const data = await response.json();
          
          // Extract text from output array
          if (data.output) {
            for (const item of data.output) {
              if (item.type === 'message' && item.content) {
                for (const contentItem of item.content) {
                  if (contentItem.type === 'output_text') {
                    assistantContent += contentItem.text || '';
                  }
                }
              }
              if (item.type === 'function_call') {
                toolCalls.push({
                  id: item.call_id,
                  type: 'function',
                  function: { name: item.name, arguments: item.arguments },
                  fc_id: item.id
                });
              }
            }
          }
          
          // Fallback to output_text
          if (!assistantContent && data.output_text) {
            assistantContent = data.output_text;
          }
          
          tokenCount = data.usage?.output_tokens || assistantContent.split(/\s+/).length;
          
          // Note: Don't store reasoning in previousMessages as it shouldn't be sent back
        }
      } else if (settings.modelSettings.stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.trim()) continue;
            if (line.startsWith('event:')) continue;
            if (!line.startsWith('data:')) continue;

            let data = line.slice(line.indexOf('data:') + 6).trim();
            const _fmtSentinel = activeApiFormat?.streamingDoneSentinel ?? '[DONE]';
            if (data === _fmtSentinel) continue;
            try { if (JSON.parse(data)?.type === _fmtSentinel) continue; } catch { /* not JSON */ }
            
            // Decode HTML entities comprehensively
            data = data
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'")
              .replace(/&apos;/g, "'");
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.choices?.[0]?.finish_reason === 'error') throw new Error(parsed.error || 'Stream error');
              const delta = parsed.choices?.[0]?.delta?.content || '';
              assistantContent += delta;
              setStreamingContent(assistantContent);
              if (delta) tokenCount++;
              
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                for (const tc of parsed.choices[0].delta.tool_calls) {
                  const existing = toolCallsMap.get(tc.index);
                  if (!existing) {
                    toolCallsMap.set(tc.index, {
                      id: tc.id || '',
                      type: tc.type || 'function',
                      function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
                    });
                  } else {
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  }
                }
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && !parseErr.message.includes('JSON')) throw parseErr;
            }
          }
        }
        toolCalls = Array.from(toolCallsMap.values());
      } else {
        const data = await response.json();
        assistantContent = data.choices?.[0]?.message?.content || '';
        toolCalls = data.choices?.[0]?.message?.tool_calls || [];
        tokenCount = data.usage?.completion_tokens || assistantContent.split(/\s+/).length;
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = tokenCount > 0 ? Math.round(tokenCount / duration) : undefined;

      const requestsAnotherTool = /\{"status"\s*:\s*"request_another_tool"\}\s*$/.test(assistantContent);
      const isStep = /\{"status"\s*:\s*"step"\}(\s*\{"status"\s*:\s*"request_another_tool"\})?\s*$/.test(assistantContent);

      // Only add message if there's content or no tool calls
      if (assistantContent || toolCalls.length === 0) {
        const assistantMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now(),
          model: model?.id,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          tokens: tokenCount > 0 ? tokenCount : undefined,
          tokensPerSecond,
          isStep,
          requestsAnotherTool,
        };
        addMessage(convId, assistantMsg);
        
        // Clear streaming state if no more tool calls
        if (toolCalls.length === 0) {
          setStreamingContent('');
          setIsGenerating(false);
        }
      }

      // Execute tool calls if present
      if (toolCalls.length > 0) {
        const functionCallItems = toolCalls.map(tc => ({
          type: 'function_call',
          id: tc.fc_id || tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
          call_id: tc.id,
          status: 'completed'
        }));
        const messagesToPass = useResponsesApi ? [...previousMessages, { type: 'message', role: 'assistant', content: assistantContent || '' }, ...functionCallItems] : previousMessages;
        await executeToolCalls(toolCalls, convId, provider, model, chatUrl, headers, requestBody, messagesToPass, useResponsesApi);
      } else if (requestsAnotherTool) {
        // Request another tool call
        setTimeout(async () => {
          try {
            const continuationMessages = [
              ...previousMessages,
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }
            ];
            
            const continuationBody = useResponsesApi ? {
              model: model?.id || 'gpt-4o',
              input: continuationMessages,
              store: false,
              stream: settings.modelSettings.stream,
              //temperature: settings.modelSettings.temperature,
              top_p: settings.modelSettings.topP,
              frequency_penalty: settings.modelSettings.frequencyPenalty,
              presence_penalty: settings.modelSettings.presencePenalty,
              tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration, buildMode),
              tool_choice: 'auto',
              ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? {
                reasoning: { effort: settings.modelSettings.reasoningEffort }
              } : {}),
            } : { ...requestBody, messages: continuationMessages, stream: settings.modelSettings.stream };
            
            const continuationResponse = await fetchWithRetry(chatUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(continuationBody),
            });
            
            if (continuationResponse.ok) {
              await handleContinuationResponse(continuationResponse, convId, provider, model, chatUrl, headers, requestBody, continuationMessages, useResponsesApi);
            }
          } catch (err) {
            console.error('Continuation request failed:', err);
          }
        }, 100);
      }
    };

    // Helper function to execute tool calls
    const executeToolCalls = async (
      toolCalls: any[],
      convId: string,
      provider: any,
      model: any,
      chatUrl: string,
      headers: Record<string, string>,
      requestBody: any,
      previousMessages: any[],
      useResponsesApi: boolean = false
    ) => {
      const toolMessages: any[] = [];
      const isAnthropic = activeApiFormat?.id === 'anthropic';
      
      for (const toolCall of toolCalls) {
        const tool = getToolByName(toolCall.function.name, buildMode);
        
        const loadingMsgId = uuidv4();
        const loadingMsg: Message = {
          id: loadingMsgId,
          role: 'tool',
          content: '',
          timestamp: Date.now(),
          tool_call_id: toolCall.id,
          tool_name: toolCall.function.name,
          tool_status: 'loading',
        };
        addMessage(convId, loadingMsg);
        
        if (tool) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await tool.execute(args);
            
            // Handle image generation
            if (result._requiresImageGeneration && toolCall.function.name === 'generate_image') {
              try {
                const useResponsesApi = settings.modelSettings.useResponsesApi;
                
                if (useResponsesApi) {
                  // Use responses API for image generation
                  const responsesUrl = provider.baseUrl.includes('/responses')
                    ? provider.baseUrl
                    : `${provider.baseUrl}/responses`;
                  
                  // Build input array - include previous image call if exists
                  const input: any[] = [];
                  
                  // Find the most recent image generation call for follow-up edits
                  const conv = conversations.find(c => c.id === convId);
                  const recentMessages = conv?.messages.slice().reverse() || [];
                  const lastImageMsg = recentMessages.find(m => m.imageGenerationCall);
                  
                  // Build user message content with image attachment if editing
                  const userContent: any[] = [{ type: 'input_text', text: result.prompt }];
                  
                  if (lastImageMsg?.imageGenerationCall?.result?.image_data) {
                    const imageData = lastImageMsg.imageGenerationCall.result.image_data;
                    userContent.push({ 
                      type: 'input_image', 
                      image_url: imageData.startsWith('data:') || imageData.startsWith('http') ? imageData : `data:image/png;base64,${imageData}`
                    });
                  }
                  
                  input.push({ type: 'message', role: 'user', content: userContent });
                  
                  const imgResponse = await fetch(responsesUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${provider.apiKey}`,
                    },
                    body: JSON.stringify({
                      model: settings.imageGenerationModel || 'gpt-image-1.5',
                      input,
                      tools: [{ 
                        type: 'image_generation',
                        action: 'auto',
                        quality: 'high'
                      }],
                      tool_choice: 'auto',
                      store: false
                    }),
                  });
                  
                  if (imgResponse.ok) {
                    const imgData = await imgResponse.json();
                    const imageCall = imgData.output?.find((item: any) => item.image_generation_call);
                    
                    if (imageCall?.image_generation_call?.result?.image_data) {
                      const imageData = imageCall.image_generation_call.result.image_data;
                      const imageUrl = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
                      
                      setConversations(prev => prev.map(c => {
                        if (c.id !== convId) return c;
                        return {
                          ...c,
                          messages: c.messages.map(m => 
                            m.id === loadingMsgId 
                              ? { 
                                  ...m, 
                                  content: lastImageMsg?.imageGenerationCall 
                                    ? `Edited image: ${result.prompt}` 
                                    : `Generated image: ${result.prompt}`, 
                                  images: [imageUrl], 
                                  tool_status: 'success' as const,
                                  imageGenerationCall: imageCall // Store for future edits
                                }
                              : m
                          )
                        };
                      }));
                      
                      toolMessages.push(useResponsesApi
                        ? { type: 'function_call_output', call_id: toolCall.id, output: JSON.stringify({ success: true, description: result.prompt }) }
                        : isAnthropic
                          ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ success: true, description: result.prompt }) }] }
                          : { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, description: result.prompt }) }
                        );
                    } else {
                      throw new Error('No image data in response');
                    }
                  } else {
                    throw new Error('Image generation failed');
                  }
                } else {
                  // Use legacy images/generations endpoint
                  const imageUrl = provider.baseUrl.includes('/images/generations')
                    ? provider.baseUrl
                    : `${provider.baseUrl}/images/generations`;
                  const imgResponse = await fetch(imageUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${provider.apiKey}`,
                    },
                    body: JSON.stringify({ prompt: result.prompt, n: 1, size: result.size, model: settings.imageGenerationModel || 'dall-e-3' }),
                  });
                  
                  if (imgResponse.ok) {
                    const imgData = await imgResponse.json();
                    const imageUrl = imgData.data?.[0]?.url || imgData.data?.[0]?.b64_json;
                    const imageData = imageUrl.startsWith('data:') ? imageUrl : imageUrl.startsWith('http') ? imageUrl : `data:image/png;base64,${imageUrl}`;
                    
                    setConversations(prev => prev.map(c => {
                      if (c.id !== convId) return c;
                      return {
                        ...c,
                        messages: c.messages.map(m => 
                          m.id === loadingMsgId 
                            ? { ...m, content: `Generated image: ${result.prompt}`, images: [imageData], tool_status: 'success' as const }
                            : m
                        )
                      };
                    }));
                    
                    toolMessages.push(useResponsesApi
                      ? { type: 'function_call_output', call_id: toolCall.id, output: JSON.stringify({ success: true, description: result.prompt }) }
                      : isAnthropic
                        ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ success: true, description: result.prompt }) }] }
                        : { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, description: result.prompt }) }
                      );
                  } else {
                    throw new Error('Image generation failed');
                  }
                }
              } catch (imgErr) {
                setConversations(prev => prev.map(c => {
                  if (c.id !== convId) return c;
                  return {
                    ...c,
                    messages: c.messages.map(m => 
                      m.id === loadingMsgId 
                        ? { ...m, content: imgErr instanceof Error ? imgErr.message : 'Image generation failed', tool_status: 'error' as const }
                        : m
                    )
                  };
                }));
              }
            } else if (result._isArtifact && toolCall.function.name === 'artifact_dev_env') {
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m => 
                    m.id === loadingMsgId 
                      ? { 
                          ...m, 
                          content: result.message || `Artifact ready: ${result.original_path}`, 
                          artifacts: [{
                            url: result.url,
                            direct_download: result.direct_download,
                            original_path: result.original_path,
                            file_hash: result.file_hash,
                            message: result.message
                          }],
                          tool_status: 'success' as const 
                        }
                      : m
                  )
                };
              }));
              
              toolMessages.push(useResponsesApi
                ? { type: 'function_call_output', call_id: toolCall.id, output: JSON.stringify({ success: true, file: result.original_path, url: result.url }) }
                : isAnthropic
                  ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ success: true, file: result.original_path, url: result.url }) }] }
                  : { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, file: result.original_path, url: result.url }) }
                );
            } else {
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                const updatedMessages = c.messages.map(m => 
                  m.id === loadingMsgId 
                    ? { ...m, content: JSON.stringify(result, null, 2), tool_status: 'success' as const }
                    : m
                );
                
                let updates: any = { messages: updatedMessages };
                if (toolCall.function.name === 'create_dev_env' && result.success && result.session) {
                  updates.devEnvSession = result.session;
                }
                if (result._hotelSearchKey) {
                  updates.hotelSearchKey = result._hotelSearchKey;
                }
                
                return { ...c, ...updates };
              }));
              
              toolMessages.push(useResponsesApi
                ? { type: 'function_call_output', call_id: toolCall.id, output: JSON.stringify(result) }
                : isAnthropic
                  ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify(result) }] }
                  : { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) }
                );
            }
          } catch (toolErr) {
            const errorMessage = toolErr instanceof Error ? toolErr.message : String(toolErr);
            setConversations(prev => prev.map(c => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: c.messages.map(m => 
                  m.id === loadingMsgId 
                    ? { ...m, content: errorMessage, tool_status: 'error' as const }
                    : m
                )
              };
            }));
            
            // Send error back to AI
            toolMessages.push(useResponsesApi
              ? { type: 'function_call_output', call_id: toolCall.id, output: JSON.stringify({ error: errorMessage, success: false }) }
              : isAnthropic
                ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ error: errorMessage, success: false }) }] }
                : { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: errorMessage, success: false }) }
              );
          }
        } else {
          const errorMessage = `Tool "${toolCall.function.name}" not found`;
          setConversations(prev => prev.map(c => {
            if (c.id !== convId) return c;
            return {
              ...c,
              messages: c.messages.map(m => 
                m.id === loadingMsgId 
                  ? { ...m, content: errorMessage, tool_status: 'error' as const }
                  : m
              )
            };
          }));
          
          // Send error back to AI
          toolMessages.push(useResponsesApi
            ? { type: 'function_call_output', call_id: toolCall.id, output: JSON.stringify({ error: errorMessage, success: false }) }
            : isAnthropic
              ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ error: errorMessage, success: false }) }] }
              : { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: errorMessage, success: false }) }
            );
        }
      }
      
      // Send tool results back to AI
      if (toolMessages.length > 0) {
        try {
          const followUpBody = useResponsesApi ? {
            model: model?.id || 'gpt-4o',
            input: [...previousMessages.filter((m: any) => m.type !== 'reasoning'), ...toolMessages],
            store: false,
            stream: settings.modelSettings.stream,
            //temperature: settings.modelSettings.temperature,
            top_p: settings.modelSettings.topP,
            frequency_penalty: settings.modelSettings.frequencyPenalty,
            presence_penalty: settings.modelSettings.presencePenalty,
            tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration),
            tool_choice: 'auto',
            ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? {
              reasoning: { effort: settings.modelSettings.reasoningEffort }
            } : {}),
          } : {
            ...requestBody,
            messages: [...previousMessages, ...toolMessages],
            stream: settings.modelSettings.stream,
            tools: getToolDefinitions(settings.allowImageGeneration, buildMode)
          };
          
          const followUpResponse = await fetchWithRetry(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(followUpBody),
          });
          
          if (followUpResponse.ok) {
            await handleContinuationResponse(followUpResponse, convId, provider, model, chatUrl, headers, requestBody, useResponsesApi ? [...previousMessages.filter((m: any) => m.type !== 'reasoning'), ...toolMessages] : [...previousMessages, ...toolMessages], useResponsesApi);
          }
        } catch (followUpErr) {
          console.error('Follow-up request failed:', followUpErr);
        }
      }
    };

    // Find or create the conversation
    let conv = conversations.find(c => c.id === convId);
    if (!conv) {
      // convId was just created but state hasn't updated — create inline
      const newConv: Conversation = {
        id: convId,
        title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelId: settings.defaultProviderModelId,
      };
      setConversations(prev => {
        // might already exist if state updated
        if (prev.find(c => c.id === convId)) return prev;
        return [newConv, ...prev];
      });
      conv = newConv;
    }

    const { provider, model } = getProviderAndModel(conv.modelId || settings.defaultProviderModelId);
    if (!provider) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      images: images.length ? images : undefined,
      timestamp: Date.now(),
    };

    addMessage(convId, userMsg);
    setIsGenerating(true);
    setStreamingContent('');

    const controller = new AbortController();
    setAbortController(controller);
    
    const startTime = Date.now();
    let tokenCount = 0;

    // Build messages for API
    const apiMessages: Array<{ type?: string; role: string; content: unknown; tool_call_id?: string; tool_calls?: any[] }> = [];
    const responsesApiMessages: Array<{ type?: string; role: string; content: unknown; tool_call_id?: string }> = [];

    if (settings.modelSettings.systemPrompt) {
      apiMessages.push({ role: 'system', content: settings.modelSettings.systemPrompt });
      responsesApiMessages.push({ type: 'message', role: 'system', content: settings.modelSettings.systemPrompt });
    }

    // Get fresh conversation state from ref (updated by useEffect)
    const currentConv = conversationsRef.current.find(c => c.id === convId);
    const allMessages = [...(currentConv?.messages || []), userMsg];
    
    // Apply max history limit
    const maxHistory = settings.maxHistory || 10;
    const limitedMessages = allMessages.slice(-maxHistory);
    
    for (const m of limitedMessages) {
      // Skip tool messages - they're only for internal tool follow-ups
      if (m.role === 'tool') continue;
      
      if (m.images && m.images.length > 0) {
        const parts: unknown[] = [];
        m.images.forEach(img => {
          if (img.startsWith('data:image/')) {
            parts.push({ type: 'input_image', image_url: img });
          } else {
            parts.push({ type: 'input_text', text: `[Attached file content]:\n${img}` });
          }
        });
        parts.push({ type: 'input_text', text: m.content });
        apiMessages.push({ role: m.role, content: parts });
        // For responses API, only include images in user messages
        if (m.role === 'user') {
          responsesApiMessages.push({ type: 'message', role: m.role, content: parts });
        } else {
          // Assistant messages with images: just include text content
          responsesApiMessages.push({ type: 'message', role: m.role, content: m.content });
        }
      } else {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        apiMessages.push(msg);
        responsesApiMessages.push({ type: 'message', role: m.role, content: m.content });
      }
    }

    const buildMode = !!conv.buildMode;

    const requestBody = {
      model: model?.id || 'gpt-4o',
      messages: apiMessages,
      //temperature: settings.modelSettings.temperature,
      //max_tokens: settings.modelSettings.maxTokens,
      top_p: settings.modelSettings.topP,
      frequency_penalty: settings.modelSettings.frequencyPenalty,
      presence_penalty: settings.modelSettings.presencePenalty,
      stream: settings.modelSettings.stream,
      tools: getToolDefinitions(settings.allowImageGeneration, buildMode),
    };

    // Build request for responses API if enabled
    const useResponsesApi = settings.modelSettings.useResponsesApi;
    const responsesApiBody = useResponsesApi ? {
      model: model?.id || 'gpt-4o',
      input: responsesApiMessages,
      store: false,
      stream: settings.modelSettings.stream,
      //temperature: settings.modelSettings.temperature,
      top_p: settings.modelSettings.topP,
      frequency_penalty: settings.modelSettings.frequencyPenalty,
      presence_penalty: settings.modelSettings.presencePenalty,
      tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration, buildMode),
      tool_choice: 'auto',
      ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? {
        reasoning: { effort: settings.modelSettings.reasoningEffort }
      } : {}),
    } : null;

    // Resolve active API format for this provider
    const activeApiFormat = resolveFormat(settings.apiFormats || [], provider.apiFormatId);
    const hasCustomTemplate = !!(activeApiFormat.requestBodyTemplate || activeApiFormat.streamingRequestBodyTemplate);

    const systemMessage = apiMessages.find(m => m.role === 'system');
    const nonSystemMessages = apiMessages.filter(m => m.role !== 'system');

    const rawTools = getToolDefinitions(settings.allowImageGeneration, buildMode);

    const anthropicTools = rawTools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));


    // Build custom body if format has templates
    const buildCustomBody = (streaming: boolean): string | null => {
      const template = streaming
        ? (activeApiFormat.streamingRequestBodyTemplate || activeApiFormat.requestBodyTemplate)
        : activeApiFormat.requestBodyTemplate;
      if (!template) return null;
      const vars: Record<string, unknown> = {
        messages: nonSystemMessages,
        system: systemMessage?.content ?? '',
        model: model?.id || 'gpt-4o',
        apiKey: provider.apiKey,
        stream: streaming,
        temperature: settings.modelSettings.temperature,
        maxTokens: settings.modelSettings.maxTokens,
        topP: settings.modelSettings.topP,
        tools: anthropicTools,
        ...(activeApiFormat.customVars || {}),
      };
      return applyVars(template, vars);
    };

    try {
      const basePath = activeApiFormat.chatPath || '/chat/completions';
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const chatUrl = useResponsesApi
        ? (provider.baseUrl.includes('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`)
        : provider.directUrl
          ? provider.baseUrl
          : hasCustomTemplate
            ? `${baseUrl}${basePath}`
            : (provider.baseUrl.includes('/chat/completions') ? provider.baseUrl : `${provider.baseUrl}/chat/completions`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Auth header from format
      if (provider.apiKey) {
        headers[activeApiFormat.authHeader] = `${activeApiFormat.authPrefix}${provider.apiKey}`;
      }
      // Extra static headers from format
      try { Object.assign(headers, JSON.parse(activeApiFormat.extraHeaders)); } catch { /* ignore */ }
      if (settings.serpApiKey) {
        headers['x-serpapi-key'] = settings.serpApiKey;
      }

      const isStreaming = settings.modelSettings.stream;
      const customBodyStr = !useResponsesApi ? buildCustomBody(isStreaming) : null;
      const bodyToSend = useResponsesApi
        ? responsesApiBody
        : customBodyStr !== null
          ? JSON.parse(customBodyStr)
          : requestBody;

      const response = await fetchWithRetry(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyToSend),
        signal: controller.signal,
      });

      if (!response.ok) {
        // If responses API returns 404, fallback to chat completions
        if (useResponsesApi && response.status === 404) {
          const fallbackUrl = provider.baseUrl.includes('/chat/completions') 
            ? provider.baseUrl 
            : `${provider.baseUrl}/chat/completions`;
          
          const fallbackResponse = await fetchWithRetry(fallbackUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          
          if (fallbackResponse.ok) {
            // Update provider settings to show warning
            updateProvider(provider.id, { responsesApiUnsupported: true });
            
            // Continue with chat completions API
            const data = await fallbackResponse.json();
            let assistantContent = data.choices?.[0]?.message?.content || '';
            let toolCalls = data.choices?.[0]?.message?.tool_calls || [];
            tokenCount = data.usage?.completion_tokens || assistantContent.split(/\s+/).length;
          } else {
            const err = await fallbackResponse.json().catch(() => ({ error: { message: fallbackResponse.statusText } }));
            throw new Error(err.error?.message || `API error: ${fallbackResponse.status}`);
          }
        } else {
          const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
          throw new Error(err.error?.message || `API error: ${response.status}`);
        }
      }

      let assistantContent = '';
      let toolCalls: any[] = [];
      const toolCallsMap = new Map<number, any>();

      if (useResponsesApi && response.ok) {
        // Responses API streaming
        if (settings.modelSettings.stream) {
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error('No response body');

          let buffer = '';
          const functionCallsMap = new Map<string, any>();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.trim()) continue;
              if (line.startsWith('event:')) continue;
              if (!line.startsWith('data: ')) continue;
              
              let data = line.slice(6).trim();
              const _rSentinel = activeApiFormat?.streamingDoneSentinel ?? '[DONE]';
              if (data === _rSentinel) continue;
              try { if (JSON.parse(data)?.type === _rSentinel) continue; } catch { /* not JSON */ }
              
              // Decode HTML entities comprehensively
              data = data
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'");
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'error' && parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
                if (parsed.type === 'response.failed' && parsed.response?.error) throw new Error(parsed.response.error.message || JSON.stringify(parsed.response.error));
                
                if (parsed.type === 'response.output_text.delta' && parsed.delta) {
                  assistantContent += parsed.delta;
                  setStreamingContent(assistantContent);
                  tokenCount++;
                }
                
                if (parsed.type === 'response.output_text.done' && parsed.text) {
                  assistantContent = parsed.text;
                  setStreamingContent(assistantContent);
                }
                
                if (parsed.type === 'response.output_item.added' && parsed.item?.type === 'function_call') {
                  functionCallsMap.set(parsed.item.id, {
                    id: parsed.item.call_id,
                    type: 'function',
                    function: { name: parsed.item.name, arguments: '' },
                    fc_id: parsed.item.id
                  });
                }
                
                if (parsed.type === 'response.function_call_arguments.delta' && parsed.delta) {
                  const call = functionCallsMap.get(parsed.item_id);
                  if (call) call.function.arguments += parsed.delta;
                }
                
                if (parsed.type === 'response.completed' && parsed.response?.usage) {
                  tokenCount = parsed.response.usage.output_tokens || tokenCount;
                  // Note: Don't store reasoning in responsesApiMessages as it shouldn't be sent back
                  
                  // Handle built-in image generation
                  const imageGenCall = parsed.response.output?.find((i: any) => i.type === 'image_generation_call');
                  if (imageGenCall?.result) {
                    const imageData = imageGenCall.result.startsWith('data:') ? imageGenCall.result : `data:image/png;base64,${imageGenCall.result}`;
                    const imageMsg: Message = {
                      id: uuidv4(),
                      role: 'assistant',
                      content: imageGenCall.revised_prompt || 'Generated image',
                      images: [imageData],
                      timestamp: Date.now(),
                      model: model?.id,
                    };
                    addMessage(convId, imageMsg);
                    setStreamingContent('');
                    setIsGenerating(false);
                    return; // Exit early since image was generated
                  }
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && !parseErr.message.includes('JSON')) throw parseErr;
              }
            }
          }
          
          toolCalls = Array.from(functionCallsMap.values());
        } else {
          // Non-streaming responses API
          const data = await response.json();
          
          // Extract text from output array
          if (data.output) {
            for (const item of data.output) {
              if (item.type === 'message' && item.content) {
                for (const contentItem of item.content) {
                  if (contentItem.type === 'output_text') {
                    assistantContent += contentItem.text || '';
                  }
                }
              }
              if (item.type === 'function_call') {
                toolCalls.push({
                  id: item.call_id,
                  type: 'function',
                  function: { name: item.name, arguments: item.arguments },
                  fc_id: item.id
                });
              }
            }
          }
          
          // Fallback to output_text
          if (!assistantContent && data.output_text) {
            assistantContent = data.output_text;
          }
          
          tokenCount = data.usage?.output_tokens || assistantContent.split(/\s+/).length;
          
          // Note: Don't store reasoning in responsesApiMessages as it shouldn't be sent back
          
          // Handle built-in image generation in non-streaming
          const imageGenCall = data.output?.find((i: any) => i.type === 'image_generation_call');
          if (imageGenCall?.result) {
            const imageData = imageGenCall.result.startsWith('data:') ? imageGenCall.result : `data:image/png;base64,${imageGenCall.result}`;
            assistantContent = imageGenCall.revised_prompt || 'Generated image';
            
            const imageMsg: Message = {
              id: uuidv4(),
              role: 'assistant',
              content: assistantContent,
              images: [imageData],
              timestamp: Date.now(),
              model: model?.id,
              tokens: tokenCount,
            };
            addMessage(convId, imageMsg);
            setIsGenerating(false);
            return; // Exit early
          }
        }
      } else if (settings.modelSettings.stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.trim()) continue;
            if (line.startsWith('event:')) continue;
            if (!line.startsWith('data:')) continue;

            let data = line.slice(line.indexOf('data:') + 6).trim();
            const doneSentinel = activeApiFormat.streamingDoneSentinel ?? '[DONE]';
            if (data === doneSentinel) continue;
            // Also handle JSON-encoded sentinel (e.g. Anthropic's {"type":"message_stop"})
            try { if (JSON.parse(data)?.type === doneSentinel) continue; } catch { /* not JSON */ }
            
            // Decode HTML entities comprehensively
            data = data
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'")
              .replace(/&apos;/g, "'");
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.choices?.[0]?.finish_reason === 'error') {
                throw new Error(parsed.error || 'Stream error');
              }
              const delta = activeApiFormat.streamingChunkPath
                ? getByPath(parsed, activeApiFormat.streamingChunkPath)
                : (parsed.choices?.[0]?.delta?.content || '');
              assistantContent += delta;
              setStreamingContent(assistantContent);
              if (delta) tokenCount++;
              
              // Handle streaming tool calls
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                for (const tc of parsed.choices[0].delta.tool_calls) {
                  const existing = toolCallsMap.get(tc.index);
                  if (!existing) {
                    toolCallsMap.set(tc.index, {
                      id: tc.id || '',
                      type: tc.type || 'function',
                      function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' }
                    });
                  } else {
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  }
                }
              }
              if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                toolCallsMap.set(parsed.index, {
                  id: parsed.content_block.id,
                  type: 'function',
                  function: { name: parsed.content_block.name, arguments: '' },
                  fcid: parsed.content_block.id,
                });
              }
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
                const call = toolCallsMap.get(parsed.index);
                if (call) call.function.arguments += parsed.delta.partial_json;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && !parseErr.message.includes('JSON')) {
                throw parseErr;
              }
            }
          }
        }
        toolCalls = Array.from(toolCallsMap.values());
      } else {
        const data = await response.json();
        assistantContent = activeApiFormat.responseTextPath
          ? getByPath(data, activeApiFormat.responseTextPath)
          : (data.choices?.[0]?.message?.content || '');
        toolCalls = data.choices?.[0]?.message?.tool_calls || [];
        tokenCount = data.usage?.completion_tokens || assistantContent.split(/\s+/).length;
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = tokenCount > 0 ? Math.round(tokenCount / duration) : undefined;

      // Check if message requests another tool call
      const requestsAnotherTool = /\{"status"\s*:\s*"request_another_tool"\}\s*$/.test(assistantContent);
      const isStep = /\{"status"\s*:\s*"step"\}(\s*\{"status"\s*:\s*"request_another_tool"\})?\s*$/.test(assistantContent);

      const assistantMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
        model: model?.id,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        tokens: tokenCount > 0 ? tokenCount : undefined,
        tokensPerSecond,
        isStep,
        requestsAnotherTool,
      };
      
      // Only add message if there's content or if there are no tool calls
      if (assistantContent || toolCalls.length === 0) {
        addMessage(convId, assistantMsg);
      }

      // Auto-generate title and follow-ups after state updates
      const shouldGenerateTitle = settings.generateTitle !== false;
      const shouldGenerateFollowUps = settings.generateFollowUps !== false && !toolCalls.length;
      
      if (shouldGenerateTitle || shouldGenerateFollowUps) {
        setTimeout(() => {
          const conv = conversations.find(c => c.id === convId);
          if (!conv) return;
          
          if (shouldGenerateTitle) {
            const assistantMessages = conv.messages.filter(m => m.role === 'assistant' && !m.tool_calls);
            if (assistantMessages.length === 1) {
              generateConversationTitle(convId, provider, model);
            }
          }
          
          if (shouldGenerateFollowUps) {
            generateFollowUps(convId, assistantMsg.id, provider, model);
          }
        }, 500);
      }

      // Execute tool calls if present
      if (toolCalls.length > 0) {
        const functionCallItems = toolCalls.map(tc => ({
          type: 'function_call',
          id: tc.fc_id || tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
          call_id: tc.id,
          status: 'completed'
        }));
        const isAnthropicFormat = activeApiFormat?.id === 'anthropic';
      const messagesToPass = useResponsesApi
        ? [...responsesApiMessages, { type: 'message', role: 'assistant', content: assistantContent || '' }, ...functionCallItems]
        : isAnthropicFormat
          ? [...apiMessages,
              { role: 'assistant', content: toolCalls.map((tc: any) => ({ type: 'tool_use', id: tc.id, name: tc.function.name, input: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })() })) }
            ]
          : [...apiMessages, { role: 'assistant', content: assistantContent || '', tool_calls: toolCalls }];
        await executeToolCalls(toolCalls, convId, provider, model, chatUrl, headers, requestBody, messagesToPass, useResponsesApi);
      } else if (requestsAnotherTool) {
        // Request another tool call
        setTimeout(async () => {
          try {
            const continuationMessages = useResponsesApi ? [
              ...responsesApiMessages,
              { type: 'message', role: 'assistant', content: assistantContent },
              { type: 'message', role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }
            ] : [
              ...apiMessages,
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }
            ];
            
            const continuationBody = useResponsesApi ? {
              model: model?.id || 'gpt-4o',
              input: continuationMessages,
              store: false,
              stream: settings.modelSettings.stream,
              //temperature: settings.modelSettings.temperature,
              top_p: settings.modelSettings.topP,
              frequency_penalty: settings.modelSettings.frequencyPenalty,
              presence_penalty: settings.modelSettings.presencePenalty,
              tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration, buildMode),
              tool_choice: 'auto',
              ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? {
                reasoning: { effort: settings.modelSettings.reasoningEffort }
              } : {}),
            } : { ...requestBody, messages: continuationMessages, stream: settings.modelSettings.stream };
            
            const continuationResponse = await fetchWithRetry(chatUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(continuationBody),
            });
            
            if (continuationResponse.ok) {
              await handleContinuationResponse(continuationResponse, convId, provider, model, chatUrl, headers, requestBody, continuationMessages, useResponsesApi);
            }
          } catch (err) {
            console.error('Continuation request failed:', err);
          }
        }, 100);
      }
    } catch (err: unknown) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
        isError: true,
      };
      addMessage(convId, errorMsg);
    } finally {
      setIsGenerating(false);
      setStreamingContent('');
      setAbortController(null);
    }
  }, [conversations, settings, getProviderAndModel, addMessage]);

  const stopGeneration = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsGenerating(false);
      setStreamingContent('');
    }
  }, [abortController]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const updateModelSettings = useCallback((patch: Partial<ModelSettings>) => {
    setSettings(prev => ({
      ...prev,
      modelSettings: { ...prev.modelSettings, ...patch },
    }));
  }, []);

  const updateProvider = useCallback((id: string, patch: Partial<ModelProvider>) => {
    setSettings(prev => ({
      ...prev,
      providers: prev.providers.map(p => p.id === id ? { ...p, ...patch } : p),
    }));
  }, []);

  const addIntegratedProvider = useCallback((template: IntegratedProviderTemplate) => {
    const newProvider: ModelProvider = {
      id: template.id,
      name: template.name,
      baseUrl: template.baseUrlTemplate,
      apiKey: template.requireAuth ? '' : 'none',
      enabled: false,
      models: template.defaultModels,
      isIntegrated: true,
      customFieldValues: {},
      apiFormatId: template.id === 'anthropic' ? 'anthropic' : undefined,
    };
    setSettings(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
  }, []);

  const addProvider = useCallback(() => {
    const id = uuidv4();
    const newProvider: ModelProvider = {
      id,
      name: 'New Provider',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      enabled: true,
      models: [{ id: 'model-id', name: 'Model Name', contextLength: 4096, supportsImages: false, supportsStreaming: true }],
    };
    setSettings(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
  }, []);

  const deleteProvider = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      providers: prev.providers.filter(p => p.id !== id),
    }));
  }, []);

  const upsertApiFormat = useCallback((fmt: import('../types').ProviderApiFormat) => {
    setSettings(prev => {
      const existing = prev.apiFormats || [];
      const idx = existing.findIndex(f => f.id === fmt.id);
      const next = idx >= 0
        ? existing.map((f, i) => i === idx ? fmt : f)
        : [...existing, fmt];
      return { ...prev, apiFormats: next };
    });
  }, []);

  const deleteApiFormat = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      apiFormats: (prev.apiFormats || []).filter(f => f.id !== id),
    }));
  }, []);

  const setConversationModel = useCallback((convId: string, modelId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, modelId } : c));
  }, []);

  const deleteLastMessage = useCallback((convId: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const messages = c.messages.slice(0, -1);
      return { ...c, messages, updatedAt: Date.now() };
    }));
  }, []);

  const editMessage = useCallback((convId: string, msgId: string, newContent: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const messages = c.messages.map(m => m.id === msgId ? { ...m, content: newContent } : m);
      return { ...c, messages, updatedAt: Date.now() };
    }));
  }, []);

  const deleteMessagesFrom = useCallback((convId: string, msgId: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const idx = c.messages.findIndex(m => m.id === msgId);
      if (idx === -1) return c;
      const messages = c.messages.slice(0, idx);
      return { ...c, messages, updatedAt: Date.now() };
    }));
  }, []);

  const updateMessageVersions = useCallback((convId: string, msgId: string, versions: Message[], currentVersionIndex: number) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const messages = c.messages.map(m => {
        if (m.id === msgId) {
          // If versions array is provided, update it; otherwise just update the index
          if (versions.length > 0) {
            return { ...m, versions, currentVersionIndex };
          } else {
            return { ...m, currentVersionIndex };
          }
        }
        return m;
      });
      return { ...c, messages, updatedAt: Date.now() };
    }));
  }, []);

  const setConversationMode = useCallback((convId: string, mode: 'chat' | 'image') => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, mode } : c));
  }, []);

  const setConversationAttachments = useCallback((convId: string, attachments: string[]) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, attachments } : c));
  }, []);

  const setBuildMode = useCallback((convId: string, buildMode: boolean) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, buildMode } : c));
  }, []);

  const generateConversationTitle = useCallback(async (convId: string, provider: ModelProvider, model: ModelConfig | undefined) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || !provider || !model) return;

    try {
      const chatUrl = provider.baseUrl.includes('/chat/completions') 
        ? provider.baseUrl 
        : `${provider.baseUrl}/chat/completions`;
      
      const messages = conv.messages.filter(m => m.role !== 'tool').map(m => ({
        role: m.role,
        content: m.content
      }));
      messages.push({
        role: 'user',
        content: 'Based on the conversation history, generate a Chat Title for this conversation. Reply only with the chat title and nothing else. markdown is not supported'
      });

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: model.id,
          messages,
          //temperature: 0.7,
          //max_tokens: 50,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const title = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || 'New conversation';
        updateConversationTitle(convId, title);
      }
    } catch (err) {
      console.error('Failed to generate title:', err);
    }
  }, [conversations, updateConversationTitle]);

  const generateFollowUps = useCallback(async (convId: string, msgId: string, provider: ModelProvider, model: ModelConfig | undefined) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || !provider || !model) return;

    try {
      const chatUrl = provider.baseUrl.includes('/chat/completions') 
        ? provider.baseUrl 
        : `${provider.baseUrl}/chat/completions`;
      
      const messages = conv.messages.filter(m => m.role !== 'tool').map(m => ({
        role: m.role,
        content: m.content
      }));
      messages.push({
        role: 'user',
        content: 'Based on the conversation history, generate atmost 3 follow up questions. Markdown is not supported. dont warp in ```json I want questions that the user would ask, not the assistant ai. in a JSON list like this ["followup1", "followup2", "followup3"]. Under 3 is fine. but do not include over 3. Don\'t include anything else in your message other than the json list'
      });

      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: model.id,
          messages,
          //temperature: 0.8,
          //max_tokens: 150,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';
        try {
          const followUps = JSON.parse(content).slice(0, 3);
          setConversations(prev => prev.map(c => {
            if (c.id !== convId) return c;
            return {
              ...c,
              messages: c.messages.map(m => 
                m.id === msgId ? { ...m, followUps } : m
              )
            };
          }));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to generate follow-ups:', err);
    }
  }, [conversations]);

  const generateImage = useCallback(async (prompt: string, convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    const { provider } = getProviderAndModel(conv.modelId || settings.defaultProviderModelId);
    if (!provider) return;

    const userMsg: Message = { id: uuidv4(), role: 'user', content: prompt, timestamp: Date.now() };
    addMessage(convId, userMsg);
    setIsGenerating(true);

    try {
      const useResponsesApi = settings.modelSettings.useResponsesApi;
      
      if (useResponsesApi) {
        // Use responses API for image generation
        const responsesUrl = provider.baseUrl.includes('/responses')
          ? provider.baseUrl
          : `${provider.baseUrl}/responses`;
        
        // Build input array - include previous image call if exists
        const input: any[] = [];
        
        // Find the most recent image generation call for follow-up edits
        const recentMessages = conv.messages.slice().reverse();
        const lastImageMsg = recentMessages.find(m => m.imageGenerationCall);
        
        // Build user message content with image attachment if editing
        const userContent: any[] = [{ type: 'input_text', text: prompt }];
        
        if (lastImageMsg?.imageGenerationCall?.result?.image_data) {
          const imageData = lastImageMsg.imageGenerationCall.result.image_data;
          userContent.push({ 
            type: 'input_image', 
            image_url: imageData.startsWith('data:') || imageData.startsWith('http') ? imageData : `data:image/png;base64,${imageData}`
          });
        }
        
        input.push({ type: 'message', role: 'user', content: userContent });
        
        const response = await fetch(responsesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.imageGenerationModel || 'gpt-image-1.5',
            input,
            tools: [{ 
              type: 'image_generation',
              action: lastImageMsg?.imageGenerationCall ? 'auto' : 'auto', // auto decides between generate/edit
              quality: 'high'
            }],
            tool_choice: 'auto',
            store: false
          }),
        });

        if (!response.ok) throw new Error('Image generation failed');
        const data = await response.json();
        
        // Find image generation call in output
        const imageCall = data.output?.find((item: any) => item.image_generation_call);
        if (!imageCall?.image_generation_call?.result?.image_data) {
          throw new Error('No image data in response');
        }
        
        const imageData = imageCall.image_generation_call.result.image_data;
        const imageUrl = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
        
        const assistantMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: lastImageMsg?.imageGenerationCall 
            ? `Edited image: "${prompt}"`
            : `Generated image for: "${prompt}"`,
          images: [imageUrl],
          timestamp: Date.now(),
          imageGenerationCall: imageCall, // Store for future edits
        };
        addMessage(convId, assistantMsg);
      } else {
        // Use legacy images/generations endpoint
        const imageUrl = provider.baseUrl.includes('/images/generations')
          ? provider.baseUrl
          : `${provider.baseUrl}/images/generations`;
        const response = await fetch(imageUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({ prompt, n: 1, size: '1024x1024' }),
        });

        if (!response.ok) throw new Error('Image generation failed');
        const data = await response.json();
        const imageData = data.data?.[0]?.url || data.data?.[0]?.b64_json;
        
        const assistantMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: `Generated image for: "${prompt}"`,
          images: [imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`],
          timestamp: Date.now(),
        };
        addMessage(convId, assistantMsg);
      }
    } catch (err: unknown) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
        isError: true,
      };
      addMessage(convId, errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [conversations, settings, getProviderAndModel, addMessage]);

  const setConversationDevEnvSession = useCallback((convId: string, sessionId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, devEnvSession: sessionId } : c));
  }, []);

  const allProviderModels = settings.providers
    .filter(p => p.enabled)
    .flatMap(p => p.models.map(m => ({ ...m, providerId: p.id, providerName: p.name, fullId: `${p.id}/${m.id}` })));

  const transcribeAudio = useCallback(async (blob: Blob, mimeType: string): Promise<string> => {
    // Find the provider that matches the configured STT base URL, or fall back to first enabled
    const sttUrl = settings.sttBaseUrl;
    const provider = sttUrl
      ? settings.providers.find(p => p.enabled && p.baseUrl.replace(/\/$/, '') === sttUrl.replace(/\/$/, ''))
        ?? settings.providers.find(p => p.enabled)
      : settings.providers.find(p => p.enabled);
    if (!provider) throw new Error('No enabled provider found');
    let baseUrl = sttUrl || provider.baseUrl;
    baseUrl = baseUrl
      .replace(/\/chat\/completions\/?$/, '')
      .replace(/\/responses\/?$/, '')
      .replace(/\/$/, '');
    const model = settings.sttModel || 'gpt-4o-transcribe';
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const formData = new FormData();
    formData.append('file', blob, `recording.${ext}`);
    formData.append('model', model);
    console.log('[STT] POST', `${baseUrl}/audio/transcriptions`, 'model:', model, 'blob size:', blob.size, 'ext:', ext);
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Transcription failed ${res.status}: ${errText}`);
    }
    const data = await res.json();
    console.log('[STT] response:', data);
    return data.text || '';
  }, [settings]);

  return {
    conversations,
    activeConvId,
    activeConversation,
    settings,
    isGenerating,
    streamingContent,
    allProviderModels,
    setActiveConvId,
    newConversation,
    deleteConversation,
    updateConversationTitle,
    sendMessage,
    updateSettings,
    updateModelSettings,
    updateProvider,
    addIntegratedProvider,
    addProvider,
    deleteProvider,
    upsertApiFormat,
    deleteApiFormat,
    setConversationModel,
    deleteLastMessage,
    editMessage,
    deleteMessagesFrom,
    updateMessageVersions,
    setConversationMode,
    setConversationAttachments,
    setBuildMode,
    generateImage,
    stopGeneration,
    generateConversationTitle,
    generateFollowUps,
    getProviderAndModel,
    setConversationDevEnvSession,
    transcribeAudio,
    storageQuotaExceeded,
    resolveStorageQuota,
  };
}
