import { X, Database, Settings as SettingsIcon, Settings2, Zap, FileDown, Menu, Info, Cloud, Brain, Share2, Puzzle } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { ModelProvider } from '../../types';
import { setSyncStatus } from '../../utils/syncStatus';
import type { SettingsPanelProps, TabType } from './types';

import GeneralTab from './GeneralTab';
import ProvidersTab from './ProvidersTab';
import DirectModelsTab from './DirectModelsTab';
import DataTab from './DataTab';
import CloudSyncTab from './CloudSyncTab';
import ToolsTab from './ToolsTab';
import ExtensionsTab from './ExtensionsTab';
import SharesTab from './SharesTab';
import WorkflowsTab from './WorkflowsTab';
import IntegrationsTab from './IntegrationsTab';
import LocalAgentTab from './LocalAgentTab';
import MemoriesTab from './MemoriesTab';
import AboutTab from './AboutTab';

export default function SettingsPanel({
  settings,
  conversations,
  onUpdateModelSettings,
  onUpdateSettings,
  onUpdateProvider,
  onAddProvider,
  onDeleteProvider,
  onAddIntegratedProvider,
  onUpsertApiFormat,
  onDeleteApiFormat,
  onImportData,
  onClose,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [fade, setFade] = useState(true);
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
        setTaglineIndex((prev) => (prev + 1) % 14);
        setFade(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    const cloudSync = settings.cloudSync;
    if (!cloudSync?.enabled || !cloudSync?.email || !cloudSync?.password) {
      setSyncStatus('disabled');
    } else {
      setSyncStatus('synced');
    }
  }, [settings.cloudSync]);

  const navBtn = (tab: TabType, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => { setActiveTab(tab); setSidebarOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1 ${
        activeTab === tab
          ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-sm'
          : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[rgb(var(--text))]'
      }`}
    >
      {icon}
      {label}
      {tab === 'localagent' && (
        <div className={`ml-auto w-2 h-2 rounded-full ${
          agentStatus === 'disabled' ? 'bg-gray-400' :
          agentStatus === 'error' ? 'bg-red-500' :
          'bg-green-500'
        }`} />
      )}
    </button>
  );

  const headerTitle: Record<TabType, string> = {
    general: 'General Settings',
    providers: 'Model Providers',
    apiformats: 'API Formats',
    directmodels: 'Direct Models',
    data: 'Import/Export Data',
    cloudsync: 'Cloud Sync',
    workflows: 'Workflows',
    tools: 'Tools',
    extensions: 'Extensions',
    shares: 'Shared Conversations',
    memories: 'Memories',
    localagent: 'Local Agent',
    integrations: 'Integrations',
    about: 'About',
  };

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 hidden md:block animate-fade-in"
        onClick={onClose}
      />

      {/* Settings panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-fade-in">
        <div className="side-panel flex-row w-full h-full md:max-w-[80vw] md:h-[80vh] md:rounded-2xl shadow-2xl relative overflow-hidden animate-scale-in">

          {/* Sidebar */}
          <div className={`w-56 border-r border-[rgb(var(--border))] flex flex-col shrink-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:bg-[rgb(var(--panel))] max-md:shadow-2xl max-md:transition-transform max-h-[80vh] md:max-h-full ${
            sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
          }`}>
            <div className="px-4 py-4 border-b border-[rgb(var(--border))] flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-base">Settings</h2>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden btn-icon">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 p-2 overflow-y-auto">
              {navBtn('general', 'General', <SettingsIcon size={16} />)}
              {navBtn('providers', 'Model Providers', <Database size={16} />)}
              {navBtn('apiformats', 'API Formats', <Settings2 size={16} />)}
              {navBtn('directmodels', 'Direct Models', <Zap size={16} />)}
              {navBtn('data', 'Import/Export Data', <FileDown size={16} />)}
              {navBtn('cloudsync', 'Cloud Sync', <Cloud size={16} />)}
              {navBtn('workflows', 'Workflows', <SettingsIcon size={16} />)}
              {navBtn('tools', 'Tools', <SettingsIcon size={16} />)}
              {navBtn('extensions', 'Extensions', <SettingsIcon size={16} />)}
              {navBtn('shares', 'Shares', <Share2 size={16} />)}
              {navBtn('memories', 'Memories', <Brain size={16} />)}
              {navBtn('localagent', 'Local Agent', <Database size={16} />)}
              {navBtn('integrations', 'Integrations', <Puzzle size={16} />)}
              {navBtn('about', 'About', <Info size={16} />)}
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
                <h2 className="font-semibold">{headerTitle[activeTab]}</h2>
              </div>
              <button onClick={onClose} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            {activeTab === 'general' && (
              <GeneralTab
                settings={settings}
                onUpdateModelSettings={onUpdateModelSettings}
                onUpdateSettings={onUpdateSettings}
              />
            )}

            {(activeTab === 'providers' || activeTab === 'apiformats') && (
              <ProvidersTab
                settings={settings}
                onUpdateProvider={onUpdateProvider}
                onAddIntegratedProvider={onAddIntegratedProvider}
                onAddProvider={onAddProvider}
                onDeleteProvider={onDeleteProvider}
                onUpsertApiFormat={onUpsertApiFormat}
                onDeleteApiFormat={onDeleteApiFormat}
                activeTab={activeTab}
              />
            )}

            {activeTab === 'directmodels' && (
              <DirectModelsTab
                providers={settings.providers.filter(p => p.directUrl)}
                onAdd={() => {
                  const id = `direct_${Date.now()}`;
                  onUpdateSettings({
                    providers: [
                      ...settings.providers,
                      { id, name: 'New Direct Model', baseUrl: '', apiKey: '', models: [{ id: 'model-name', name: 'model-name' }], enabled: true, directUrl: true },
                    ],
                  });
                }}
                onUpdate={(id, patch) => onUpdateProvider(id, patch)}
                onDelete={id => onDeleteProvider(id)}
              />
            )}

            {activeTab === 'data' && (
              <DataTab
                settings={settings}
                conversations={conversations}
                onImportData={onImportData}
              />
            )}

            {activeTab === 'cloudsync' && (
              <CloudSyncTab
                settings={settings}
                conversations={conversations}
                onUpdateSettings={onUpdateSettings}
                onImportData={onImportData}
              />
            )}

            {activeTab === 'tools' && (
              <ToolsTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            )}

            {activeTab === 'extensions' && (
              <ExtensionsTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            )}

            {activeTab === 'workflows' && (
              <WorkflowsTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            )}

            {activeTab === 'localagent' && (
              <LocalAgentTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                agentPort={agentPort}
                agentProtocol={agentProtocol}
                agentEnabled={agentEnabled}
                agentStatus={agentStatus}
                setAgentPort={setAgentPort}
                setAgentProtocol={setAgentProtocol}
                setAgentEnabled={setAgentEnabled}
              />
            )}

            {activeTab === 'shares' && (
              <SharesTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            )}

            {activeTab === 'memories' && (
              <MemoriesTab
                enabled={!!settings.memoriesEnabled}
                memories={settings.memories || []}
                onToggle={enabled => onUpdateSettings({ memoriesEnabled: enabled })}
                onAdd={fact => onUpdateSettings({ memories: [...(settings.memories || []), fact] })}
                onEdit={(i, fact) => {
                  const next = [...(settings.memories || [])];
                  next[i] = fact;
                  onUpdateSettings({ memories: next });
                }}
                onDelete={i => onUpdateSettings({ memories: (settings.memories || []).filter((_, idx) => idx !== i) })}
              />
            )}

            {activeTab === 'integrations' && (
              <IntegrationsTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            )}

            {activeTab === 'about' && (
              <AboutTab taglineIndex={taglineIndex} fade={fade} />
            )}

          </div>
        </div>
      </div>
    </>
  );
}
