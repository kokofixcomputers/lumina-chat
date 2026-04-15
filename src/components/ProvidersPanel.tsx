import { useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Download, Pencil, HelpCircle } from 'lucide-react';
import type { ModelProvider, ModelConfig, ProviderApiFormat } from '../types';
import { getModelInfo } from '../utils/models';
import { fetchWithProxyFallback } from '../utils/proxyFetch';

export const OPENAI_FORMAT: ProviderApiFormat = {
  id: 'openai',
  name: 'OpenAI',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  modelIn: 'body',
  modelKey: 'model',
  chatPath: '/chat/completions',
  modelsPath: '/models',
  extraHeaders: '{}',
  extraBody: '{}',
};

export const ANTHROPIC_FORMAT: ProviderApiFormat = {
  id: 'anthropic',
  name: 'Anthropic',
  authHeader: 'x-api-key',
  authPrefix: '',
  modelIn: 'body',
  modelKey: 'model',
  chatPath: '/messages',
  modelsPath: '/models',
  extraHeaders: JSON.stringify({ 'anthropic-version': '2023-06-01' }),
  extraBody: '{}',
  requestBodyTemplate: `{
  "model": {{model}},
  "max_tokens": {{maxTokens}},
  "messages": {{messages}},
  "temperature": {{temperature}},
  "top_p": {{topP}}
}`,
  streamingRequestBodyTemplate: `{
  "model": {{model}},
  "max_tokens": {{maxTokens}},
  "messages": {{messages}},
  "temperature": {{temperature}},
  "top_p": {{topP}},
  "stream": true
}`,
  responseTextPath: 'content.0.text',
  streamingChunkPath: 'delta.text',
  streamingDoneSentinel: 'message_stop',
};

export const BUILTIN_FORMATS: ProviderApiFormat[] = [OPENAI_FORMAT, ANTHROPIC_FORMAT];

export function resolveFormat(formats: ProviderApiFormat[], id?: string): ProviderApiFormat {
  if (!id) return OPENAI_FORMAT;
  const builtin = BUILTIN_FORMATS.find(f => f.id === id);
  if (builtin) return builtin;
  return formats.find(f => f.id === id) ?? OPENAI_FORMAT;
}

/** Resolve a dot-path like "choices.0.message.content" against an object */
export function getByPath(obj: any, path: string): string {
  return path.split('.').reduce((cur, key) => cur?.[key], obj) ?? '';
}

/** Substitute {{variable}} placeholders in a template string */
export function applyVars(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === undefined) return `{{${key}}}`;
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  });
}

interface ProvidersPanelProps {
  providers: ModelProvider[];
  apiFormats: ProviderApiFormat[];
  onUpdateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  onAddProvider: () => void;
  onDeleteProvider: (id: string) => void;
  onUpsertFormat: (fmt: ProviderApiFormat) => void;
  onDeleteFormat: (id: string) => void;
  onClose: () => void;
}

