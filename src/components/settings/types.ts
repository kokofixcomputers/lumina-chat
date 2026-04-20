import type { AppSettings, ModelSettings, ModelProvider } from '../../types';
import type { IntegratedProviderTemplate } from '../../data/integratedProviders';

export type TabType =
  | 'general'
  | 'providers'
  | 'apiformats'
  | 'directmodels'
  | 'data'
  | 'cloudsync'
  | 'workflows'
  | 'tools'
  | 'extensions'
  | 'shares'
  | 'memories'
  | 'localagent'
  | 'integrations'
  | 'about';

export interface SettingsPanelProps {
  settings: AppSettings;
  conversations: any[];
  onUpdateModelSettings: (patch: Partial<ModelSettings>) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  onAddIntegratedProvider: (template: IntegratedProviderTemplate) => void;
  onAddProvider: () => void;
  onDeleteProvider: (id: string) => void;
  onUpsertApiFormat: (fmt: import('../../types').ProviderApiFormat) => void;
  onDeleteApiFormat: (id: string) => void;
  onImportData: (data: any) => void;
  onClose: () => void;
}
