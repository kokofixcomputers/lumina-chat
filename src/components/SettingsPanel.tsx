import { X, Database, Settings as SettingsIcon, Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Download, Upload, FileDown, Menu, Info } from 'lucide-react';
import { useState } from 'react';
import type { AppSettings, ModelSettings, ModelProvider, ModelConfig } from '../types';
import { getModelInfo } from '../utils/models';
import { integratedProviders, type IntegratedProviderTemplate } from '../data/integratedProviders';


interface SettingsPanelProps {
  settings: AppSettings;
  conversations: any[];
  onUpdateModelSettings: (patch: Partial<ModelSettings>) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  onAddIntegratedProvider: (template: IntegratedProviderTemplate) => void;
  onAddProvider: () => void;
  onDeleteProvider: (id: string) => void;
  onImportData: (data: any) => void;
  onClose: () => void;
}


function SliderField({
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


export default function SettingsPanel({
  settings,
  conversations,
  onUpdateModelSettings,
  onUpdateSettings,
  onUpdateProvider,
  onAddProvider,
  onDeleteProvider,
  onAddIntegratedProvider,
  onImportData,
  onClose,
}: SettingsPanelProps) {
  const ms = settings.modelSettings;
  const [activeTab, setActiveTab] = useState<'general' | 'providers' | 'data' | 'about'>('general');
  const [sidebarOpen, setSidebarOpen] = useState(false);


  const exportData = () => {
    const data = {
      settings,
      conversations,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          onImportData(data);
          alert('Data imported successfully!');
        } catch (err) {
          alert('Failed to import data: Invalid file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };


  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 hidden md:block"
        onClick={onClose}
      />

      {/* Settings panel - centered and 80% width */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4">
        <div className="side-panel flex-row w-full h-full md:max-w-[80vw] md:h-[80vh] md:rounded-2xl shadow-2xl relative overflow-hidden">

          {/* Sidebar */}
          <div className={`w-56 border-r border-[rgb(var(--border))] flex flex-col shrink-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:bg-[rgb(var(--panel))] max-md:shadow-2xl max-md:transition-transform ${
          sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        }`}>
            <div className="px-4 py-4 border-b border-[rgb(var(--border))] flex items-center justify-between">
              <h2 className="font-semibold text-base">Settings</h2>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden btn-icon">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 p-2">
              <button
                onClick={() => { setActiveTab('general'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                  activeTab === 'general'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <SettingsIcon size={16} />
                General
              </button>
              <button
                onClick={() => { setActiveTab('providers'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'providers'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <Database size={16} />
                Model Providers
              </button>
              <button
                onClick={() => { setActiveTab('data'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'data'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <FileDown size={16} />
                Import/Export Data
              </button>
              <button
                onClick={() => { setActiveTab('about'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'about'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <Info size={16} />
                About
              </button>
            </div>
          </div>

          {/* Mobile sidebar backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <button onClick={() => setSidebarOpen(true)} className="md:hidden btn-icon">
                  <Menu size={18} />
                </button>
                <h2 className="font-semibold">
                  {activeTab === 'general' ? 'General Settings'
                    : activeTab === 'providers' ? 'Model Providers'
                    : activeTab === 'data' ? 'Import/Export Data'
                    : 'About'}
                </h2>
              </div>
              <button onClick={onClose} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            {activeTab === 'general' ? (
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
                    min={256} max={8192} step={256}
                    onChange={v => onUpdateModelSettings({ maxTokens: v })}
                    hint="Maximum tokens in the response"
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

                {/* API Keys */}
              </div>

            ) : activeTab === 'providers' ? (
              <div className="flex-1 overflow-y-auto p-5 pb-safe max-w-4xl">
                <section className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-3">Integrated Providers</h3>
                  <p className="text-xs text-[rgb(var(--muted))] mb-3">
                    Pre-configured providers with easy setup.
                  </p>
                  <div className="grid gap-2">
                    {integratedProviders.map(template => (
                      <IntegratedProviderCard
                        key={template.id}
                        template={template}
                        existingProvider={settings.providers.find(p => p.id === template.id && p.isIntegrated)}
                        onAdd={() => onAddIntegratedProvider(template)}
                        onUpdate={patch => {
                          const existing = settings.providers.find(p => p.id === template.id);
                          if (existing) onUpdateProvider(existing.id, patch);
                        }}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-3">Custom Providers</h3>
                  <p className="text-xs text-[rgb(var(--muted))] mb-3">
                    Add any OpenAI-compatible API endpoint. API keys are stored locally.
                  </p>
                  <button onClick={onAddProvider} className="btn-primary mb-4">
                    <Plus size={14} />
                    Add Custom Provider
                  </button>
                  <div className="max-w-full overflow-x-hidden">
                    {settings.providers.filter(p => !p.isIntegrated).map(p => (
                      <ProviderCard
                        key={p.id}
                        provider={p}
                        onUpdate={patch => onUpdateProvider(p.id, patch)}
                        onDelete={() => onDeleteProvider(p.id)}
                      />
                    ))}
                  </div>
                </section>
              </div>

            ) : activeTab === 'data' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Warning:</strong> The exported data contains API keys and other sensitive information in raw text. Please safeguard properly.
                  </p>
                </div>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Export Data</h3>
                  <p className="text-sm text-[rgb(var(--muted))] mb-4">
                    Export all your data including settings, API keys, providers, models, and conversations to a JSON file.
                  </p>
                  <button onClick={exportData} className="btn-primary">
                    <Download size={16} />
                    Export Data to File
                  </button>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Import Data</h3>
                  <p className="text-sm text-[rgb(var(--muted))] mb-4">
                    Import data from a previously exported JSON file. This will replace all current data.
                  </p>
                  <button onClick={importData} className="btn-secondary">
                    <Upload size={16} />
                    Import Data from File
                  </button>
                </section>
              </div>

            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-3xl mx-auto">
                <div className="text-center space-y-6">
                  <div className="w-full aspect-[1456/720] bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 rounded-2xl shadow-lg overflow-hidden">
                    <img
                      src="/banner.png"
                      alt="Lumina Chat Banner"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                      Lumina Chat
                    </h1>
                    <p className="text-lg text-[rgb(var(--muted))] max-w-2xl mx-auto leading-relaxed">
                      A powerful, elegant AI chat interface that brings together multiple AI providers in one seamless experience.
                      Connect to OpenAI, Anthropic, or any OpenAI-compatible API to unlock intelligent conversations with
                      customizable models and advanced settings.
                    </p>
                  </div>
                  <div className="pt-4 text-sm">
                    <p>Version 1.0.0</p>
                  </div>
                </div>
              </div>
            )}
          </div>  {/* end content */}

        </div>  {/* end side-panel */}
      </div>  {/* end fixed inset-0 flex */}
    </>
  );
}


function IntegratedProviderCard({
  template,
  existingProvider,
  onAdd,
  onUpdate,
}: {
  template: IntegratedProviderTemplate;
  existingProvider?: ModelProvider;
  onAdd: () => void;
  onUpdate: (patch: Partial<ModelProvider>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [fetching, setFetching] = useState(false);

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
      const modelsUrl = `${baseUrl}/models`;
      const headers: Record<string, string> = {};
      if (template.requireAuth && existingProvider.apiKey) {
        headers['Authorization'] = `Bearer ${existingProvider.apiKey}`;
      }
      const response = await fetch(modelsUrl, { headers });
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
          <br></br>
          <div className="flex items-center justify-between">
            <p className="text-xs text-[rgb(var(--muted))]">{existingProvider.models.length} models configured</p>
            <button onClick={fetchModels} disabled={fetching} className="btn-secondary py-1 px-3 text-xs gap-1.5">
              <Download size={12} />
              {fetching ? 'Fetching...' : 'Refresh Models'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
      const response = await fetch(modelsUrl, {
        headers: { 'Authorization': `Bearer ${provider.apiKey}` },
      });
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
