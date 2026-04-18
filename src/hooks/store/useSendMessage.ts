import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message, AppSettings, ModelProvider, ModelConfig } from '../../types';
import { getToolDefinitions, getToolByName, getToolDefinitionsForResponsesApi } from '../../tools';
import { fetchWithProxyFallback } from '../../utils/proxyFetch';
import { resolveFormat, applyVars, getByPath } from '../../components/ProvidersPanel';
import { writeToVfs } from '../../tools/buildFs';

interface SendMessageOptions {
  conversations: Conversation[];
  conversationsRef: React.MutableRefObject<Conversation[]>;
  settings: AppSettings;
  getProviderAndModel: (id: string) => { provider: ModelProvider | undefined; model: ModelConfig | undefined };
  addMessage: (convId: string, msg: Message) => void;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  updateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  generateConversationTitle: (convId: string, provider: ModelProvider, model: ModelConfig | undefined) => Promise<void>;
  generateFollowUps: (convId: string, msgId: string, provider: ModelProvider, model: ModelConfig | undefined) => Promise<void>;
  setIsGenerating: (v: boolean) => void;
}

export function useSendMessage({
  conversations,
  conversationsRef,
  settings,
  getProviderAndModel,
  addMessage,
  setConversations,
  updateProvider,
  generateConversationTitle,
  generateFollowUps,
  setIsGenerating,
}: SendMessageOptions) {
  const [streamingContent, setStreamingContent] = useState('');
  const streamingContentRef = useRef('');
  const streamingActiveRef = useRef(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const updateStreaming = (text: string) => {
    streamingContentRef.current = text;
    if (!streamingActiveRef.current) {
      streamingActiveRef.current = true;
      setStreamingContent(text); // one setState to show the bubble
    }
  };
  const clearStreaming = () => {
    streamingContentRef.current = '';
    streamingActiveRef.current = false;
  };

  const stopGeneration = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsGenerating(false);
      clearStreaming();
    }
  }, [abortController, setIsGenerating]);

  const sendMessage = useCallback(async (content: string, images: string[], convId: string) => {
    // ── rate-limit helper ──────────────────────────────────────────────────────
    const handleRateLimit = async (headers: Headers): Promise<void> => {
      const raw = headers.get('x-ratelimit-reset-requests') || headers.get('x-ratelimit-reset-tokens');
      let waitTime = 1000;
      if (raw) {
        const m = raw.match(/(\d+)(ms|s|m)/);
        if (m) {
          const v = parseInt(m[1]);
          waitTime = m[2] === 'ms' ? v : m[2] === 's' ? v * 1000 : v * 60000;
        }
      }
      return new Promise(resolve => setTimeout(resolve, waitTime + 100));
    };

    // ── find / create conversation ─────────────────────────────────────────────
    let conv = conversations.find(c => c.id === convId);
    if (!conv) {
      const newConv: Conversation = {
        id: convId,
        title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(),
        modelId: settings.defaultProviderModelId,
      };
      setConversations(prev => prev.find(c => c.id === convId) ? prev : [newConv, ...prev]);
      conv = newConv;
    }

    const { provider, model } = getProviderAndModel(conv.modelId || settings.defaultProviderModelId);
    if (!provider) return;

    const userMsg: Message = { id: uuidv4(), role: 'user', content, images: images.length ? images : undefined, timestamp: Date.now() };
    addMessage(convId, userMsg);
    setIsGenerating(true);
    clearStreaming();

    const controller = new AbortController();
    setAbortController(controller);
    const startTime = Date.now();
    let tokenCount = 0;

    // ── resolve format ─────────────────────────────────────────────────────────
    const activeApiFormat = resolveFormat(settings.apiFormats || [], provider.apiFormatId);
    const buildMode = !!conv.buildMode;
    const isAnthropicFormat = activeApiFormat?.id === 'anthropic';

    // Download a file from Anthropic Files API and return as data URL
    const downloadAnthropicFile = async (fileId: string): Promise<{ dataUrl: string; filename: string } | null> => {
      try {
        const baseUrl = provider.baseUrl.replace(/\/$/, '');
        const authHeaders = { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'files-api-2025-04-14' };

        // Get filename from metadata
        const metaRes = await fetchWithProxyFallback(
          `${baseUrl}/files/${fileId}`,
          { headers: authHeaders },
          !!provider.useProxy, undefined, provider.proxyMode,
        );
        const meta = metaRes.ok ? await metaRes.json() : {};
        const filename: string = meta.filename || fileId;

        // Download file content
        const contentRes = await fetchWithProxyFallback(
          `${baseUrl}/files/${fileId}/content`,
          { headers: authHeaders },
          !!provider.useProxy, undefined, provider.proxyMode,
        );
        if (!contentRes.ok) return null;
        const blob = await contentRes.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve({ dataUrl: reader.result as string, filename });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    };

    // ── fetch with retry ───────────────────────────────────────────────────────
    const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetchWithProxyFallback(url, options, !!provider?.useProxy,
          () => { if (provider) updateProvider(provider.id, { useProxy: true }); },
          provider?.proxyMode,
        );
        if (response.status !== 429) return response;
        const waitTimeStr = response.headers.get('x-ratelimit-reset-requests') || response.headers.get('x-ratelimit-reset-tokens') || '1s';
        const rateLimitMsg: Message = { id: uuidv4(), role: 'assistant', content: `⏳ Rate limit reached. Retrying in ${waitTimeStr}... (Attempt ${attempt + 1}/${maxRetries})`, timestamp: Date.now(), isError: false };
        const msgId = rateLimitMsg.id;
        addMessage(convId, rateLimitMsg);
        if (attempt < maxRetries - 1) {
          await handleRateLimit(response.headers);
          setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.filter(m => m.id !== msgId) }));
        } else {
          setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, content: '❌ Rate limit exceeded. Please try again in a moment.', isError: true } : m) }));
          throw new Error('Rate limit exceeded after retries');
        }
      }
      throw new Error('Max retries exceeded');
    };

    // ── build message history ──────────────────────────────────────────────────
    const apiMessages: Array<{ type?: string; role: string; content: unknown; tool_call_id?: string; tool_calls?: any[] }> = [];
    const responsesApiMessages: Array<{ type?: string; role: string; content: unknown; tool_call_id?: string }> = [];

    if (settings.modelSettings.systemPrompt) {
      let systemPrompt = settings.modelSettings.systemPrompt;
      if (settings.memoriesEnabled && settings.memories && settings.memories.length > 0) {
        systemPrompt += `\n\n## Memories about the user\nThe following facts have been saved about the user. Use them to personalize responses:\n${settings.memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nWhen you learn new important facts (timezone, preferences, name, etc.), save them with memory_save.`;
      } else if (settings.memoriesEnabled) {
        systemPrompt += `\n\nMemories are enabled. When you learn important facts about the user (timezone, location, preferred languages, name, etc.), save them with memory_save so you can recall them in future conversations.`;
      }
      apiMessages.push({ role: 'system', content: systemPrompt });
      responsesApiMessages.push({ type: 'message', role: 'system', content: systemPrompt });
    }

    const currentConv = conversationsRef.current.find(c => c.id === convId);
    const allMessages = [...(currentConv?.messages || []), userMsg];
    const limitedMessages = allMessages.slice(-(settings.maxHistory || 10));

    for (const m of limitedMessages) {
      if (m.role === 'tool') {
        if (isAnthropicFormat) {
          // Claude requires tool results as role: "user" with a tool_result content block
          apiMessages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: m.tool_call_id || '', content: m.content }],
          });
        } else {
          apiMessages.push({ role: 'tool', tool_call_id: m.tool_call_id || '', content: m.content });
        }
        responsesApiMessages.push({ type: 'function_call_output', call_id: m.tool_call_id || '', output: m.content } as any);
        continue;
      }
      if (m.images && m.images.length > 0) {
        const parts: unknown[] = [];
        m.images.forEach(img => {
          if (img.startsWith('data:image/')) parts.push({ type: 'input_image', image_url: img });
          else parts.push({ type: 'input_text', text: `[Attached file content]:\n${img}` });
        });
        parts.push({ type: 'input_text', text: m.content });
        apiMessages.push({ role: m.role, content: parts });
        if (m.role === 'user') responsesApiMessages.push({ type: 'message', role: m.role, content: parts });
        else responsesApiMessages.push({ type: 'message', role: m.role, content: m.content });
      } else {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_calls && m.tool_calls.length > 0) {
          if (isAnthropicFormat) {
            // Claude: tool calls go in content array, not tool_calls field
            msg.content = m.tool_calls.map((tc: any) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })(),
            }));
          } else {
            msg.tool_calls = m.tool_calls;  // OpenAI style
          }
        }
        apiMessages.push(msg);
        responsesApiMessages.push({ type: 'message', role: m.role, content: m.content });
      }
    }

    // ── build request bodies ───────────────────────────────────────────────────
    const systemMessage = apiMessages.find(m => m.role === 'system');
    const nonSystemMessages = apiMessages.filter(m => m.role !== 'system');
    const rawTools = getToolDefinitions(settings.allowImageGeneration, buildMode);
    const anthropicTools = rawTools.map((t: any) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));

    const requestBody = {
      model: model?.id || 'gpt-4o',
      messages: apiMessages,
      top_p: settings.modelSettings.topP,
      frequency_penalty: settings.modelSettings.frequencyPenalty,
      presence_penalty: settings.modelSettings.presencePenalty,
      stream: settings.modelSettings.stream,
      tools: getToolDefinitions(settings.allowImageGeneration, buildMode),
    };

    const useResponsesApi = settings.modelSettings.useResponsesApi;
    const responsesApiBody = useResponsesApi ? {
      model: model?.id || 'gpt-4o',
      input: responsesApiMessages,
      store: false,
      stream: settings.modelSettings.stream,
      top_p: settings.modelSettings.topP,
      frequency_penalty: settings.modelSettings.frequencyPenalty,
      presence_penalty: settings.modelSettings.presencePenalty,
      tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration, buildMode),
      tool_choice: 'auto',
      ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? { reasoning: { effort: settings.modelSettings.reasoningEffort } } : {}),
    } : null;

    const hasCustomTemplate = !!(activeApiFormat.requestBodyTemplate || activeApiFormat.streamingRequestBodyTemplate);

    const buildCustomBody = (streaming: boolean): string | null => {
      const template = streaming
        ? (activeApiFormat.streamingRequestBodyTemplate || activeApiFormat.requestBodyTemplate)
        : activeApiFormat.requestBodyTemplate;
      if (!template) return null;
      const vars: Record<string, unknown> = {
        messages: nonSystemMessages, system: systemMessage?.content ?? '',
        model: model?.id || 'gpt-4o', apiKey: provider.apiKey, stream: streaming,
        temperature: settings.modelSettings.temperature, maxTokens: settings.modelSettings.maxTokens,
        topP: settings.modelSettings.topP, tools: anthropicTools,
        ...(activeApiFormat.customVars || {}),
      };
      return applyVars(template, vars);
    };

    // ── SSE streaming parser helper ────────────────────────────────────────────
    const parseSseChunk = (data: string, toolCallsMap: Map<number | string, any>): { delta: string; toolCallsMap: Map<number | string, any> } => {
      let delta = '';
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.choices?.[0]?.finish_reason === 'error') throw new Error('Stream error');
        delta = (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta')
          ? ''
          : activeApiFormat.streamingChunkPath
            ? (getByPath(parsed, activeApiFormat.streamingChunkPath) ?? '')
            : (parsed.choices?.[0]?.delta?.content ?? '');
        // OpenAI tool calls
        if (parsed.choices?.[0]?.delta?.tool_calls) {
          for (const tc of parsed.choices[0].delta.tool_calls) {
            const existing = toolCallsMap.get(tc.index);
            if (!existing) toolCallsMap.set(tc.index, { id: tc.id || '', type: tc.type || 'function', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } });
            else {
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name = tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }
        }
        // Anthropic tool calls
        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
          toolCallsMap.set(parsed.index, { id: parsed.content_block.id, type: 'function', function: { name: parsed.content_block.name, arguments: '' }, fcid: parsed.content_block.id });
        }
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
          const call = toolCallsMap.get(parsed.index);
          if (call) call.function.arguments += parsed.delta.partial_json;
        }
        // Anthropic code execution output text
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
          delta = parsed.delta.text;
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes('JSON')) throw e;
      }
      return { delta, toolCallsMap };
    };

    const decodeHtml = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

    const sentinel = activeApiFormat.streamingDoneSentinel ?? '[DONE]';
    const isSentinel = (data: string) => {
      if (data === sentinel) return true;
      try { return JSON.parse(data)?.type === sentinel; } catch { return false; }
    };

    // ── stream reader ──────────────────────────────────────────────────────────
    const readChatStream = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<{ content: string; toolCalls: any[]; codeExecFileIds: string[] }> => {
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      const toolCallsMap = new Map<number | string, any>();
      const codeExecFileIds: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim() || line.startsWith('event:')) continue;
          if (!line.startsWith('data:')) continue;
          const raw = decodeHtml(line.slice(line.indexOf('data:') + 6).trim());
          if (isSentinel(raw)) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'bash_code_execution_tool_result') {
              // Actual structure: content_block.content.content[].file_id
              const resultObj = parsed.content_block?.content;
              const items: any[] = Array.isArray(resultObj)
                ? resultObj
                : Array.isArray(resultObj?.content)
                  ? resultObj.content
                  : [];
              for (const item of items) {
                if (item.file_id) codeExecFileIds.push(item.file_id);
              }
            }
          } catch { /* ignore */ }
          const { delta } = parseSseChunk(raw, toolCallsMap);
          if (delta) { assistantContent += delta; updateStreaming(assistantContent); tokenCount++; }
        }
      }
      return { content: assistantContent, toolCalls: Array.from(toolCallsMap.values()), codeExecFileIds };
    };

    // ── responses API stream reader ────────────────────────────────────────────
    const readResponsesStream = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<{ content: string; toolCalls: any[] }> => {
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      const functionCallsMap = new Map<string, any>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim() || line.startsWith('event:') || !line.startsWith('data: ')) continue;
          const raw = decodeHtml(line.slice(6).trim());
          if (isSentinel(raw)) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'error' && parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
            if (parsed.type === 'response.failed' && parsed.response?.error) throw new Error(parsed.response.error.message || JSON.stringify(parsed.response.error));
            if (parsed.type === 'response.output_text.delta' && parsed.delta) { assistantContent += parsed.delta; updateStreaming(assistantContent); tokenCount++; }
            if (parsed.type === 'response.output_text.done' && parsed.text) { assistantContent = parsed.text; updateStreaming(assistantContent); }
            if (parsed.type === 'response.output_item.added' && parsed.item?.type === 'function_call') {
              functionCallsMap.set(parsed.item.id, { id: parsed.item.call_id, type: 'function', function: { name: parsed.item.name, arguments: '' }, fc_id: parsed.item.id });
            }
            if (parsed.type === 'response.function_call_arguments.delta' && parsed.delta) {
              const call = functionCallsMap.get(parsed.item_id);
              if (call) call.function.arguments += parsed.delta;
            }
            if (parsed.type === 'response.completed' && parsed.response?.usage) tokenCount = parsed.response.usage.output_tokens || tokenCount;
          } catch (e) { if (e instanceof Error && !e.message.includes('JSON')) throw e; }
        }
      }
      return { content: assistantContent, toolCalls: Array.from(functionCallsMap.values()) };
    };

    // ── tool message builder ───────────────────────────────────────────────────
    const makeToolMsg = (toolCallId: string, output: string, useResponsesApi: boolean) => {
      const isAnthropic = activeApiFormat?.id === 'anthropic';
      if (useResponsesApi) return { type: 'function_call_output', call_id: toolCallId, output };
      if (isAnthropic) return { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolCallId, content: output }] };
      return { role: 'tool', tool_call_id: toolCallId, content: output };
    };

    // ── execute tool calls ─────────────────────────────────────────────────────
    const executeToolCalls = async (
      toolCalls: any[], chatUrl: string, headers: Record<string, string>,
      previousMessages: any[], useResponsesApi: boolean,
    ) => {
      const toolMessages: any[] = [];
      const isAnthropic = activeApiFormat?.id === 'anthropic';

      for (const toolCall of toolCalls) {
        const tool = getToolByName(toolCall.function.name, buildMode);
        const loadingMsgId = uuidv4();
        addMessage(convId, { id: loadingMsgId, role: 'tool', content: '', timestamp: Date.now(), tool_call_id: toolCall.id, tool_name: toolCall.function.name, tool_status: 'loading' });

        if (!tool) {
          const err = `Tool "${toolCall.function.name}" not found`;
          setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === loadingMsgId ? { ...m, content: err, tool_status: 'error' as const } : m) }));
          toolMessages.push(makeToolMsg(toolCall.id, JSON.stringify({ error: err, success: false }), useResponsesApi));
          continue;
        }

        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          const result = await tool.execute(args);

          if (result._requiresImageGeneration && toolCall.function.name === 'generate_image') {
            // image generation via tool call
            try {
              const imgUrl = provider.baseUrl.includes('/images/generations') ? provider.baseUrl : `${provider.baseUrl}/images/generations`;
              const imgRes = await fetch(imgUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` }, body: JSON.stringify({ prompt: result.prompt, n: 1, size: result.size, model: settings.imageGenerationModel || 'dall-e-3' }) });
              if (!imgRes.ok) throw new Error('Image generation failed');
              const imgData = await imgRes.json();
              const imgSrc = imgData.data?.[0]?.url || imgData.data?.[0]?.b64_json;
              const imageData = imgSrc.startsWith('data:') ? imgSrc : imgSrc.startsWith('http') ? imgSrc : `data:image/png;base64,${imgSrc}`;
              setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === loadingMsgId ? { ...m, content: `Generated image: ${result.prompt}`, images: [imageData], tool_status: 'success' as const } : m) }));
              toolMessages.push(makeToolMsg(toolCall.id, JSON.stringify({ success: true, description: result.prompt }), useResponsesApi));
            } catch (imgErr) {
              const msg = imgErr instanceof Error ? imgErr.message : 'Image generation failed';
              setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === loadingMsgId ? { ...m, content: msg, tool_status: 'error' as const } : m) }));
            }
          } else if (result._isArtifact && toolCall.function.name === 'artifact_dev_env') {
            setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === loadingMsgId ? { ...m, content: result.message || `Artifact ready: ${result.original_path}`, artifacts: [{ url: result.url, direct_download: result.direct_download, original_path: result.original_path, file_hash: result.file_hash, message: result.message }], tool_status: 'success' as const } : m) }));
            toolMessages.push(makeToolMsg(toolCall.id, JSON.stringify({ success: true, file: result.original_path, url: result.url }), useResponsesApi));
          } else {
            setConversations(prev => prev.map(c => {
              if (c.id !== convId) return c;
              const messages = c.messages.map(m => m.id === loadingMsgId ? { ...m, content: JSON.stringify(result, null, 2), tool_status: 'success' as const } : m);
              const updates: any = { messages };
              if (toolCall.function.name === 'create_dev_env' && result.success && result.session) updates.devEnvSession = result.session;
              if (result._hotelSearchKey) updates.hotelSearchKey = result._hotelSearchKey;
              return { ...c, ...updates };
            }));
            toolMessages.push(makeToolMsg(toolCall.id, JSON.stringify(result), useResponsesApi));
          }
        } catch (toolErr) {
          const errorMessage = toolErr instanceof Error ? toolErr.message : String(toolErr);
          setConversations(prev => prev.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === loadingMsgId ? { ...m, content: errorMessage, tool_status: 'error' as const } : m) }));
          toolMessages.push(makeToolMsg(toolCall.id, JSON.stringify({ error: errorMessage, success: false }), useResponsesApi));
        }
      }

      if (toolMessages.length === 0) return;

      // Build follow-up body
      const isAnthropic2 = activeApiFormat?.id === 'anthropic';
      const followUpBody = useResponsesApi ? {
        model: model?.id || 'gpt-4o',
        input: [...previousMessages.filter((m: any) => m.type !== 'reasoning'), ...toolMessages],
        store: false, stream: settings.modelSettings.stream,
        top_p: settings.modelSettings.topP, frequency_penalty: settings.modelSettings.frequencyPenalty, presence_penalty: settings.modelSettings.presencePenalty,
        tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration, buildMode), tool_choice: 'auto',
        ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? { reasoning: { effort: settings.modelSettings.reasoningEffort } } : {}),
      } : isAnthropic2 ? (() => {
        const followUpMessages = [...previousMessages, ...toolMessages];
        const sysMsg = followUpMessages.find((m: any) => m.role === 'system');
        const nonSys = followUpMessages.filter((m: any) => m.role !== 'system');
        const vars: Record<string, unknown> = { messages: nonSys, system: sysMsg?.content ?? '', model: model?.id ?? '', apiKey: provider.apiKey, stream: settings.modelSettings.stream, temperature: settings.modelSettings.temperature, maxTokens: settings.modelSettings.maxTokens, topP: settings.modelSettings.topP, tools: anthropicTools, ...(activeApiFormat.customVars || {}) };
        const tmpl = settings.modelSettings.stream ? (activeApiFormat.streamingRequestBodyTemplate || activeApiFormat.requestBodyTemplate) : activeApiFormat.requestBodyTemplate;
        return tmpl ? JSON.parse(applyVars(tmpl, vars)) : { ...requestBody, messages: followUpMessages };
      })() : { ...requestBody, messages: [...previousMessages, ...toolMessages], stream: settings.modelSettings.stream, tools: getToolDefinitions(settings.allowImageGeneration, buildMode) };

      try {
        const followUpResponse = await fetchWithRetry(chatUrl, { method: 'POST', headers, body: JSON.stringify(followUpBody) });
        if (followUpResponse.ok) {
          await handleResponse(followUpResponse, chatUrl, headers, useResponsesApi ? [...previousMessages.filter((m: any) => m.type !== 'reasoning'), ...toolMessages] : [...previousMessages, ...toolMessages], useResponsesApi);
        }
      } catch (e) { console.error('Follow-up request failed:', e); }
    };

    // ── handle response (shared by main + continuation) ────────────────────────
    const handleResponse = async (
      response: Response, chatUrl: string, headers: Record<string, string>,
      previousMessages: any[], useResponsesApi: boolean,
    ) => {
      let assistantContent = '';
      let toolCalls: any[] = [];

      if (useResponsesApi && response.ok) {
        if (settings.modelSettings.stream) {
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');
          const result = await readResponsesStream(reader);
          assistantContent = result.content;
          toolCalls = result.toolCalls;
        } else {
          const data = await response.json();
          if (data.output) {
            for (const item of data.output) {
              if (item.type === 'message' && item.content) for (const ci of item.content) if (ci.type === 'output_text') assistantContent += ci.text || '';
              if (item.type === 'function_call') toolCalls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments }, fc_id: item.id });
            }
          }
          if (!assistantContent && data.output_text) assistantContent = data.output_text;
          tokenCount = data.usage?.output_tokens || assistantContent.split(/\s+/).length;
        }
      } else if (settings.modelSettings.stream) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        const result = await readChatStream(reader);
        assistantContent = result.content;
        toolCalls = result.toolCalls;
        // Download any files generated by code execution
        if (isAnthropicFormat && buildMode && result.codeExecFileIds.length > 0) {
          for (const fileId of result.codeExecFileIds) {
            const downloaded = await downloadAnthropicFile(fileId);
            if (downloaded) {
              const isImage = downloaded.dataUrl.startsWith('data:image/');
              // Save into VFS so it shows in the Files tab
              writeToVfs(convId, downloaded.filename, downloaded.dataUrl);
              addMessage(convId, {
                id: uuidv4(), role: 'tool', content: downloaded.filename,
                timestamp: Date.now(), tool_name: 'code_execution', tool_status: 'success',
                images: isImage ? [downloaded.dataUrl] : undefined,
                artifacts: !isImage ? [{ url: downloaded.dataUrl, direct_download: downloaded.dataUrl, original_path: downloaded.filename, file_hash: fileId, message: 'Generated by code execution' }] : undefined,
              });
            }
          }
        }
      } else {
        const data = await response.json();
        assistantContent = activeApiFormat.responseTextPath ? getByPath(data, activeApiFormat.responseTextPath) : (data.choices?.[0]?.message?.content || '');
        toolCalls = data.choices?.[0]?.message?.tool_calls || [];
        tokenCount = data.usage?.completion_tokens || assistantContent.split(/\s+/).length;

        // Handle Anthropic code execution results
        if (isAnthropicFormat && buildMode && Array.isArray(data.content)) {
          for (const block of data.content) {
            if (block.type === 'bash_code_execution_tool_result' || block.type === 'tool_result') {
              const resultContent = Array.isArray(block.content) ? block.content : [];
              for (const item of resultContent) {
                // Collect file IDs from code execution output
                if (item.type === 'file' && item.file_id) {
                  const downloaded = await downloadAnthropicFile(item.file_id);
                  if (downloaded) {
                    const execMsgId = uuidv4();
                    const isImage = downloaded.dataUrl.startsWith('data:image/');
                    // Save into VFS so it shows in the Files tab
                    writeToVfs(convId, downloaded.filename, downloaded.dataUrl);
                    addMessage(convId, {
                      id: execMsgId,
                      role: 'tool',
                      content: downloaded.filename,
                      timestamp: Date.now(),
                      tool_name: 'code_execution',
                      tool_status: 'success',
                      images: isImage ? [downloaded.dataUrl] : undefined,
                      artifacts: !isImage ? [{
                        url: downloaded.dataUrl,
                        direct_download: downloaded.dataUrl,
                        original_path: downloaded.filename,
                        file_hash: item.file_id,
                        message: `Generated by code execution`,
                      }] : undefined,
                    });
                  }
                }
                // Capture stdout/stderr as assistant content if no text yet
                if (item.type === 'text' && item.text && !assistantContent) {
                  assistantContent = item.text;
                }
              }
            }
          }
        }
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      const tokensPerSecond = tokenCount > 0 ? Math.round(tokenCount / duration) : undefined;
      const requestsAnotherTool = /\{"status"\s*:\s*"request_another_tool"\}\s*$/.test(assistantContent);
      const isStep = /\{"status"\s*:\s*"step"\}(\s*\{"status"\s*:\s*"request_another_tool"\})?\s*$/.test(assistantContent);

      const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: assistantContent, timestamp: Date.now(), model: model?.id, tool_calls: toolCalls.length > 0 ? toolCalls : undefined, tokens: tokenCount > 0 ? tokenCount : undefined, tokensPerSecond, isStep, requestsAnotherTool };

      if (assistantContent || toolCalls.length > 0) addMessage(convId, assistantMsg);

      if (toolCalls.length === 0) {
        clearStreaming();
        setIsGenerating(false);
        // title + follow-ups
        const shouldTitle = settings.generateTitle !== false;
        const shouldFollowUps = settings.generateFollowUps !== false;
        if (shouldTitle || shouldFollowUps) {
          setTimeout(() => {
            const c = conversations.find(c => c.id === convId);
            if (!c) return;
            if (shouldTitle && c.messages.filter(m => m.role === 'assistant' && !m.tool_calls).length === 1) generateConversationTitle(convId, provider, model);
            if (shouldFollowUps) generateFollowUps(convId, assistantMsg.id, provider, model);
          }, 500);
        }
      }

      if (toolCalls.length > 0) {
        const isAnthropic = activeApiFormat?.id === 'anthropic';
        const messagesToPass = useResponsesApi
          ? [...responsesApiMessages, { type: 'message', role: 'assistant', content: assistantContent || '' }, ...toolCalls.map(tc => ({ type: 'function_call', id: tc.fc_id || tc.id, name: tc.function.name, arguments: tc.function.arguments, call_id: tc.id, status: 'completed' }))]
          : isAnthropic
            ? [...apiMessages, { role: 'assistant', content: toolCalls.map((tc: any) => ({ type: 'tool_use', id: tc.id, name: tc.function.name, input: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })() })) }]
            : [...apiMessages, { role: 'assistant', content: assistantContent || '', tool_calls: toolCalls }];
        await executeToolCalls(toolCalls, chatUrl, headers, messagesToPass, useResponsesApi);
      } else if (requestsAnotherTool) {
        setTimeout(async () => {
          try {
            const contMsgs = useResponsesApi
              ? [...responsesApiMessages, { type: 'message', role: 'assistant', content: assistantContent }, { type: 'message', role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }]
              : [...apiMessages, { role: 'assistant', content: assistantContent }, { role: 'user', content: JSON.stringify({ status: 'tool_call_message_given' }) }];
            const contBody = useResponsesApi ? { model: model?.id || 'gpt-4o', input: contMsgs, store: false, stream: settings.modelSettings.stream, top_p: settings.modelSettings.topP, frequency_penalty: settings.modelSettings.frequencyPenalty, presence_penalty: settings.modelSettings.presencePenalty, tools: getToolDefinitionsForResponsesApi(settings.allowImageGeneration, buildMode), tool_choice: 'auto', ...(settings.modelSettings.reasoningEffort && settings.modelSettings.reasoningEffort !== 'off' ? { reasoning: { effort: settings.modelSettings.reasoningEffort } } : {}) } : { ...requestBody, messages: contMsgs, stream: settings.modelSettings.stream };
            const contRes = await fetchWithRetry(chatUrl, { method: 'POST', headers, body: JSON.stringify(contBody) });
            if (contRes.ok) await handleResponse(contRes, chatUrl, headers, contMsgs, useResponsesApi);
          } catch (e) { console.error('Continuation failed:', e); }
        }, 100);
      }
    };

    // ── main fetch ─────────────────────────────────────────────────────────────
    try {
      const basePath = activeApiFormat.chatPath || '/chat/completions';
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const chatUrl = useResponsesApi
        ? (provider.baseUrl.includes('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`)
        : provider.directUrl ? provider.baseUrl
        : hasCustomTemplate ? `${baseUrl}${basePath}`
        : (provider.baseUrl.includes('/chat/completions') ? provider.baseUrl : `${provider.baseUrl}/chat/completions`);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (provider.apiKey) headers[activeApiFormat.authHeader] = `${activeApiFormat.authPrefix}${provider.apiKey}`;
      try { Object.assign(headers, JSON.parse(activeApiFormat.extraHeaders)); } catch { /* ignore */ }
      if ((settings as any).serpApiKey) headers['x-serpapi-key'] = (settings as any).serpApiKey;

      const isAnthropic = activeApiFormat?.id === 'anthropic';
      const useCodeExecution = isAnthropic && buildMode;

      // Inject Anthropic code execution beta header + tool when in build mode
      if (useCodeExecution) {
        headers['anthropic-beta'] = 'files-api-2025-04-14';
      }

      const isStreaming = settings.modelSettings.stream;
      let customBodyStr = !useResponsesApi ? buildCustomBody(isStreaming) : null;

      // Inject code_execution tool into Anthropic body
      if (useCodeExecution && customBodyStr) {
        try {
          const parsed = JSON.parse(customBodyStr);
          const existingTools: any[] = parsed.tools || [];
          const hasCodeExec = existingTools.some((t: any) => t.type?.startsWith('code_execution'));
          if (!hasCodeExec) {
            parsed.tools = [...existingTools, { type: 'code_execution_20260120', name: 'code_execution' }];
          }
          customBodyStr = JSON.stringify(parsed);
        } catch { /* ignore */ }
      }

      const bodyToSend = useResponsesApi ? responsesApiBody : customBodyStr !== null ? JSON.parse(customBodyStr) : requestBody;

      const response = await fetchWithRetry(chatUrl, { method: 'POST', headers, body: JSON.stringify(bodyToSend), signal: controller.signal });

      if (!response.ok) {
        if (useResponsesApi && response.status === 404) {
          const fallbackUrl = provider.baseUrl.includes('/chat/completions') ? provider.baseUrl : `${provider.baseUrl}/chat/completions`;
          const fallbackRes = await fetchWithRetry(fallbackUrl, { method: 'POST', headers, body: JSON.stringify(requestBody), signal: controller.signal });
          if (fallbackRes.ok) {
            updateProvider(provider.id, { responsesApiUnsupported: true });
            await handleResponse(fallbackRes, fallbackUrl, headers, apiMessages, false);
          } else {
            const err = await fallbackRes.json().catch(() => ({ error: { message: fallbackRes.statusText } }));
            throw new Error(err.error?.message || `API error: ${fallbackRes.status}`);
          }
        } else {
          const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
          throw new Error(err.error?.message || `API error: ${response.status}`);
        }
      } else {
        await handleResponse(response, chatUrl, headers, useResponsesApi ? responsesApiMessages : apiMessages, !!useResponsesApi);
      }
    } catch (err: unknown) {
      addMessage(convId, { id: uuidv4(), role: 'assistant', content: err instanceof Error ? err.message : String(err), timestamp: Date.now(), isError: true });
    } finally {
      setIsGenerating(false);
      clearStreaming();
      setAbortController(null);
    }
  }, [conversations, conversationsRef, settings, getProviderAndModel, addMessage, setConversations, updateProvider, generateConversationTitle, generateFollowUps, setIsGenerating]);

  return { streamingContent, streamingContentRef, setStreamingContent, abortController, stopGeneration, sendMessage };
}
