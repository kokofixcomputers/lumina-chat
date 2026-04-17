import { Plus } from 'lucide-react';
import type { AppSettings, ModelProvider } from '../../types';
import type { IntegratedProviderTemplate } from '../../data/integratedProviders';
import { integratedProviders } from '../../data/integratedProviders';
import { ApiFormatsTab } from '../ProvidersPanel';
import { IntegratedProviderCard, ProviderCard } from './shared';

interface ProvidersTabProps {
  settings: AppSettings;
  onUpdateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  onAddIntegratedProvider: (template: IntegratedProviderTemplate) => void;
  onAddProvider: () => void;
  onDeleteProvider: (id: string) => void;
  onUpsertApiFormat: (fmt: import('../../types').ProviderApiFormat) => void;
  onDeleteApiFormat: (id: string) => void;
  activeTab: 'providers' | 'apiformats';
}

export default function ProvidersTab({
  settings,
  onUpdateProvider,
  onAddIntegratedProvider,
  onAddProvider,
  onDeleteProvider,
  onUpsertApiFormat,
  onDeleteApiFormat,
  activeTab,
}: ProvidersTabProps) {
  if (activeTab === 'apiformats') {
    return (
      <div className="flex-1 overflow-y-auto pb-safe max-w-2xl">
        <ApiFormatsTab
          apiFormats={settings.apiFormats || []}
          onUpsert={onUpsertApiFormat}
          onDelete={onDeleteApiFormat}
        />
      </div>
    );
  }

  return (
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
              apiFormats={settings.apiFormats || []}
              onUpdate={patch => onUpdateProvider(p.id, patch)}
              onDelete={() => onDeleteProvider(p.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
