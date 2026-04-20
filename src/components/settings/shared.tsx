import React from 'react';
import { useState } from 'react';
import { Database, Settings as SettingsIcon, Eye, Globe, Shield, Key } from 'lucide-react';
import { isTauri } from '../../utils/tauri';
import type { ModelConfig, ModelProvider, ProviderApiFormat } from '../../types';
import { getModelInfo } from '../../utils/models';
import { fetchWithProxyFallback } from '../../utils/proxyFetch';
import { BUILTIN_FORMATS, resolveFormat } from '../ProvidersPanel';
import type { IntegratedProviderTemplate } from '../../data/integratedProviders';

export const TAGLINES = [
  'Light up every conversation.',
  'Where curiosity finds its answers.',
  'Think brighter. Chat smarter.',
  'Your ideas, illuminated.',
  'AI that gets you.',
  'Clarity in every conversation.',
  'The future of chat, brilliantly simple.',
  'Smarter conversations start here.',
  'Powered by intelligence. Built for you.',
  'Chat beyond limits.',
  'Brilliant answers, instantly.',
  'Where every question finds its light.',
  'Where Knowledge meets Intelligence.',
  'Where Knowledge begins.',
];

export const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  'anthropic-proxy': '#d4a574',
  ollama: '#6366f1',
  groq: '#f97316',
  mistral: '#eb6f33',
  together: '#8b5cf6',
};

export const PROVIDER_INITIALS: Record<string, string> = {
  openai: 'O',
  'anthropic-proxy': 'A',
  ollama: 'L',
  groq: 'G',
  mistral: 'M',
  together: 'T',
};

export function ProviderDot({ providerId, providerName }: { providerId: string; providerName: string }) {
  const color = PROVIDER_COLORS[providerId] || '#8b5cf6';
  const initial = PROVIDER_INITIALS[providerId] || providerName[0]?.toUpperCase() || '?';
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
      style={{ background: color }}
    >
      {initial}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="form-group">
      <div className="flex items-center justify-between mb-2">
        <label className="form-label mb-0">{label}</label>
        <span className="text-xs font-mono text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] px-2.5 py-1 rounded-full shadow-sm">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ '--val': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
      {hint && <p className="form-help">{hint}</p>}
    </div>
  );
}

