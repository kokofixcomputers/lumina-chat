import { useState } from 'react';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import type { ModelProvider, ModelConfig } from '../../types';

interface DirectModelsTabProps {
  providers: ModelProvider[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ModelProvider>) => void;
  onDelete: (id: string) => void;
}

export default function DirectModelsTab({ providers, onAdd, onUpdate, onDelete }: DirectModelsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-5 pb-safe max-w-2xl">
      <p className="text-xs text-[rgb(var(--muted))] mb-4">
        Direct models send requests straight to the URL you provide — no base URL path appending.
        Useful for local models, proxies, or any endpoint that already is the full chat completions URL.
      </p>
      <button onClick={onAdd} className="btn-primary mb-4 text-sm">
        <Plus size={14} />Add direct model
      </button>
      <div className="space-y-3">
        {providers.map(p => (
          <DirectModelCard key={p.id} provider={p} onUpdate={patch => onUpdate(p.id, patch)} onDelete={() => onDelete(p.id)} />
        ))}
      </div>
    </div>
  );
}

function DirectModelCard({ provider, onUpdate, onDelete }: {
  provider: ModelProvider;
  onUpdate: (patch: Partial<ModelProvider>) => void;
  onDelete: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const model = provider.models[0] ?? { id: '', name: '' };

  const setModel = (patch: Partial<ModelConfig>) => {
    onUpdate({ models: [{ ...model, ...patch }] });
  };

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onUpdate({ enabled: !provider.enabled })}
          className={`toggle w-10 h-5 shrink-0 ${provider.enabled ? 'bg-green-500' : 'bg-black/15 dark:bg-white/15'}`}
        >
          <span className={`toggle-thumb w-3 h-3 ${provider.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
        <input
          className="input text-sm font-semibold flex-1"
          value={provider.name}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder="Display name"
        />
        <button onClick={onDelete} className="btn-icon w-7 h-7 text-[rgb(var(--muted))] hover:text-red-500 shrink-0">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="form-group mb-0">
        <label className="form-label text-xs">Chat Completions URL</label>
        <input
          className="input text-sm font-mono"
          value={provider.baseUrl}
          onChange={e => onUpdate({ baseUrl: e.target.value })}
          placeholder="https://example.com/v1/chat/completions"
        />
        <p className="form-help">Requests are sent directly to this URL — nothing is appended.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="form-group mb-0">
          <label className="form-label text-xs">Model ID</label>
          <input
            className="input text-sm font-mono"
            value={model.id}
            onChange={e => setModel({ id: e.target.value, name: e.target.value })}
            placeholder="gpt-4o"
          />
        </div>
        <div className="form-group mb-0">
          <label className="form-label text-xs">API Key</label>
          <div className="relative">
            <input
              className="input text-sm pr-9 font-mono"
              type={showKey ? 'text' : 'password'}
              value={provider.apiKey}
              onChange={e => onUpdate({ apiKey: e.target.value })}
              placeholder="sk-... (optional)"
            />
            <button
              onClick={() => setShowKey(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