// ModelRow — unchanged
function ModelRow({ model, onUpdate, onDelete }: {
  model: ModelConfig;
  onUpdate: (patch: Partial<ModelConfig>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const modelInfo = getModelInfo(model.id);
  const Icon = typeof modelInfo.icon === 'string' ? null : modelInfo.icon;
  return (
    <div className="border border-[rgb(var(--border))] rounded-2xl overflow-hidden mb-2 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors" onClick={() => setExpanded(p => !p)}>
        {expanded ? <ChevronDown size={14} className="text-[rgb(var(--muted))]" /> : <ChevronRight size={14} className="text-[rgb(var(--muted))]" />}
        {typeof modelInfo.icon === 'string' ? <img src={modelInfo.icon} alt="" className="w-4 h-4 shrink-0" /> : Icon ? <Icon size={14} className="text-[rgb(var(--muted))] shrink-0" /> : null}
        <span className="text-sm font-medium flex-1 truncate">{modelInfo.displayName}</span>
        <span className="text-xs text-[rgb(var(--muted))] font-mono">{model.id}</span>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="btn-icon w-6 h-6 text-[rgb(var(--muted))] hover:text-red-500"><Trash2 size={12} /></button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[rgb(var(--border))] pt-3 bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="form-label text-xs">Model ID</label><input className="input text-xs py-1.5" value={model.id} onChange={e => onUpdate({ id: e.target.value })} /></div>
            <div><label className="form-label text-xs">Display Name</label><input className="input text-xs py-1.5" value={model.name} onChange={e => onUpdate({ name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="form-label text-xs">Context Length</label>
              <input className="input text-xs py-1.5" type="number" value={model.contextLength || ''} onChange={e => onUpdate({ contextLength: parseInt(e.target.value) || undefined })} />
            </div>
            <div className="flex flex-col justify-end gap-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <button onClick={() => onUpdate({ supportsImages: !model.supportsImages })} className={`toggle w-9 h-5 ${model.supportsImages ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}>
                  <span className={`toggle-thumb w-3 h-3 ${model.supportsImages ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-[rgb(var(--muted))]">Vision</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <button onClick={() => onUpdate({ supportsStreaming: !model.supportsStreaming })} className={`toggle w-9 h-5 ${model.supportsStreaming ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}>
                  <span className={`toggle-thumb w-3 h-3 ${model.supportsStreaming ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-[rgb(var(--muted))]">Streaming</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ProviderCard
function ProviderCard({ provider, apiFormats, onUpdate, onDelete }: {
  provider: ModelProvider;
  apiFormats: ProviderApiFormat[];
  onUpdate: (patch: Partial<ModelProvider>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);
  const allFormats = [...BUILTIN_FORMATS, ...apiFormats];
  const activeFormat = resolveFormat(apiFormats, provider.apiFormatId);

  const fetchModels = async () => {
    if (!provider.baseUrl || !activeFormat.modelsPath) return;
    setFetching(true);
    try {
      const modelsUrl = `${provider.baseUrl.replace(/\/$/, '')}${activeFormat.modelsPath}`;
      const headers: Record<string, string> = {};
      if (provider.apiKey) headers[activeFormat.authHeader] = `${activeFormat.authPrefix}${provider.apiKey}`;
      try { Object.assign(headers, JSON.parse(activeFormat.extraHeaders)); } catch { /* ignore */ }
      const response = await fetchWithProxyFallback(modelsUrl, { headers }, !!provider.useProxy, () => onUpdate({ useProxy: true }), provider.proxyMode);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models: ModelConfig[] = (data.data || []).map((m: any) => ({
        id: m.id, name: m.id, contextLength: m.context_length || 4096, supportsImages: false, supportsStreaming: true,
      }));
      onUpdate({ models });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally { setFetching(false); }
  };

  const updateModel = (idx: number, patch: Partial<ModelConfig>) => {
    const models = [...provider.models];
    models[idx] = { ...models[idx], ...patch };
    onUpdate({ models });
  };

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl overflow-hidden mb-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors" onClick={() => setExpanded(p => !p)}>
        <button onClick={e => { e.stopPropagation(); onUpdate({ enabled: !provider.enabled }); }} className={`toggle w-10 h-5 shrink-0 ${provider.enabled ? 'bg-green-500' : 'bg-black/15 dark:bg-white/15'}`}>
          <span className={`toggle-thumb w-3 h-3 ${provider.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{provider.name}</p>
          <p className="text-xs text-[rgb(var(--muted))] truncate">{provider.baseUrl}</p>
        </div>
        <span className="badge-secondary text-xs">{activeFormat.name}</span>
        <span className="badge-secondary text-xs">{provider.models.length} models</span>
        {expanded ? <ChevronDown size={16} className="text-[rgb(var(--muted))]" /> : <ChevronRight size={16} className="text-[rgb(var(--muted))]" />}
        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="btn-icon w-7 h-7 text-[rgb(var(--muted))] hover:text-red-500"><Trash2 size={14} /></button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-[rgb(var(--border))] pt-4 space-y-4">
          <div className="grid gap-3">
            <div className="form-group mb-0">
              <label className="form-label text-xs">Provider Name</label>
              <input className="input text-sm" value={provider.name} onChange={e => onUpdate({ name: e.target.value })} />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Base URL</label>
              <input className="input text-sm font-mono" value={provider.baseUrl} onChange={e => onUpdate({ baseUrl: e.target.value })} />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">API Key</label>
              <div className="relative">
                <input className="input text-sm pr-10 font-mono" type={showKey ? 'text' : 'password'} value={provider.apiKey} onChange={e => onUpdate({ apiKey: e.target.value })} placeholder="sk-..." />
                <button onClick={() => setShowKey(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">API Format</label>
              <select className="input text-sm" value={provider.apiFormatId || 'openai'} onChange={e => onUpdate({ apiFormatId: e.target.value })}>
                {allFormats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Proxy</label>
              <div className="flex rounded-lg overflow-hidden border border-[rgb(var(--border))] w-fit text-xs font-medium">
                {(['off', 'auto', 'on'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => onUpdate({ proxyMode: mode })}
                    className={`px-3 py-1.5 capitalize transition-colors ${
                      (provider.proxyMode ?? 'auto') === mode
                        ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]'
                        : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    {mode === 'auto' ? 'Default' : mode === 'on' ? 'On' : 'Off'}
                  </button>
                ))}
              </div>
              <p className="form-help">Default lets the app auto-detect. On always routes through the CORS proxy. Off disables it.</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Models</p>
              <div className="flex gap-1">
                {activeFormat.modelsPath && (
                  <button onClick={fetchModels} disabled={fetching} className="btn-secondary py-1 px-3 text-xs gap-1.5">
                    <Download size={12} />{fetching ? 'Fetching...' : 'Fetch'}
                  </button>
                )}
                <button onClick={() => onUpdate({ models: [...provider.models, { id: 'new-model', name: 'New Model', contextLength: 4096, supportsImages: false, supportsStreaming: true }] })} className="btn-secondary py-1 px-3 text-xs gap-1.5">
                  <Plus size={12} />Add
                </button>
              </div>
            </div>
            {provider.models.map((model, idx) => (
              <ModelRow key={idx} model={model} onUpdate={patch => updateModel(idx, patch)} onDelete={() => onUpdate({ models: provider.models.filter((_, i) => i !== idx) })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const BUILTIN_VARS = [
  { name: '{{messages}}', desc: 'Array of conversation messages' },
  { name: '{{model}}', desc: 'Selected model ID' },
  { name: '{{apiKey}}', desc: 'Provider API key' },
  { name: '{{stream}}', desc: 'true / false' },
  { name: '{{temperature}}', desc: 'Temperature setting' },
  { name: '{{maxTokens}}', desc: 'Max tokens setting' },
  { name: '{{topP}}', desc: 'Top-p setting' },
];

const DEFAULT_REQUEST_BODY = `{
  "model": {{model}},
  "messages": {{messages}},
  "temperature": {{temperature}},
  "max_tokens": {{maxTokens}},
  "top_p": {{topP}}
}`;

const DEFAULT_STREAMING_BODY = `{
  "model": {{model}},
  "messages": {{messages}},
  "temperature": {{temperature}},
  "max_tokens": {{maxTokens}},
  "top_p": {{topP}},
  "stream": true
}`;

const EMPTY_FORMAT: Omit<ProviderApiFormat, 'id'> = {
  name: '', authHeader: 'Authorization', authPrefix: 'Bearer ',
  modelIn: 'body', modelKey: 'model',
  chatPath: '/chat/completions', modelsPath: '/models',
  extraHeaders: '{}', extraBody: '{}',
  requestBodyTemplate: DEFAULT_REQUEST_BODY,
  streamingRequestBodyTemplate: DEFAULT_STREAMING_BODY,
  responseTextPath: 'choices.0.message.content',
  streamingChunkPath: 'choices.0.delta.content',
  streamingDoneSentinel: '[DONE]',
  customVars: {},
};

type EditorTab = 'basic' | 'templates' | 'variables';

export function ApiFormatEditor({ initial, onSave, onCancel }: {
  initial?: ProviderApiFormat;
  onSave: (fmt: ProviderApiFormat) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Omit<ProviderApiFormat, 'id'>>(initial ? { ...EMPTY_FORMAT, ...initial } : { ...EMPTY_FORMAT });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<EditorTab>('basic');
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const set = (patch: Partial<typeof draft>) => setDraft(d => ({ ...d, ...patch }));

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = 'Required';
    if (!draft.authHeader.trim()) e.authHeader = 'Required';
    if (!draft.chatPath.trim()) e.chatPath = 'Required';
    try { JSON.parse(draft.extraHeaders); } catch { e.extraHeaders = 'Invalid JSON'; }
    try { JSON.parse(draft.extraBody); } catch { e.extraBody = 'Invalid JSON'; }
    setErrors(e);
    if (Object.keys(e).length > 0) { setTab('basic'); return; }
    onSave({ id: initial?.id ?? `fmt_${Date.now()}`, ...draft });
  };

  const addCustomVar = () => {
    const k = newVarKey.trim();
    if (!k) return;
    set({ customVars: { ...draft.customVars, [k]: newVarVal } });
    setNewVarKey(''); setNewVarVal('');
  };

  const removeCustomVar = (k: string) => {
    const next = { ...draft.customVars };
    delete next[k];
    set({ customVars: next });
  };

  const tabs: { id: EditorTab; label: string }[] = [
    { id: 'basic', label: 'Basic' },
    { id: 'templates', label: 'Templates' },
    { id: 'variables', label: 'Variables' },
  ];

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl mb-3 overflow-hidden">
      <div className="px-4 pt-4 pb-0">
        <p className="text-sm font-semibold mb-3">{initial ? 'Edit API Format' : 'New API Format'}</p>
        <div className="flex gap-1 border-b border-[rgb(var(--border))] mb-4">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[rgb(var(--accent))] text-[rgb(var(--accent))]' : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {tab === 'basic' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group mb-0 col-span-2">
              <label className="form-label text-xs">Format Name</label>
              <input className={`input text-sm ${errors.name ? 'border-red-400' : ''}`} value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Anthropic, Gemini" />
              {errors.name && <p className="text-xs text-red-400 mt-0.5">{errors.name}</p>}
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Auth Header</label>
              <input className={`input text-sm font-mono ${errors.authHeader ? 'border-red-400' : ''}`} value={draft.authHeader} onChange={e => set({ authHeader: e.target.value })} placeholder="Authorization" />
              {errors.authHeader && <p className="text-xs text-red-400 mt-0.5">{errors.authHeader}</p>}
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Auth Prefix</label>
              <input className="input text-sm font-mono" value={draft.authPrefix} onChange={e => set({ authPrefix: e.target.value })} placeholder="Bearer " />
              <p className="form-help">Prepended to the API key</p>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Chat Path</label>
              <input className={`input text-sm font-mono ${errors.chatPath ? 'border-red-400' : ''}`} value={draft.chatPath} onChange={e => set({ chatPath: e.target.value })} placeholder="/chat/completions" />
              {errors.chatPath && <p className="text-xs text-red-400 mt-0.5">{errors.chatPath}</p>}
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Models Path</label>
              <input className="input text-sm font-mono" value={draft.modelsPath} onChange={e => set({ modelsPath: e.target.value })} placeholder="/models" />
              <p className="form-help">Leave empty to disable</p>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Model Placement</label>
              <select className="input text-sm" value={draft.modelIn} onChange={e => set({ modelIn: e.target.value as ProviderApiFormat['modelIn'] })}>
                <option value="body">Request body</option>
                <option value="url">URL path</option>
                <option value="header">Request header</option>
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">{draft.modelIn === 'body' ? 'Body key' : draft.modelIn === 'header' ? 'Header name' : 'URL template'}</label>
              <input className="input text-sm font-mono" value={draft.modelKey} onChange={e => set({ modelKey: e.target.value })} placeholder="model" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Extra Headers (JSON)</label>
              <textarea className={`input text-xs font-mono resize-none h-16 ${errors.extraHeaders ? 'border-red-400' : ''}`} value={draft.extraHeaders} onChange={e => set({ extraHeaders: e.target.value })} />
              {errors.extraHeaders && <p className="text-xs text-red-400 mt-0.5">{errors.extraHeaders}</p>}
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Extra Body Fields (JSON)</label>
              <textarea className={`input text-xs font-mono resize-none h-16 ${errors.extraBody ? 'border-red-400' : ''}`} value={draft.extraBody} onChange={e => set({ extraBody: e.target.value })} />
              {errors.extraBody && <p className="text-xs text-red-400 mt-0.5">{errors.extraBody}</p>}
            </div>
          </div>
        )}

        {tab === 'templates' && (
          <div className="space-y-3">
            <div className="bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-xl p-3 text-xs text-[rgb(var(--muted))] space-y-1">
              <p className="font-semibold text-[rgb(var(--text))]">Available variables</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                {BUILTIN_VARS.map(v => (
                  <div key={v.name} className="flex gap-1.5">
                    <code className="text-[rgb(var(--accent))] shrink-0">{v.name}</code>
                    <span className="text-[rgb(var(--muted))]">{v.desc}</span>
                  </div>
                ))}
                {Object.keys(draft.customVars || {}).map(k => (
                  <div key={k} className="flex gap-1.5">
                    <code className="text-purple-500 shrink-0">{`{{${k}}}`}</code>
                    <span className="text-[rgb(var(--muted))]">custom</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-xs">Request Body (non-streaming)</label>
              <textarea
                className="input text-xs font-mono resize-none h-40"
                value={draft.requestBodyTemplate ?? ''}
                onChange={e => set({ requestBodyTemplate: e.target.value })}
                placeholder={DEFAULT_REQUEST_BODY}
                spellCheck={false}
              />
              <p className="form-help">Full JSON body template. Use variables like {`{{messages}}`}, {`{{model}}`}.</p>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-xs">Request Body (streaming)</label>
              <textarea
                className="input text-xs font-mono resize-none h-40"
                value={draft.streamingRequestBodyTemplate ?? ''}
                onChange={e => set({ streamingRequestBodyTemplate: e.target.value })}
                placeholder={DEFAULT_STREAMING_BODY}
                spellCheck={false}
              />
              <p className="form-help">Separate template used when streaming is enabled.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="form-group mb-0">
                <label className="form-label text-xs">Response text path</label>
                <input className="input text-sm font-mono" value={draft.responseTextPath ?? ''} onChange={e => set({ responseTextPath: e.target.value })} placeholder="choices.0.message.content" />
                <p className="form-help">Dot-path to extract assistant text from JSON response</p>
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-xs">Streaming chunk path</label>
                <input className="input text-sm font-mono" value={draft.streamingChunkPath ?? ''} onChange={e => set({ streamingChunkPath: e.target.value })} placeholder="choices.0.delta.content" />
                <p className="form-help">Dot-path to extract delta text from each SSE chunk</p>
              </div>
              <div className="form-group mb-0 col-span-2">
                <label className="form-label text-xs">Streaming done sentinel</label>
                <input className="input text-sm font-mono" value={draft.streamingDoneSentinel ?? ''} onChange={e => set({ streamingDoneSentinel: e.target.value })} placeholder="[DONE]" />
                <p className="form-help">SSE data value that signals end of stream</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'variables' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-xl p-3">
              <HelpCircle size={14} className="text-[rgb(var(--muted))] mt-0.5 shrink-0" />
              <p className="text-xs text-[rgb(var(--muted))]">
                Define custom static variables to use in your templates as <code className="text-[rgb(var(--accent))]">{`{{name}}`}</code>.
                Built-in variables like <code className="text-[rgb(var(--accent))]">{`{{messages}}`}</code> and <code className="text-[rgb(var(--accent))]">{`{{model}}`}</code> are always available.
              </p>
            </div>

            {Object.entries(draft.customVars || {}).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <code className="text-xs font-mono bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded px-2 py-1 text-purple-500 shrink-0">{`{{${k}}}`}</code>
                <input className="input text-xs font-mono flex-1" value={v} onChange={e => set({ customVars: { ...draft.customVars, [k]: e.target.value } })} />
                <button onClick={() => removeCustomVar(k)} className="btn-icon w-7 h-7 text-[rgb(var(--muted))] hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1 border-t border-[rgb(var(--border))]">
              <input className="input text-xs font-mono w-32" value={newVarKey} onChange={e => setNewVarKey(e.target.value)} placeholder="name" onKeyDown={e => e.key === 'Enter' && addCustomVar()} />
              <span className="text-xs text-[rgb(var(--muted))]">=</span>
              <input className="input text-xs font-mono flex-1" value={newVarVal} onChange={e => setNewVarVal(e.target.value)} placeholder="value" onKeyDown={e => e.key === 'Enter' && addCustomVar()} />
              <button onClick={addCustomVar} className="btn-secondary py-1.5 px-3 text-xs gap-1 shrink-0"><Plus size={12} />Add</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-[rgb(var(--border))]">
          <button onClick={onCancel} className="btn-secondary py-1.5 px-4 text-xs">Cancel</button>
          <button onClick={handleSave} className="btn-primary py-1.5 px-4 text-xs">Save format</button>
        </div>
      </div>
    </div>
  );
}

export function ApiFormatsTab({ apiFormats, onUpsert, onDelete }: {
  apiFormats: ProviderApiFormat[];
  onUpsert: (fmt: ProviderApiFormat) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<ProviderApiFormat | 'new' | null>(null);
  return (
    <div className="p-4 pb-safe">
      <p className="text-xs text-[rgb(var(--muted))] mb-3">
        The built-in <span className="font-semibold text-[rgb(var(--text))]">OpenAI</span> format is always available and cannot be edited.
        Create custom formats for APIs that use a different request structure.
      </p>
      <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl px-4 py-3 mb-3 flex items-center gap-3 opacity-60">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">OpenAI <span className="text-xs font-normal text-[rgb(var(--muted))]">(built-in)</span></p>
          <p className="text-xs text-[rgb(var(--muted))] font-mono">Bearer auth · model in body · /chat/completions</p>
        </div>
      </div>
      <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl px-4 py-3 mb-3 flex items-center gap-3 opacity-60">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Anthropic <span className="text-xs font-normal text-[rgb(var(--muted))]">(built-in)</span></p>
          <p className="text-xs text-[rgb(var(--muted))] font-mono">x-api-key auth · anthropic-version: 2023-06-01 · /messages</p>
        </div>
      </div>
      {apiFormats.map(fmt =>
        editing && typeof editing === 'object' && editing.id === fmt.id ? (
          <ApiFormatEditor key={fmt.id} initial={fmt} onSave={f => { onUpsert(f); setEditing(null); }} onCancel={() => setEditing(null)} />
        ) : (
          <div key={fmt.id} className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl px-4 py-3 mb-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{fmt.name}</p>
              <p className="text-xs text-[rgb(var(--muted))] font-mono truncate">{fmt.authHeader} · model in {fmt.modelIn} · {fmt.chatPath}</p>
            </div>
            <button onClick={() => setEditing(fmt)} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]"><Pencil size={13} /></button>
            <button onClick={() => onDelete(fmt.id)} className="btn-icon w-7 h-7 text-[rgb(var(--muted))] hover:text-red-500"><Trash2 size={13} /></button>
          </div>
        )
      )}
      {editing === 'new' ? (
        <ApiFormatEditor onSave={f => { onUpsert(f); setEditing(null); }} onCancel={() => setEditing(null)} />
      ) : (
        <button onClick={() => setEditing('new')} className="btn-secondary w-full py-2 text-xs gap-1.5">
          <Plus size={13} />New API format
        </button>
      )}
    </div>
  );
}

type Tab = 'providers' | 'formats';

export default function ProvidersPanel({ providers, apiFormats, onUpdateProvider, onAddProvider, onDeleteProvider, onUpsertFormat, onDeleteFormat, onClose }: ProvidersPanelProps) {
  const [tab, setTab] = useState<Tab>('providers');
  return (
    <div className="flex flex-col h-full w-full bg-[rgb(var(--panel))] border-l border-[rgb(var(--border))] shrink-0 fixed inset-0 z-50">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--border))]">
        <h2 className="font-semibold text-base">Model Providers</h2>
        <div className="flex items-center gap-2">
          {tab === 'providers' && (
            <button onClick={onAddProvider} className="btn-primary py-2 px-4 text-xs gap-1.5">
              <Plus size={14} />Add provider
            </button>
          )}
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>
      </div>
      <div className="flex border-b border-[rgb(var(--border))] px-4 gap-1 shrink-0">
        {(['providers', 'formats'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${tab === t ? 'border-[rgb(var(--accent))] text-[rgb(var(--accent))]' : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'}`}>
            {t === 'providers' ? 'Providers' : 'API Formats'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'providers' && (
          <div className="p-4 pb-safe">
            <p className="text-xs text-[rgb(var(--muted))] mb-4">Add any API endpoint. API keys are stored locally.</p>
            {providers.map(p => (
              <ProviderCard key={p.id} provider={p} apiFormats={apiFormats} onUpdate={patch => onUpdateProvider(p.id, patch)} onDelete={() => onDeleteProvider(p.id)} />
            ))}
          </div>
        )}
        {tab === 'formats' && (
          <ApiFormatsTab apiFormats={apiFormats} onUpsert={onUpsertFormat} onDelete={onDeleteFormat} />
        )}
      </div>
    </div>
  );
}
