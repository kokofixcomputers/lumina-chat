import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message, AppSettings, ModelProvider, ModelSettings } from '../types';
import type { IntegratedProviderTemplate } from '../data/integratedProviders';
import { getToolDefinitions, getToolByName } from '../tools';

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
    systemPrompt: 'You are a helpful assistant with access to tools. To execute another tool after you just completed one tool, include {"status": "request_another_tool"} at the bottom of your message. Do not say i will complete this in the next message or anything that requires another user input, instead, just leave {"status": "request_another_tool"} at the bottom of your message to have the client give you another tool call.',
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
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded. Consider clearing old conversations.');
    }
  }
}

export function useAppStore() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadFromStorage('lumina_conversations', [])
  );
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  
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
    saveToStorage('lumina_conversations', conversations);
  }, [conversations]);

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
    const [providerId, modelId] = providerModelId.split('/');
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
        const response = await fetch(url, options);
        
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
      previousMessages: any[]
    ) => {
      let assistantContent = '';
      let toolCalls: any[] = [];
      const toolCallsMap = new Map<number, any>();
      let tokenCount = 0;
      const startTime = Date.now();

      if (settings.modelSettings.stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.trim().startsWith('data: '));
          for (const line of lines) {
            let data = line.slice(line.indexOf('data: ') + 6).trim();
            if (data === '[DONE]') continue;
            
            data = data.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
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

      const requestsAnotherTool = assistantContent.includes('"status": "request_another_tool"') || 
                                   assistantContent.includes('"status":"request_another_tool"');
      const isStep = requestsAnotherTool || toolCalls.length > 0;

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

      // Execute tool calls if present
      if (toolCalls.length > 0) {
        await executeToolCalls(toolCalls, convId, provider, model, chatUrl, headers, requestBody, [...previousMessages, { role: 'assistant', content: assistantContent || null, tool_calls: toolCalls }]);
      } else if (requestsAnotherTool) {
        // Request another tool call
        setTimeout(async () => {
          try {
            const continuationMessages = [
              ...previousMessages,
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }
            ];
            
            const continuationResponse = await fetchWithRetry(chatUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ ...requestBody, messages: continuationMessages }),
            });
            
            if (continuationResponse.ok) {
              await handleContinuationResponse(continuationResponse, convId, provider, model, chatUrl, headers, requestBody, continuationMessages);
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
      previousMessages: any[]
    ) => {
      const toolMessages: any[] = [];
      
      for (const toolCall of toolCalls) {
        const tool = getToolByName(toolCall.function.name);
        
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
                  
                  toolMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ success: true, description: result.prompt })
                  });
                } else {
                  throw new Error('Image generation failed');
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
              
              toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ success: true, file: result.original_path, url: result.url })
              });
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
                
                return { ...c, ...updates };
              }));
              
              toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
              });
            }
          } catch (toolErr) {
            setConversations(prev => prev.map(c => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: c.messages.map(m => 
                  m.id === loadingMsgId 
                    ? { ...m, content: toolErr instanceof Error ? toolErr.message : String(toolErr), tool_status: 'error' as const }
                    : m
                )
              };
            }));
          }
        } else {
          setConversations(prev => prev.map(c => {
            if (c.id !== convId) return c;
            return {
              ...c,
              messages: c.messages.map(m => 
                m.id === loadingMsgId 
                  ? { ...m, content: `Tool "${toolCall.function.name}" not found`, tool_status: 'error' as const }
                  : m
              )
            };
          }));
        }
      }
      
      // Send tool results back to AI
      if (toolMessages.length > 0) {
        try {
          const followUpResponse = await fetchWithRetry(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...requestBody, messages: [...previousMessages, ...toolMessages], tools: undefined }),
          });
          
          if (followUpResponse.ok) {
            await handleContinuationResponse(followUpResponse, convId, provider, model, chatUrl, headers, requestBody, [...previousMessages, ...toolMessages]);
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
    const apiMessages: Array<{ role: string; content: unknown }> = [];

    if (settings.modelSettings.systemPrompt) {
      apiMessages.push({ role: 'system', content: settings.modelSettings.systemPrompt });
    }

    const allMessages = [...(conv.messages), userMsg];
    
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
            parts.push({ type: 'image_url', image_url: { url: img } });
          } else {
            parts.push({ type: 'text', text: `[Attached file content]:\n${img}` });
          }
        });
        parts.push({ type: 'text', text: m.content });
        apiMessages.push({ role: m.role, content: parts });
      } else {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const requestBody = {
      model: model?.id || 'gpt-4o',
      messages: apiMessages,
      temperature: settings.modelSettings.temperature,
      //max_tokens: settings.modelSettings.maxTokens,
      top_p: settings.modelSettings.topP,
      frequency_penalty: settings.modelSettings.frequencyPenalty,
      presence_penalty: settings.modelSettings.presencePenalty,
      stream: settings.modelSettings.stream,
      tools: getToolDefinitions(settings.allowImageGeneration),
    };

    try {
      const chatUrl = provider.baseUrl.includes('/chat/completions') 
        ? provider.baseUrl 
        : `${provider.baseUrl}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      };
      if (settings.serpApiKey) {
        headers['x-serpapi-key'] = settings.serpApiKey;
      }
      const response = await fetchWithRetry(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(err.error?.message || `API error: ${response.status}`);
      }

      let assistantContent = '';
      let toolCalls: any[] = [];
      const toolCallsMap = new Map<number, any>();

      if (settings.modelSettings.stream) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.trim().startsWith('data: '));
          for (const line of lines) {
            let data = line.slice(line.indexOf('data: ') + 6).trim();
            if (data === '[DONE]') continue;
            
            // Decode HTML entities
            data = data.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.choices?.[0]?.finish_reason === 'error') {
                throw new Error(parsed.error || 'Stream error');
              }
              const delta = parsed.choices?.[0]?.delta?.content || '';
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
        assistantContent = data.choices?.[0]?.message?.content || '';
        toolCalls = data.choices?.[0]?.message?.tool_calls || [];
        tokenCount = data.usage?.completion_tokens || assistantContent.split(/\s+/).length;
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = tokenCount > 0 ? Math.round(tokenCount / duration) : undefined;

      // Check if message requests another tool call
      const requestsAnotherTool = assistantContent.includes('"status": "request_another_tool"') || 
                                   assistantContent.includes('"status":"request_another_tool"');
      const isStep = requestsAnotherTool || toolCalls.length > 0;

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
        await executeToolCalls(toolCalls, convId, provider, model, chatUrl, headers, requestBody, [...apiMessages, { role: 'assistant', content: assistantContent || null, tool_calls: toolCalls }]);
      } else if (requestsAnotherTool) {
        // Request another tool call
        setTimeout(async () => {
          try {
            const continuationMessages = [
              ...apiMessages,
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }
            ];
            
            const continuationResponse = await fetchWithRetry(chatUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ ...requestBody, messages: continuationMessages }),
            });
            
            if (continuationResponse.ok) {
              await handleContinuationResponse(continuationResponse, convId, provider, model, chatUrl, headers, requestBody, continuationMessages);
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

  const setConversationMode = useCallback((convId: string, mode: 'chat' | 'image') => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, mode } : c));
  }, []);

  const setConversationAttachments = useCallback((convId: string, attachments: string[]) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, attachments } : c));
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
          temperature: 0.7,
          max_tokens: 50,
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
          temperature: 0.8,
          max_tokens: 150,
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
    setConversationModel,
    deleteLastMessage,
    editMessage,
    deleteMessagesFrom,
    setConversationMode,
    setConversationAttachments,
    generateImage,
    stopGeneration,
    generateConversationTitle,
    generateFollowUps,
    getProviderAndModel,
    setConversationDevEnvSession,
  };
}