export function ModelRow({ model, onUpdate, onDelete }: {
  model: ModelConfig;
  onUpdate: (patch: Partial<ModelConfig>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const modelInfo = getModelInfo(model.id);
  const Icon = typeof modelInfo.icon === 'string' ? null : modelInfo.icon;

  return (
    <div className="border border-[rgb(var(--border))] rounded-2xl overflow-hidden mb-2 shadow-sm">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        {expanded ? <ChevronDown size={14} className="text-[rgb(var(--muted))]" /> : <ChevronRight size={14} className="text-[rgb(var(--muted))]" />}
        {typeof modelInfo.icon === 'string' ? (
          <img src={modelInfo.icon} alt="" className="w-4 h-4 shrink-0" />
        ) : Icon ? (
          <Icon size={14} className="text-[rgb(var(--muted))] shrink-0" />
        ) : null}
        <span className="text-sm font-medium flex-1 truncate">{modelInfo.displayName}</span>
        <span className="text-xs text-[rgb(var(--muted))] font-mono">{model.id}</span>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="btn-icon w-6 h-6 text-[rgb(var(--muted))] hover:text-red-500">
          <Trash2 size={12} />
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[rgb(var(--border))] pt-3 bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="form-label text-xs">Model ID</label>
              <input className="input text-xs py-1.5" value={model.id} onChange={e => onUpdate({ id: e.target.value })} />
            </div>
            <div>
              <label className="form-label text-xs">Display Name</label>
              <input className="input text-xs py-1.5" value={model.name} onChange={e => onUpdate({ name: e.target.value })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function IntegratedProviderCard({
  template,
  existingProvider,
  onAdd,
  onUpdate,
  apiFormats = [],
}: {
  template: IntegratedProviderTemplate;
  existingProvider?: ModelProvider;
  onAdd: () => void;
  onUpdate: (patch: Partial<ModelProvider>) => void;
  apiFormats?: ProviderApiFormat[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);

  const activeFormat = resolveFormat(apiFormats, existingProvider?.apiFormatId);
  const allFormats = [...BUILTIN_FORMATS, ...apiFormats];

  const buildBaseUrl = () => {
    let url = template.baseUrlTemplate;
    if (existingProvider?.customFieldValues) {
      Object.entries(existingProvider.customFieldValues).forEach(([key, value]) => {
        url = url.replace(`{${key}}`, value);
      });
    }
    return url;
  };

  const fetchModels = async () => {
    if (!existingProvider) return;
    const baseUrl = buildBaseUrl();
    if (!baseUrl || (template.requireAuth && !existingProvider.apiKey)) return;

    setFetching(true);
    try {
      const modelsUrl = `${baseUrl.replace(/\/$/, '')}${activeFormat.modelsPath || '/models'}`;
      const headers: Record<string, string> = {};
      if (existingProvider.apiKey) {
        headers[activeFormat.authHeader] = `${activeFormat.authPrefix}${existingProvider.apiKey}`;
      }
      try { Object.assign(headers, JSON.parse(activeFormat.extraHeaders)); } catch { /* ignore */ }
      const response = await fetchWithProxyFallback(
        modelsUrl,
        { headers },
        !!existingProvider.useProxy,
        () => onUpdate({ useProxy: true }),
        existingProvider.proxyMode,
      );
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models: ModelConfig[] = (data.data || []).map((m: any) => {
        // Handle different context length field names from various providers
        const contextLength = m.max_context_length || m.context_length || m.max_tokens || 4096;
        return {
          id: m.id,
          name: m.id,
          contextLength,
          supportsImages: false,
          supportsStreaming: true,
        };
      });
      onUpdate({ models });
    } catch (err) {
      onUpdate({ models: template.defaultModels });
    } finally {
      setFetching(false);
    }
  };

  const handleApiKeyChange = (apiKey: string) => {
    onUpdate({ apiKey });
    if (apiKey && existingProvider?.models.length === 0) {
      setTimeout(() => fetchModels(), 100);
    }
  };

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    const newCustomFieldValues = { ...existingProvider?.customFieldValues, [fieldId]: value };
    let newBaseUrl = template.baseUrlTemplate;
    Object.entries(newCustomFieldValues).forEach(([key, val]) => {
      newBaseUrl = newBaseUrl.replace(`{${key}}`, val);
    });
    onUpdate({ customFieldValues: newCustomFieldValues, baseUrl: newBaseUrl });
    const allFieldsFilled = template.customFields?.every(f => newCustomFieldValues[f.id]);
    if (allFieldsFilled && existingProvider?.models.length === 0) {
      setTimeout(() => fetchModels(), 100);
    }
  };

  if (!existingProvider) {
    return (
      <div className="border border-[rgb(var(--border))] rounded-xl p-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold">{template.name}</p>
            {template.description && <p className="text-xs text-[rgb(var(--muted))]">{template.description}</p>}
          </div>
          <button onClick={onAdd} className="btn-secondary py-1 px-3 text-xs">
            <Plus size={12} />
            Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl overflow-hidden shadow-sm">
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <button
          onClick={e => { e.stopPropagation(); onUpdate({ enabled: !existingProvider.enabled }); }}
          className={`toggle w-10 h-5 shrink-0 ${existingProvider.enabled ? 'bg-green-500' : 'bg-black/15 dark:bg-white/15'}`}
        >
          <span className={`toggle-thumb w-3 h-3 ${existingProvider.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{template.name}</p>
          {template.description && <p className="text-xs text-[rgb(var(--muted))]">{template.description}</p>}
        </div>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-[rgb(var(--border))] pt-3 space-y-3">
          {template.requireAuth && (
            <div className="form-group mb-0">
              <label className="form-label text-xs">API Key</label>
              <div className="relative">
                <input
                  className="input text-sm pr-10 font-mono"
                  type={showKey ? 'text' : 'password'}
                  value={existingProvider.apiKey}
                  onChange={e => handleApiKeyChange(e.target.value)}
                  placeholder="sk-..."
                />
                <button
                  onClick={() => setShowKey(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}
          {template.customFields?.map(field => (
            <div key={field.id} className="form-group mb-0">
              <label className="form-label text-xs">{field.name}</label>
              <div className={field.blur ? "relative" : ""}>
                <input
                  className={`input text-sm pr-10 font-mono ${field.blur ? 'pr-10' : ''}`}
                  value={existingProvider.customFieldValues?.[field.id] || ''}
                  onChange={e => handleCustomFieldChange(field.id, e.target.value)}
                  type={field.blur ? (showKey ? 'text' : 'password') : 'text'}
                  placeholder={field.placeholder}
                />
                {field.blur && (
                  <button
                    onClick={() => setShowKey(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </div>
            </div>
          ))}
          <br />
          <div className="form-group mb-0">
            <label className="form-label text-xs">API Format</label>
            <select
              className="input text-sm"
              value={existingProvider.apiFormatId || 'openai'}
              onChange={e => onUpdate({ apiFormatId: e.target.value })}
            >
              {allFormats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <p className="form-help">Controls how requests are structured and authenticated</p>
          </div>
          <div className="flex items-center justify-between mb-2">
            {/* Hide proxy settings in Tauri - not needed with HTTP plugin */}
            {!isTauri ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[rgb(var(--muted))]">Proxy</span>
                <div className="flex rounded-lg overflow-hidden border border-[rgb(var(--border))] text-xs font-medium">
                  {(['off', 'auto', 'on'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => onUpdate({ proxyMode: mode })}
                      className={`px-2.5 py-1 capitalize transition-colors ${
                        (existingProvider.proxyMode ?? 'auto') === mode
                          ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]'
                          : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {mode === 'auto' ? 'Default' : mode === 'on' ? 'On' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[rgb(var(--muted))]">Proxy</span>
                  <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded">
                    Proxy is not required in the desktop app
                  </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="text-xs text-[rgb(var(--muted))]">{existingProvider.models.length} models configured</p>
              <button onClick={fetchModels} disabled={fetching} className="btn-secondary py-1 px-3 text-xs gap-1.5">
                <Download size={12} />
                {fetching ? 'Fetching...' : 'Refresh Models'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProviderCard({
  provider,
  apiFormats,
  onUpdate,
  onDelete,
}: {
  provider: ModelProvider;
  apiFormats: import('../../types').ProviderApiFormat[];
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
      try { Object.assign(headers, JSON.parse(activeFormat.extraHeaders)); } catch {}
      const response = await fetchWithProxyFallback(
        modelsUrl,
        { headers },
        !!provider.useProxy,
        () => onUpdate({ useProxy: true }),
        provider.proxyMode,
      );
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models: ModelConfig[] = (data.data || []).map((m: any) => {
        // Handle different context length field names from various providers
        const contextLength = m.max_context_length || m.context_length || m.max_tokens || 4096;
        return {
          id: m.id,
          name: m.id,
          contextLength,
          supportsImages: false,
          supportsStreaming: true,
        };
      });
      onUpdate({ models });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setFetching(false);
    }
  };

  const addModel = () => {
    onUpdate({
      models: [...provider.models, {
        id: 'new-model',
        name: 'New Model',
        contextLength: 4096,
        supportsImages: false,
        supportsStreaming: true,
      }],
    });
  };

  const updateModel = (idx: number, patch: Partial<ModelConfig>) => {
    const models = [...provider.models];
    models[idx] = { ...models[idx], ...patch };
    onUpdate({ models });
  };

  const deleteModel = (idx: number) => {
    onUpdate({ models: provider.models.filter((_, i) => i !== idx) });
  };

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl overflow-hidden mb-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)] max-w-full">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <button
          onClick={e => { e.stopPropagation(); onUpdate({ enabled: !provider.enabled }); }}
          className={`toggle w-10 h-5 shrink-0 ${provider.enabled ? 'bg-green-500' : 'bg-black/15 dark:bg-white/15'}`}
        >
          <span className={`toggle-thumb w-3 h-3 ${provider.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{provider.name}</p>
          <p className="text-xs text-[rgb(var(--muted))] truncate">{provider.baseUrl}</p>
        </div>
        <span className="badge-secondary text-xs">{provider.models.length} models</span>
        {expanded ? <ChevronDown size={16} className="text-[rgb(var(--muted))]" /> : <ChevronRight size={16} className="text-[rgb(var(--muted))]" />}
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="btn-icon w-7 h-7 text-[rgb(var(--muted))] hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[rgb(var(--border))] pt-4 space-y-4">
          {provider.responsesApiUnsupported && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Note:</strong> This provider does not support the /v1/responses API. Using chat completions instead.
              </p>
            </div>
          )}
          <div className="grid gap-3 max-w-full">
            <div className="form-group mb-0">
              <label className="form-label text-xs">Provider Name</label>
              <input className="input text-sm" value={provider.name} onChange={e => onUpdate({ name: e.target.value })} />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">Base URL</label>
              <input className="input text-sm font-mono break-all" value={provider.baseUrl} onChange={e => onUpdate({ baseUrl: e.target.value })} />
              <p className="form-help">OpenAI-compatible endpoint (e.g. https://api.openai.com/v1) or direct chat completions URL</p>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">API Key</label>
              <div className="relative">
                <input
                  className="input text-sm pr-10 font-mono break-all"
                  type={showKey ? 'text' : 'password'}
                  value={provider.apiKey}
                  onChange={e => onUpdate({ apiKey: e.target.value })}
                  placeholder="sk-..."
                />
                <button
                  onClick={() => setShowKey(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs">API Format</label>
              <select className="input text-sm" value={provider.apiFormatId || 'openai'} onChange={e => onUpdate({ apiFormatId: e.target.value })}>
                {allFormats.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <p className="form-help">Controls how requests are structured and authenticated</p>
            </div>
            {/* Hide proxy settings in Tauri - not needed with HTTP plugin */}
            {!isTauri ? (
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
            ) : (
              <div className="form-group mb-0">
                <label className="form-label text-xs">Proxy</label>
                <div className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded w-fit">
                  Proxy is not required in the desktop app
                </div>
                <p className="form-help">Using Tauri HTTP plugin for direct connections without CORS limitations.</p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Models</p>
              <div className="flex gap-1">
                {activeFormat.modelsPath && (
                  <button onClick={fetchModels} disabled={fetching} className="btn-secondary py-1 px-3 text-xs gap-1.5">
                    <Download size={12} />
                    {fetching ? 'Fetching...' : 'Fetch'}
                  </button>
                )}
                <button onClick={addModel} className="btn-secondary py-1 px-3 text-xs gap-1.5">
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>
            {provider.models.map((model, idx) => (
              <ModelRow
                key={idx}
                model={model}
                onUpdate={patch => updateModel(idx, patch)}
                onDelete={() => deleteModel(idx)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
