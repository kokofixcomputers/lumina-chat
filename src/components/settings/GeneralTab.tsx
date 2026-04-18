import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import type { AppSettings, ModelSettings } from '../../types';
import { SliderField, ProviderDot } from './shared';

interface GeneralTabProps {
  settings: AppSettings;
  onUpdateModelSettings: (patch: Partial<ModelSettings>) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export default function GeneralTab({ settings, onUpdateModelSettings, onUpdateSettings }: GeneralTabProps) {
  const ms = settings.modelSettings;
  const [showSttPicker, setShowSttPicker] = useState(false);
  const [sttModelSearch, setSttModelSearch] = useState('');
  const [sttCollapsedProviders, setSttCollapsedProviders] = useState<Set<string>>(new Set());
  const sttDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSttPicker) return;
    const handler = (e: MouseEvent) => {
      if (sttDropdownRef.current && !sttDropdownRef.current.contains(e.target as Node)) {
        setShowSttPicker(false);
        setSttModelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSttPicker]);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
      {/* Appearance */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Appearance</h3>
        <div className="form-group">
          <label className="form-label">Theme</label>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map(t => (
              <button
                key={t}
                onClick={() => onUpdateSettings({ theme: t })}
                className={`flex-1 rounded-xl px-3.5 py-2 text-xs capitalize font-medium transition-all ${
                  settings.theme === t
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                    : 'border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Prettify model names</label>
            <button
              onClick={() => onUpdateSettings({ prettifyModelNames: !settings.prettifyModelNames })}
              className={`toggle ${settings.prettifyModelNames !== false ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${settings.prettifyModelNames !== false ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Show formatted model names instead of IDs</p>
        </div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">QoL Features</h3>
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Generate Title</label>
            <button
              onClick={() => onUpdateSettings({ generateTitle: !settings.generateTitle })}
              className={`toggle ${settings.generateTitle !== false ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${settings.generateTitle !== false ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Auto-generate conversation title after first message</p>
        </div>
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Generate Follow-Up Messages</label>
            <button
              onClick={() => onUpdateSettings({ generateFollowUps: !settings.generateFollowUps })}
              className={`toggle ${settings.generateFollowUps !== false ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${settings.generateFollowUps !== false ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Show suggested follow-up questions after each response</p>
        </div>
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Allow Image Generation from LLM</label>
            <button
              onClick={() => onUpdateSettings({ allowImageGeneration: !settings.allowImageGeneration })}
              className={`toggle ${settings.allowImageGeneration ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${settings.allowImageGeneration ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Allow AI to generate images via function calling</p>
        </div>
        {settings.allowImageGeneration && (
          <div className="form-group">
            <label className="form-label">Image Generation Model</label>
            <input
              type="text"
              value={settings.imageGenerationModel || 'dall-e-3'}
              onChange={e => onUpdateSettings({ imageGenerationModel: e.target.value })}
              className="input text-sm"
              placeholder="dall-e-3"
            />
            <p className="form-help">Model to use for AI-initiated image generation</p>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Speech-to-Text Model</label>

          {/* Trigger button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSttPicker(v => !v)}
              className="input text-sm w-full flex items-center gap-2 text-left"
            >
              {(() => {
                const sttUrl = settings.sttBaseUrl;
                const sttModel = settings.sttModel || 'gpt-4o-transcribe';
                const matched = settings.providers.find(
                  p => p.enabled && p.baseUrl && sttUrl &&
                    p.baseUrl.replace(/\/$/, '') === sttUrl.replace(/\/$/, '')
                );
                const providerName = matched?.name ?? 'Custom';
                return (
                  <>
                    {matched && (
                      <ProviderDot providerId={matched.id} providerName={matched.name} />
                    )}
                    <span className="flex-1 truncate">
                      {providerName} — {sttModel}
                    </span>
                    <ChevronDown size={13} className="text-[rgb(var(--muted))] shrink-0" />
                  </>
                );
              })()}
            </button>

            {/* Dropdown */}
            {showSttPicker && (
              <div
                ref={sttDropdownRef}
                className="model-picker-dropdown absolute z-50 w-full"
                style={{ bottom: '100%', marginBottom: 8 }}
              >
                {/* Search */}
                <div className="flex items-center gap-2 mx-2 mb-1 px-2.5 py-1.5 rounded-lg bg-[rgb(var(--bg))] border border-[rgb(var(--border))]">
                  <Search size={13} className="text-[rgb(var(--muted))] shrink-0" />
                  <input
                    value={sttModelSearch}
                    onChange={e => setSttModelSearch(e.target.value)}
                    placeholder="Search models..."
                    className="flex-1 bg-transparent text-[13px] outline-none text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
                  />
                </div>

                {/* Groups */}
                {(() => {
                  const grouped = settings.providers
                    .filter(p => p.enabled && p.models.length > 0)
                    .reduce<Record<string, { providerId: string; providerName: string; fullId: string; modelId: string; modelName: string }[]>>(
                      (acc, p) => {
                        const filtered = p.models.filter(m =>
                          !sttModelSearch ||
                          m.id.toLowerCase().includes(sttModelSearch.toLowerCase()) ||
                          (m.name ?? '').toLowerCase().includes(sttModelSearch.toLowerCase())
                        );
                        if (filtered.length > 0) {
                          acc[p.name] = filtered.map(m => ({
                            providerId: p.id,
                            providerName: p.name,
                            fullId: `${p.id}/${m.id}`,
                            modelId: m.id,
                            modelName: m.name || m.id,
                          }));
                        }
                        return acc;
                      },
                      {}
                    );

                  const currentFullId = (() => {
                    const sttUrl = settings.sttBaseUrl;
                    const sttModel = settings.sttModel || 'gpt-4o-transcribe';
                    const matched = settings.providers.find(
                      p => p.enabled && p.baseUrl && sttUrl &&
                        p.baseUrl.replace(/\/$/, '') === sttUrl.replace(/\/$/, '')
                    );
                    return matched ? `${matched.id}/${sttModel}` : `__bare__/${sttModel}`;
                  })();

                  if (Object.keys(grouped).length === 0) {
                    return (
                      <p className="text-[12px] text-[rgb(var(--muted))] text-center py-4">
                        No models found
                      </p>
                    );
                  }

                  return Object.entries(grouped).map(([providerName, models]) => {
                    const isCollapsed = sttCollapsedProviders.has(providerName);
                    return (
                      <div key={providerName} className="mb-1">
                        {/* Provider header */}
                        <button
                          type="button"
                          onClick={() => {
                            const newSet = new Set(sttCollapsedProviders);
                            if (isCollapsed) newSet.delete(providerName);
                            else newSet.add(providerName);
                            setSttCollapsedProviders(newSet);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 mt-1 w-full hover:bg-black/[0.03] dark:hover:bg-white/[0.03] rounded-lg transition-colors"
                        >
                          <ProviderDot
                            providerId={models[0].providerId}
                            providerName={providerName}
                          />
                          <span className="text-[11px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider flex-1 text-left">
                            {providerName}
                          </span>
                          <ChevronDown
                            size={12}
                            className={`text-[rgb(var(--muted))] transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                          />
                        </button>

                        {/* Models */}
                        {!isCollapsed && models.map(m => {
                          const isSelected = currentFullId === m.fullId;
                          return (
                            <button
                              key={m.fullId}
                              type="button"
                              onClick={() => {
                                const provider = settings.providers.find(p => p.id === m.providerId);
                                onUpdateSettings({
                                  sttModel: m.modelId,
                                  sttBaseUrl: provider?.baseUrl || '',
                                });
                                setShowSttPicker(false);
                                setSttModelSearch('');
                              }}
                              className={`model-option w-full text-left ${isSelected ? 'selected' : ''}`}
                            >
                              <span className="flex-1 font-medium truncate">{m.modelName}</span>
                              {isSelected && (
                                <Check size={13} className="text-[rgb(var(--accent))] shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          <p className="form-help">
            Model used for microphone transcription. Picks the provider's base URL automatically.
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">Max History</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="3"
              value={settings.maxHistory || 10}
              onChange={e => {
                const val = parseInt(e.target.value);
                onUpdateSettings({ maxHistory: val >= 3 ? val : 3 });
              }}
              className="input w-24 text-center"
            />
            <span className="text-sm text-[rgb(var(--muted))]">messages</span>
          </div>
          <p className="form-help">Number of recent messages to send to AI (minimum 3, saves credits)</p>
        </div>
      </section>

      {/* Model Settings */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Model Parameters</h3>
        <SliderField
          label="Temperature"
          value={ms.temperature}
          min={0} max={2} step={0.1}
          onChange={v => onUpdateModelSettings({ temperature: v })}
          hint="Higher = more creative, lower = more focused"
        />
        <SliderField
          label="Max Tokens"
          value={ms.maxTokens}
          min={0} max={8000} step={256}
          onChange={v => onUpdateModelSettings({ maxTokens: v })}
          hint="Maximum tokens in the response (0 = unlimited)"
        />
        <SliderField
          label="Top P"
          value={ms.topP}
          min={0} max={1} step={0.05}
          onChange={v => onUpdateModelSettings({ topP: v })}
          hint="Nucleus sampling threshold"
        />
        <SliderField
          label="Frequency Penalty"
          value={ms.frequencyPenalty}
          min={-2} max={2} step={0.1}
          onChange={v => onUpdateModelSettings({ frequencyPenalty: v })}
          hint="Penalize repeated tokens"
        />
        <SliderField
          label="Presence Penalty"
          value={ms.presencePenalty}
          min={-2} max={2} step={0.1}
          onChange={v => onUpdateModelSettings({ presencePenalty: v })}
          hint="Encourage new topics"
        />
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Streaming</label>
            <button
              onClick={() => onUpdateModelSettings({ stream: !ms.stream })}
              className={`toggle ${ms.stream ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${ms.stream ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Stream responses as they're generated</p>
        </div>
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Use new responses API (beta)</label>
            <button
              onClick={() => onUpdateModelSettings({ useResponsesApi: !ms.useResponsesApi })}
              className={`toggle ${ms.useResponsesApi ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${ms.useResponsesApi ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Use /v1/responses endpoint instead of /v1/chat/completions (supports reasoning models)</p>
        </div>
      </section>

      {/* System Prompt */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">System Prompt</h3>
        <div className="form-group">
          <label className="form-label">Default system prompt</label>
          <textarea
            value={ms.systemPrompt}
            onChange={e => onUpdateModelSettings({ systemPrompt: e.target.value })}
            className="input text-sm resize-none font-mono"
            rows={5}
            placeholder="You are a helpful AI assistant..."
          />
          <p className="form-help">Applied to new conversations</p>
        </div>
      </section>
    </div>
  );
}
