import { X, Database, Settings as SettingsIcon, Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, Download, Upload, FileDown, Menu, Info, Cloud } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { AppSettings, ModelSettings, ModelProvider, ModelConfig } from '../types';
import { getModelInfo } from '../utils/models';
import { integratedProviders, type IntegratedProviderTemplate } from '../data/integratedProviders';
import { encryptData, decryptData } from '../utils/encryption';
import { setSyncStatus } from '../utils/syncStatus';
import { fetchWithProxyFallback } from '../utils/proxyFetch';


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

const TAGLINES = [
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
  const [activeTab, setActiveTab] = useState<'general' | 'providers' | 'data' | 'cloudsync' | 'tools' | 'workflows' | 'localagent' | 'about'>('general');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [syncEmail, setSyncEmail] = useState(settings.cloudSync?.email || '');
  const [syncPassword, setSyncPassword] = useState(settings.cloudSync?.password || '');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [serverData, setServerData] = useState<any>(null);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.cloudSync?.enabled || false);
  const [agentPort, setAgentPort] = useState(settings.localAgent?.port || '14345');
  const [agentProtocol, setAgentProtocol] = useState<'ws' | 'wss'>(settings.localAgent?.protocol || 'ws');
  const [agentEnabled, setAgentEnabled] = useState(settings.localAgent?.enabled || false);
  const [agentStatus, setAgentStatus] = useState<'disabled' | 'error' | 'connected'>('disabled');

  useEffect(() => {
    if (!agentEnabled) {
      setAgentStatus('disabled');
      return;
    }
    const checkConnection = () => {
      const wsUrl = `${agentProtocol}://localhost:${agentPort}`;
      try {
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          setAgentStatus('error');
        }, 2000);
        ws.onopen = () => {
          clearTimeout(timeout);
          setAgentStatus('connected');
          ws.close();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          setAgentStatus('error');
        };
      } catch {
        setAgentStatus('error');
      }
    };
    checkConnection();
    const interval = setInterval(() => {
      if (agentStatus !== 'connected') {
        checkConnection();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [agentEnabled, agentPort, agentProtocol, agentStatus]);

  useEffect(() => {
    if (activeTab !== 'about') return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
        setFade(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (!autoSyncEnabled || !syncEmail || !syncPassword) {
      setSyncStatus('disabled');
    } else {
      setSyncStatus('synced');
    }
  }, [autoSyncEnabled, syncEmail, syncPassword]);

  const syncToCloud = async (silent = false) => {
    if (!autoSyncEnabled || !syncEmail || !syncPassword || !cloudSyncEnabled) {
      setSyncStatus('disabled');
      return;
    }
    if (!silent) setSyncStatus('loading');
    setSyncStatus('syncing');
    try {
      const currentSettings = JSON.parse(localStorage.getItem('lumina_settings') || '{}');
      const currentConversations = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
      const encrypted = encryptData({ settings: currentSettings, conversations: currentConversations }, syncPassword);
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', email: syncEmail, data: encrypted })
      });
      const result = await response.json();
      if (result.disabled) {
        setCloudSyncEnabled(false);
        setSyncStatus('disabled');
      } else if (!result.success) {
        throw new Error(result.error || 'Sync failed');
      } else {
        setSyncStatus('synced');
      }
      if (!silent) {
        setSyncMessage('Synced to cloud');
        setSyncStatus('success');
      }
    } catch (err) {
      setSyncStatus('error');
      if (!silent) {
        setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
        setSyncStatus('error');
      }
    }
  };

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
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 hidden md:block animate-fade-in"
        onClick={onClose}
      />

      {/* Settings panel - centered and 80% width */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-fade-in">
        <div className="side-panel flex-row w-full h-full md:max-w-[80vw] md:h-[80vh] md:rounded-2xl shadow-2xl relative overflow-hidden animate-scale-in">

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
                onClick={() => { setActiveTab('cloudsync'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'cloudsync'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <Cloud size={16} />
                Cloud Sync
              </button>
              <button
                onClick={() => { setActiveTab('workflows'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'workflows'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <SettingsIcon size={16} />
                Workflows
              </button>
              <button
                onClick={() => { setActiveTab('tools'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'tools'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <SettingsIcon size={16} />
                Tools
              </button>
              <button
                onClick={() => { setActiveTab('localagent'); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
                  activeTab === 'localagent'
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
                }`}
              >
                <Database size={16} />
                Local Agent
                <div className={`ml-auto w-2 h-2 rounded-full ${
                  agentStatus === 'disabled' ? 'bg-gray-400' :
                  agentStatus === 'error' ? 'bg-red-500' :
                  'bg-green-500'
                }`} />
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
                    : activeTab === 'cloudsync' ? 'Cloud Sync'
                    : activeTab === 'workflows' ? 'Workflows'
                    : activeTab === 'tools' ? 'Tools'
                    : activeTab === 'localagent' ? 'Local Agent'
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
                    <label className="form-label">Speech-to-Text Model</label>
                    <input
                      type="text"
                      value={settings.sttModel || 'gpt-4o-transcribe'}
                      onChange={e => onUpdateSettings({ sttModel: e.target.value })}
                      className="input text-sm"
                      placeholder="gpt-4o-transcribe"
                    />
                    <p className="form-help">Model used for microphone transcription (e.g. gpt-4o-transcribe, whisper-1)</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Speech-to-Text Base URL</label>
                    <input
                      type="text"
                      value={settings.sttBaseUrl || ''}
                      onChange={e => onUpdateSettings({ sttBaseUrl: e.target.value })}
                      className="input text-sm font-mono"
                      placeholder="https://api.openai.com/v1"
                    />
                    <p className="form-help">Base URL for the transcription API. Defaults to the first enabled provider's URL.</p>
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

            ) : activeTab === 'cloudsync' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
                {!cloudSyncEnabled ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      <strong>Cloud Sync Unavailable:</strong> The database connection is currently unavailable. This feature has been disabled.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Warning:</strong> While there is little chance that your data get's stolen from our servers, the chance is not 0%. We are not responsible for stolen data.
                      </p>
                    </div>
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Sync Configuration</h3>
                      <div className="form-group">
                        <div className="flex items-center justify-between">
                          <label className="form-label mb-0">Enable Auto-Sync</label>
                          <button
                            onClick={() => {
                              const newEnabled = !autoSyncEnabled;
                              setAutoSyncEnabled(newEnabled);
                              onUpdateSettings({ cloudSync: { enabled: newEnabled, email: syncEmail, password: syncPassword } });
                              if (!newEnabled) {
                                setSyncStatus('disabled');
                              } else if (syncEmail && syncPassword) {
                                setSyncStatus('synced');
                              }
                            }}
                            className={`toggle ${autoSyncEnabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                          >
                            <span className={`toggle-thumb ${autoSyncEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <p className="form-help">Automatically sync changes to cloud</p>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                          type="email"
                          value={syncEmail}
                          onChange={e => {
                            setSyncEmail(e.target.value);
                            onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: e.target.value, password: syncPassword } });
                          }}
                          className="input text-sm"
                          placeholder="your@email.com"
                          disabled={syncStatus === 'loading'}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Password (AES-256 Encryption)</label>
                        <input
                          type="password"
                          value={syncPassword}
                          onChange={e => {
                            setSyncPassword(e.target.value);
                            onUpdateSettings({ cloudSync: { enabled: autoSyncEnabled, email: syncEmail, password: e.target.value } });
                          }}
                          className="input text-sm"
                          placeholder="Enter encryption password"
                          disabled={syncStatus === 'loading'}
                        />
                        <p className="form-help">Your data is encrypted client-side before upload</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={async () => {
                            if (!syncEmail || !syncPassword) {
                              setSyncMessage('Please enter email and password');
                              setSyncStatus('error');
                              return;
                            }
                            setSyncStatus('loading');
                            setSyncMessage('Uploading data...');
                            try {
                              const encrypted = encryptData({ settings, conversations }, syncPassword);
                              const response = await fetch('/api/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'save', email: syncEmail, data: encrypted })
                              });
                              const result = await response.json();
                              if (result.disabled) {
                                setCloudSyncEnabled(false);
                                setSyncMessage('Cloud sync is unavailable');
                                setSyncStatus('error');
                              } else if (result.success) {
                                setSyncMessage('Data uploaded successfully!');
                                setSyncStatus('success');
                              } else {
                                throw new Error(result.error || 'Upload failed');
                              }
                            } catch (err) {
                              setSyncMessage(err instanceof Error ? err.message : 'Upload failed');
                              setSyncStatus('error');
                            }
                          }}
                          disabled={syncStatus === 'loading'}
                          className="btn-primary"
                        >
                          <Upload size={16} />
                          {syncStatus === 'loading' ? 'Uploading...' : 'Upload to Cloud'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!syncEmail || !syncPassword) {
                              setSyncMessage('Please enter email and password');
                              setSyncStatus('error');
                              return;
                            }
                            setSyncStatus('loading');
                            setSyncMessage('Checking for data...');
                            try {
                              const response = await fetch('/api/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'get', email: syncEmail })
                              });
                              const result = await response.json();
                              if (result.disabled) {
                                setCloudSyncEnabled(false);
                                setSyncMessage('Cloud sync is unavailable');
                                setSyncStatus('error');
                              } else if (!result.exists) {
                                setSyncMessage('No data found for this email');
                                setSyncStatus('error');
                              } else {
                                const decrypted = decryptData(result.data, syncPassword);
                                if (!decrypted) {
                                  setSyncMessage('Invalid password');
                                  setSyncStatus('error');
                                } else {
                                  setServerData(decrypted);
                                  setShowConflictModal(true);
                                  setSyncStatus('idle');
                                  setSyncMessage('');
                                }
                              }
                            } catch (err) {
                              setSyncMessage(err instanceof Error ? err.message : 'Download failed');
                              setSyncStatus('error');
                            }
                          }}
                          disabled={syncStatus === 'loading'}
                          className="btn-secondary"
                        >
                          <Download size={16} />
                          {syncStatus === 'loading' ? 'Checking...' : 'Download from Cloud'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!syncEmail) {
                              setSyncMessage('Please enter email address');
                              setSyncStatus('error');
                              return;
                            }
                            if (!confirm('Are you sure you want to erase all your cloud data? This cannot be undone.')) return;
                            setSyncStatus('loading');
                            setSyncMessage('Erasing data...');
                            try {
                              const response = await fetch('/api/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'delete', email: syncEmail })
                              });
                              const result = await response.json();
                              if (result.disabled) {
                                setCloudSyncEnabled(false);
                                setSyncMessage('Cloud sync is unavailable');
                                setSyncStatus('error');
                              } else if (result.success) {
                                setSyncMessage('Cloud data erased successfully');
                                setSyncStatus('success');
                              } else {
                                throw new Error(result.error || 'Delete failed');
                              }
                            } catch (err) {
                              setSyncMessage(err instanceof Error ? err.message : 'Delete failed');
                              setSyncStatus('error');
                            }
                          }}
                          disabled={syncStatus === 'loading'}
                          className="btn-secondary text-red-600 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                          Erase My Data
                        </button>
                      </div>
                      {syncMessage && (
                        <div className={`mt-4 p-3 rounded-xl text-sm ${
                          syncStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' :
                          syncStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200' :
                          'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                        }`}>
                          {syncMessage}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>

            ) : activeTab === 'localagent' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Local Agent Connection</h3>
                  <p className="text-sm text-[rgb(var(--muted))] mb-4">
                    Connect Lumina Chat to a agent running locally on your computer for AI to create/edit files.
                  </p>
                  <div className="form-group">
                    <div className="flex items-center justify-between">
                      <label className="form-label mb-0">Enable Local Agent</label>
                      <button
                        onClick={() => {
                          const newEnabled = !agentEnabled;
                          setAgentEnabled(newEnabled);
                          onUpdateSettings({ localAgent: { enabled: newEnabled, port: agentPort, protocol: agentProtocol } });
                        }}
                        className={`toggle ${agentEnabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                      >
                        <span className={`toggle-thumb ${agentEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <p className="form-help">Enable connection to local agent</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Protocol</label>
                    <div className="flex gap-2">
                      {(['ws', 'wss'] as const).map(proto => (
                        <button
                          key={proto}
                          onClick={() => {
                            setAgentProtocol(proto);
                            onUpdateSettings({ localAgent: { enabled: agentEnabled, port: agentPort, protocol: proto } });
                          }}
                          disabled={!agentEnabled}
                          className={`flex-1 rounded-xl px-3.5 py-2 text-xs uppercase font-medium transition-all ${
                            agentProtocol === proto
                              ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                              : 'border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          {proto}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Port</label>
                    <input
                      type="text"
                      value={agentPort}
                      onChange={e => {
                        setAgentPort(e.target.value);
                        onUpdateSettings({ localAgent: { enabled: agentEnabled, port: e.target.value, protocol: agentProtocol } });
                      }}
                      className="input text-sm"
                      placeholder="14345"
                    />
                    <p className="form-help">Port number where your local agent is running</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                      agentStatus === 'disabled' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' :
                      agentStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
                      'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        agentStatus === 'disabled' ? 'bg-gray-400' :
                        agentStatus === 'error' ? 'bg-red-500' :
                        'bg-green-500'
                      }`} />
                      {agentStatus === 'disabled' ? 'Disabled' :
                       agentStatus === 'error' ? 'Cannot Connect' :
                       'Connected'}
                    </div>
                    {agentStatus === 'connected' && (
                      <span className="text-xs text-[rgb(var(--muted))]">
                        {agentProtocol}://localhost:{agentPort}
                      </span>
                    )}
                  </div>
                </section>
              </div>

            ) : activeTab === 'workflows' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Custom Workflows</h3>
                  <p className="text-sm text-[rgb(var(--muted))] mb-4">
                    Create custom workflows with predefined prompts. Use them by typing /{'{'}slug{'}'} in the chat.
                  </p>
                  <button
                    onClick={() => {
                      const workflows = settings.workflows || [];
                      onUpdateSettings({
                        workflows: [...workflows, { id: Date.now().toString(), slug: 'newworkflow', prompt: 'Enter your prompt here' }]
                      });
                    }}
                    className="btn-primary mb-4"
                  >
                    <Plus size={14} />
                    Create Workflow
                  </button>
                  <div className="space-y-3">
                    {(settings.workflows || []).map((workflow) => (
                      <div key={workflow.id} className="border border-[rgb(var(--border))] rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="form-label text-xs">Slug</label>
                            <input
                              type="text"
                              value={workflow.slug}
                              onChange={(e) => {
                                const workflows = settings.workflows || [];
                                onUpdateSettings({
                                  workflows: workflows.map(w => w.id === workflow.id ? { ...w, slug: e.target.value } : w)
                                });
                              }}
                              className="input text-sm font-mono"
                              placeholder="code"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const workflows = settings.workflows || [];
                              onUpdateSettings({
                                workflows: workflows.filter(w => w.id !== workflow.id)
                              });
                            }}
                            className="btn-icon text-red-500 hover:text-red-600 mt-5"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div>
                          <label className="form-label text-xs">Prompt</label>
                          <textarea
                            value={workflow.prompt}
                            onChange={(e) => {
                              const workflows = settings.workflows || [];
                              onUpdateSettings({
                                workflows: workflows.map(w => w.id === workflow.id ? { ...w, prompt: e.target.value } : w)
                              });
                            }}
                            className="input text-sm resize-none"
                            rows={4}
                            placeholder="Always use python, the user will be prompting you to create an app."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

            ) : activeTab === 'tools' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Enable / Disable Tools</h3>
                  <p className="text-sm text-[rgb(var(--muted))] mb-4">Disabled tools are excluded from every request before they are loaded.</p>
                  <div className="space-y-2">
                    {[
                      { name: 'get_current_time', label: 'get_current_time', desc: 'Get the current date and time' },
                      { name: 'calculate', label: 'calculate', desc: 'Perform mathematical calculations' },
                      { name: 'google_search', label: 'google_search', desc: 'Search Google for information' },
                      { name: 'amazon_search', label: 'amazon_search', desc: 'Search Amazon products in real-time' },
                      { name: 'city_search', label: 'city_search', desc: 'Search for cities (use with hotel_search)' },
                      { name: 'hotel_search', label: 'hotel_search', desc: 'Search hotels in a city' },
                      { name: 'hotel_search_page', label: 'hotel_search_page', desc: 'Fetch next page of hotel results' },
                      { name: 'web_request', label: 'web_request', desc: 'Fetch and scrape content from a URL' },
                      { name: 'qanda', label: 'qanda', desc: 'Ask the user clarifying questions' },
                      { name: 'create_dev_env', label: 'create_dev_env', desc: 'Create Alpine Linux dev environment' },
                      { name: 'command_dev_env', label: 'command_dev_env', desc: 'Execute commands in dev environment' },
                      { name: 'artifact_dev_env', label: 'artifact_dev_env', desc: 'Download files from dev environment' },
                    ].map(({ name, label, desc }) => {
                      const disabled = (settings.disabledTools || []).includes(name);
                      return (
                        <div key={name} className="flex items-center justify-between py-2 border-b border-[rgb(var(--border))] last:border-0">
                          <div>
                            <p className="text-sm font-mono">{label}</p>
                            <p className="text-xs text-[rgb(var(--muted))]">{desc}</p>
                          </div>
                          <button
                            onClick={() => {
                              const current = settings.disabledTools || [];
                              onUpdateSettings({
                                disabledTools: disabled
                                  ? current.filter(t => t !== name)
                                  : [...current, name],
                              });
                            }}
                            className={`toggle ${!disabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                          >
                            <span className={`toggle-thumb ${!disabled ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Dev Env</h3>
                  <p className="text-sm text-[rgb(var(--muted))] mb-4">
                    Configure the development environment tool that allows AI to create and execute commands in isolated Alpine Linux containers.
                  </p>
                  
                  <div className="form-group">
                    <label className="form-label">WebSocket Address</label>
                    <input
                      type="text"
                      value={settings.devEnv?.address || 'ws://localhost:8765'}
                      onChange={e => onUpdateSettings({ devEnv: { ...settings.devEnv, address: e.target.value } })}
                      className="input text-sm font-mono"
                      placeholder="ws://localhost:8765"
                    />
                    <p className="form-help">WebSocket server address for dev environment</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">API Key</label>
                    <input
                      type="password"
                      value={settings.devEnv?.apiKey || 'kk_your_api_key_here'}
                      onChange={e => onUpdateSettings({ devEnv: { ...settings.devEnv, apiKey: e.target.value } })}
                      className="input text-sm font-mono"
                      placeholder="kk_your_api_key_here"
                    />
                    <p className="form-help">API key for authenticating with the dev environment server</p>
                  </div>

                  <div className="space-y-3 mt-6">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Tool Availability</h4>
                    
                    <div className="form-group">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="form-label mb-0">create_dev_env</label>
                          <p className="text-xs text-[rgb(var(--muted))]">Create Alpine Linux environment</p>
                        </div>
                        <button
                          onClick={() => onUpdateSettings({ 
                            devEnv: { 
                              ...settings.devEnv, 
                              tools: { 
                                ...settings.devEnv?.tools, 
                                createDevEnv: !(settings.devEnv?.tools?.createDevEnv ?? true) 
                              } 
                            } 
                          })}
                          className={`toggle ${(settings.devEnv?.tools?.createDevEnv ?? true) ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                        >
                          <span className={`toggle-thumb ${(settings.devEnv?.tools?.createDevEnv ?? true) ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="form-label mb-0">command_dev_env</label>
                          <p className="text-xs text-[rgb(var(--muted))]">Execute commands in dev environment</p>
                        </div>
                        <button
                          onClick={() => onUpdateSettings({ 
                            devEnv: { 
                              ...settings.devEnv, 
                              tools: { 
                                ...settings.devEnv?.tools, 
                                commandDevEnv: !(settings.devEnv?.tools?.commandDevEnv ?? true) 
                              } 
                            } 
                          })}
                          className={`toggle ${(settings.devEnv?.tools?.commandDevEnv ?? true) ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                        >
                          <span className={`toggle-thumb ${(settings.devEnv?.tools?.commandDevEnv ?? true) ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="form-label mb-0">artifact_dev_env</label>
                          <p className="text-xs text-[rgb(var(--muted))]">Download files from dev environment</p>
                        </div>
                        <button
                          onClick={() => onUpdateSettings({ 
                            devEnv: { 
                              ...settings.devEnv, 
                              tools: { 
                                ...settings.devEnv?.tools, 
                                artifactDevEnv: !(settings.devEnv?.tools?.artifactDevEnv ?? true) 
                              } 
                            } 
                          })}
                          className={`toggle ${(settings.devEnv?.tools?.artifactDevEnv ?? true) ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                        >
                          <span className={`toggle-thumb ${(settings.devEnv?.tools?.artifactDevEnv ?? true) ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl mx-auto">
                <div className="text-center space-y-6">
                  <div className="w-full aspect-[1456/720] bg-gradient-to-br from-gray-100 via-blue-50/40 to-purple-50/30 dark:from-gray-800 dark:via-blue-950/20 dark:to-purple-950/10 rounded-2xl shadow-lg overflow-hidden border border-[rgb(var(--border))]">
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
                    <h1 className="text-4xl font-bold text-[rgb(var(--text))]">
                      Lumina Chat
                    </h1>
                    <div className="h-7 flex items-center justify-center">
                      <p className={`text-lg text-[rgb(var(--muted))] transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
                        {TAGLINES[taglineIndex]}
                      </p>
                    </div>
                  </div>
                  
                  {/* Features */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                    <div className="bg-[rgb(var(--bg))] rounded-xl p-4 border border-[rgb(var(--border))]">
                      <Database size={20} className="text-[rgb(var(--text))] mb-2 mx-auto" />
                      <p className="text-sm text-[rgb(var(--text))] font-medium">Multi-Provider</p>
                      <p className="text-xs text-[rgb(var(--muted))] mt-1">OpenAI, Anthropic, Ollama & more</p>
                    </div>
                    <div className="bg-[rgb(var(--bg))] rounded-xl p-4 border border-[rgb(var(--border))]">
                      <SettingsIcon size={20} className="text-[rgb(var(--text))] mb-2 mx-auto" />
                      <p className="text-sm text-[rgb(var(--text))] font-medium">Customizable</p>
                      <p className="text-xs text-[rgb(var(--muted))] mt-1">Fine-tune models & parameters</p>
                    </div>
                    <div className="bg-[rgb(var(--bg))] rounded-xl p-4 border border-[rgb(var(--border))]">
                      <Eye size={20} className="text-[rgb(var(--text))] mb-2 mx-auto" />
                      <p className="text-sm text-[rgb(var(--text))] font-medium">Privacy First</p>
                      <p className="text-xs text-[rgb(var(--muted))] mt-1">All data stored locally</p>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="flex items-center justify-center gap-3 pt-4">
                    <a
                      href="https://github.com/kokofixcomputers/lumina-chat"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs py-2 px-4 gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                      GitHub
                    </a>
                    <a
                      href="https://github.com/kokofixcomputers/lumina-chat/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs py-2 px-4 gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Report Issue
                    </a>
                  </div>

                  <div className="pt-2 text-xs text-[rgb(var(--muted))]">
                    <p>Created by kokofixcomputers</p>
                  </div>

                  <div className="text-sm text-[rgb(var(--muted))]">
                    <p>Version 1.0.0</p>
                  </div>
                </div>
              </div>
            )}
          </div>  {/* end content */}

        </div>  {/* end side-panel */}
      </div>  {/* end fixed inset-0 flex */}

      {/* Conflict Resolution Modal */}
      {showConflictModal && serverData && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowConflictModal(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-lg font-semibold">Data Conflict Detected</h3>
              <p className="text-sm text-[rgb(var(--muted))]">
                We found existing data on the server for this email. What would you like to do?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    onImportData(serverData);
                    setShowConflictModal(false);
                    setSyncMessage('Local data overwritten with server data');
                    setSyncStatus('success');
                  }}
                  className="w-full btn-primary justify-center"
                >
                  Overwrite Local Data
                </button>
                <button
                  onClick={async () => {
                    setSyncStatus('loading');
                    try {
                      const encrypted = encryptData({ settings, conversations }, syncPassword);
                      const response = await fetch('/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'save', email: syncEmail, data: encrypted })
                      });
                      const result = await response.json();
                      if (result.success) {
                        setShowConflictModal(false);
                        setSyncMessage('Server data overwritten with local data');
                        setSyncStatus('success');
                      } else {
                        throw new Error(result.error || 'Upload failed');
                      }
                    } catch (err) {
                      setSyncMessage(err instanceof Error ? err.message : 'Upload failed');
                      setSyncStatus('error');
                      setShowConflictModal(false);
                    }
                  }}
                  className="w-full btn-secondary justify-center"
                >
                  Overwrite Server Data
                </button>
                <button
                  onClick={() => {
                    setShowConflictModal(false);
                    setSyncMessage('Sync cancelled');
                    setSyncStatus('idle');
                  }}
                  className="w-full btn-secondary justify-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
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
      const response = await fetchWithProxyFallback(
        modelsUrl,
        { headers },
        !!existingProvider.useProxy,
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
