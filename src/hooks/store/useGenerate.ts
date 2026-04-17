import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message, AppSettings, ModelProvider, ModelConfig } from '../../types';
import { resolveFormat, getByPath } from '../../components/ProvidersPanel';
import { fetchWithProxyFallback } from '../../utils/proxyFetch';

interface GenerateOptions {
  conversations: Conversation[];
  settings: AppSettings;
  getProviderAndModel: (id: string) => { provider: ModelProvider | undefined; model: ModelConfig | undefined };
  addMessage: (convId: string, msg: Message) => void;
  updateConversationTitle: (id: string, title: string) => void;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
}

/** Build chat URL + auth headers from a provider's API format */
function buildProviderRequest(provider: ModelProvider, apiFormats: AppSettings['apiFormats']) {
  const fmt = resolveFormat(apiFormats || [], provider.apiFormatId);
  const base = provider.baseUrl.replace(/\/$/, '');
  const chatPath = fmt.chatPath || '/chat/completions';
  const url = provider.directUrl ? provider.baseUrl
    : provider.baseUrl.includes(chatPath) ? provider.baseUrl
    : `${base}${chatPath}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers[fmt.authHeader] = `${fmt.authPrefix}${provider.apiKey}`;
  try { Object.assign(headers, JSON.parse(fmt.extraHeaders)); } catch { /* ignore */ }
  return { url, headers, fmt };
}

export function useGenerate({
  conversations,
  settings,
  getProviderAndModel,
  addMessage,
  updateConversationTitle,
  setConversations,
}: GenerateOptions) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateConversationTitle = useCallback(async (convId: string, provider: ModelProvider, model: ModelConfig | undefined) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || !provider || !model) return;
    try {
      const { url, headers, fmt } = buildProviderRequest(provider, settings.apiFormats);
      const messages = conv.messages.filter(m => m.role !== 'tool').map(m => ({ role: m.role, content: m.content }));
      messages.push({ role: 'user', content: 'Based on the conversation history, generate a Chat Title for this conversation. Reply only with the chat title and nothing else. markdown is not supported' });
      const response = await fetchWithProxyFallback(
        url,
        { method: 'POST', headers, body: JSON.stringify({ model: model.id, messages, stream: false }) },
        !!provider.useProxy,
        undefined,
        provider.proxyMode,
      );
      if (response.ok) {
        const data = await response.json();
        const text = fmt.responseTextPath
          ? getByPath(data, fmt.responseTextPath)
          : data.choices?.[0]?.message?.content;
        const title = (text || '').trim().replace(/^["']|["']$/g, '') || 'New conversation';
        updateConversationTitle(convId, title);
      }
    } catch (err) {
      console.error('Failed to generate title:', err);
    }
  }, [conversations, settings, updateConversationTitle]);

  const generateFollowUps = useCallback(async (convId: string, msgId: string, provider: ModelProvider, model: ModelConfig | undefined) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || !provider || !model) return;
    try {
      const { url, headers, fmt } = buildProviderRequest(provider, settings.apiFormats);
      const messages = conv.messages.filter(m => m.role !== 'tool').map(m => ({ role: m.role, content: m.content }));
      messages.push({ role: 'user', content: 'Based on the conversation history, generate atmost 3 follow up questions. Markdown is not supported. dont warp in ```json I want questions that the user would ask, not the assistant ai. in a JSON list like this ["followup1", "followup2", "followup3"]. Under 3 is fine. but do not include over 3. Don\'t include anything else in your message other than the json list' });
      const response = await fetchWithProxyFallback(
        url,
        { method: 'POST', headers, body: JSON.stringify({ model: model.id, messages, stream: false }) },
        !!provider.useProxy,
        undefined,
        provider.proxyMode,
      );
      if (response.ok) {
        const data = await response.json();
        const text = fmt.responseTextPath
          ? getByPath(data, fmt.responseTextPath)
          : data.choices?.[0]?.message?.content;
        const content = (text || '').trim();
        try {
          const followUps = JSON.parse(content).slice(0, 3);
          setConversations(prev => prev.map(c => {
            if (c.id !== convId) return c;
            return { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, followUps } : m) };
          }));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to generate follow-ups:', err);
    }
  }, [conversations, settings, setConversations]);

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
        const responsesUrl = provider.baseUrl.includes('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`;
        const recentMessages = conv.messages.slice().reverse();
        const lastImageMsg = recentMessages.find(m => m.imageGenerationCall);
        const userContent: any[] = [{ type: 'input_text', text: prompt }];
        if (lastImageMsg?.imageGenerationCall?.result?.image_data) {
          const imageData = lastImageMsg.imageGenerationCall.result.image_data;
          userContent.push({ type: 'input_image', image_url: imageData.startsWith('data:') || imageData.startsWith('http') ? imageData : `data:image/png;base64,${imageData}` });
        }
        const response = await fetch(responsesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
          body: JSON.stringify({
            model: settings.imageGenerationModel || 'gpt-image-1.5',
            input: [{ type: 'message', role: 'user', content: userContent }],
            tools: [{ type: 'image_generation', action: 'auto', quality: 'high' }],
            tool_choice: 'auto',
            store: false,
          }),
        });
        if (!response.ok) throw new Error('Image generation failed');
        const data = await response.json();
        const imageCall = data.output?.find((item: any) => item.image_generation_call);
        if (!imageCall?.image_generation_call?.result?.image_data) throw new Error('No image data in response');
        const imageData = imageCall.image_generation_call.result.image_data;
        const imageUrl = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
        addMessage(convId, {
          id: uuidv4(), role: 'assistant',
          content: lastImageMsg?.imageGenerationCall ? `Edited image: "${prompt}"` : `Generated image for: "${prompt}"`,
          images: [imageUrl], timestamp: Date.now(), imageGenerationCall: imageCall,
        });
      } else {
        const imageUrl = provider.baseUrl.includes('/images/generations') ? provider.baseUrl : `${provider.baseUrl}/images/generations`;
        const response = await fetch(imageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
          body: JSON.stringify({ prompt, n: 1, size: '1024x1024' }),
        });
        if (!response.ok) throw new Error('Image generation failed');
        const data = await response.json();
        const imageData = data.data?.[0]?.url || data.data?.[0]?.b64_json;
        addMessage(convId, {
          id: uuidv4(), role: 'assistant',
          content: `Generated image for: "${prompt}"`,
          images: [imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`],
          timestamp: Date.now(),
        });
      }
    } catch (err: unknown) {
      addMessage(convId, { id: uuidv4(), role: 'assistant', content: err instanceof Error ? err.message : String(err), timestamp: Date.now(), isError: true });
    } finally {
      setIsGenerating(false);
    }
  }, [conversations, settings, getProviderAndModel, addMessage]);

  const transcribeAudio = useCallback(async (blob: Blob, mimeType: string): Promise<string> => {
    const sttUrl = settings.sttBaseUrl;
    const provider = sttUrl
      ? settings.providers.find(p => p.enabled && p.baseUrl.replace(/\/$/, '') === sttUrl.replace(/\/$/, '')) ?? settings.providers.find(p => p.enabled)
      : settings.providers.find(p => p.enabled);
    if (!provider) throw new Error('No enabled provider found');
    let baseUrl = (sttUrl || provider.baseUrl)
      .replace(/\/chat\/completions\/?$/, '')
      .replace(/\/responses\/?$/, '')
      .replace(/\/$/, '');
    const model = settings.sttModel || 'gpt-4o-transcribe';
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const formData = new FormData();
    formData.append('file', blob, `recording.${ext}`);
    formData.append('model', model);
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
    return data.text || '';
  }, [settings]);

  return { isGenerating, setIsGenerating, generateConversationTitle, generateFollowUps, generateImage, transcribeAudio };
}
