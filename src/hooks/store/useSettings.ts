import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppSettings, ModelProvider, ModelSettings, ProviderApiFormat } from '../../types';
import type { IntegratedProviderTemplate } from '../../data/integratedProviders';
import { DEFAULT_SETTINGS, saveToStorage } from './storage';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem('lumina_settings');
      if (raw) return JSON.parse(raw) as AppSettings;
    } catch {}
    return DEFAULT_SETTINGS;
  });

  // Persist settings
  useEffect(() => {
    saveToStorage('lumina_settings', settings);
  }, [settings]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') root.classList.add('dark');
    else if (settings.theme === 'light') root.classList.remove('dark');
    else root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, [settings.theme]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const updateModelSettings = useCallback((patch: Partial<ModelSettings>) => {
    setSettings(prev => ({ ...prev, modelSettings: { ...prev.modelSettings, ...patch } }));
  }, []);

  const updateProvider = useCallback((id: string, patch: Partial<ModelProvider>) => {
    setSettings(prev => ({
      ...prev,
      providers: prev.providers.map(p => p.id === id ? { ...p, ...patch } : p),
    }));
  }, []);

  const addIntegratedProvider = useCallback((template: IntegratedProviderTemplate) => {
    const newProvider: ModelProvider = {
      id: template.id,
      name: template.name,
      baseUrl: template.baseUrlTemplate,
      apiKey: template.requireAuth ? '' : 'none',
      enabled: false,
      models: template.defaultModels,
      isIntegrated: true,
      customFieldValues: {},
      apiFormatId: template.id === 'anthropic' ? 'anthropic' : undefined,
    };
    setSettings(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
  }, []);

  const addProvider = useCallback(() => {
    const id = uuidv4();
    const newProvider: ModelProvider = {
      id,
      name: 'New Provider',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      enabled: true,
      models: [],
    };
    setSettings(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
  }, []);

  const deleteProvider = useCallback((id: string) => {
    setSettings(prev => ({ ...prev, providers: prev.providers.filter(p => p.id !== id) }));
  }, []);

  const upsertApiFormat = useCallback((fmt: ProviderApiFormat) => {
    setSettings(prev => {
      const existing = prev.apiFormats || [];
      const idx = existing.findIndex(f => f.id === fmt.id);
      const next = idx >= 0 ? existing.map((f, i) => i === idx ? fmt : f) : [...existing, fmt];
      return { ...prev, apiFormats: next };
    });
  }, []);

  const deleteApiFormat = useCallback((id: string) => {
    setSettings(prev => ({ ...prev, apiFormats: (prev.apiFormats || []).filter(f => f.id !== id) }));
  }, []);

  const getProviderAndModel = useCallback((providerModelId: string) => {
    const slashIdx = providerModelId.indexOf('/');
    const providerId = slashIdx !== -1 ? providerModelId.slice(0, slashIdx) : providerModelId;
    const modelId = slashIdx !== -1 ? providerModelId.slice(slashIdx + 1) : '';
    const provider = settings.providers.find(p => p.id === providerId);
    const model = provider?.models.find(m => m.id === modelId);
    return { provider, model };
  }, [settings.providers]);

  const allProviderModels = settings.providers
    .filter(p => p.enabled)
    .flatMap(p => p.models.map(m => ({ ...m, providerId: p.id, providerName: p.name, fullId: `${p.id}/${m.id}` })));

  return {
    settings,
    setSettings,
    updateSettings,
    updateModelSettings,
    updateProvider,
    addIntegratedProvider,
    addProvider,
    deleteProvider,
    upsertApiFormat,
    deleteApiFormat,
    getProviderAndModel,
    allProviderModels,
  };
}
