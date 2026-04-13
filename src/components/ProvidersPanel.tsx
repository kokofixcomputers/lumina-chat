import { useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Download } from 'lucide-react';
import type { ModelProvider, ModelConfig } from '../types';
import { getModelInfo } from '../utils/models';
import { fetchWithProxyFallback } from '../utils/proxyFetch';

interface ProvidersPanelProps {
  providers: ModelProvider[];
  onUpdateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  onAddProvider: () => void;
  onDeleteProvider: (id: string) => void;
  onClose: () => void;
}

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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="form-label text-xs">Context Length</label>
              <input
                className="input text-xs py-1.5"
                type="number"
                value={model.contextLength || ''}
                onChange={e => onUpdate({ contextLength: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div className="flex flex-col justify-end gap-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  onClick={() => onUpdate({ supportsImages: !model.supportsImages })}
                  className={`toggle w-9 h-5 ${model.supportsImages ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                >
                  <span className={`toggle-thumb w-3 h-3 ${model.supportsImages ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-[rgb(var(--muted))]">Vision</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  onClick={() => onUpdate({ supportsStreaming: !model.supportsStreaming })}
                  className={`toggle w-9 h-5 ${model.supportsStreaming ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                >
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

function ProviderCard({
  provider,
  onUpdate,
  onDelete,
}: {
  provider: ModelProvider;
  onUpdate: (patch: Partial<ModelProvider>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);

  const fetchModels = async () => {
    if (!provider.baseUrl || !provider.apiKey) return;
    setFetching(true);
    try {
      const modelsUrl = provider.baseUrl.includes('/chat/completions')
        ? provider.baseUrl.replace('/chat/completions', '/models')
        : `${provider.baseUrl}/models`;
      const response = await fetchWithProxyFallback(
        modelsUrl,
        { headers: { 'Authorization': `Bearer ${provider.apiKey}` } },
        !!provider.useProxy,
        () => onUpdate({ useProxy: true }),
      );
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models: ModelConfig[] = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id,
        contextLength: m.context_length || 4096,
        supportsImages: false,
        supportsStreaming: true,
      }));
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
        {/* Enable toggle */}
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
          </div>

          {/* Models */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Models</p>
              <div className="flex gap-1">
                <button onClick={fetchModels} disabled={fetching} className="btn-secondary py-1 px-3 text-xs gap-1.5">
                  <Download size={12} />
                  {fetching ? 'Fetching...' : 'Fetch'}
                </button>
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

export default function ProvidersPanel({ providers, onUpdateProvider, onAddProvider, onDeleteProvider, onClose }: ProvidersPanelProps) {
  return (
    <div className="flex flex-col h-full w-full bg-[rgb(var(--panel))] border-l border-[rgb(var(--border))] shrink-0 fixed inset-0 z-50">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--border))]">
        <h2 className="font-semibold text-base">Model Providers</h2>
        <div className="flex items-center gap-2">
          <button onClick={onAddProvider} className="btn-primary py-2 px-4 text-xs gap-1.5">
            <Plus size={14} />
            Add provider
          </button>
          <button onClick={onClose} className="btn-icon">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-safe">
        <p className="text-xs text-[rgb(var(--muted))] mb-4">
          Add any OpenAI-compatible API endpoint. API keys are stored locally.
        </p>
        <div className="max-w-full overflow-x-hidden">
          {providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              onUpdate={patch => onUpdateProvider(p.id, patch)}
              onDelete={() => onDeleteProvider(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
