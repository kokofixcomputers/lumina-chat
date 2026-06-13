import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { AppSettings } from '../../types';
import { importSources, importChatFile } from '../../utils/importers';
import type { ImportSourceId } from '../../utils/importers';

interface DataTabProps {
  settings: AppSettings;
  conversations: any[];
  onImportData: (data: any) => void;
}

export default function DataTab({ settings, conversations, onImportData }: DataTabProps) {
  const [selectedSource, setSelectedSource] = useState<ImportSourceId>('lumina');

  const exportData = () => {
    // Get extensions from localStorage
    const extensions = {};
    try {
      const extensionsData = localStorage.getItem('lumina_extensions');
      if (extensionsData) {
        Object.assign(extensions, JSON.parse(extensionsData));
      }
    } catch (error) {
      console.error('Failed to export extensions:', error);
    }

    const data = {
      settings,
      conversations,
      extensions,
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

  const importData = async () => {
    const source = selectedSource;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = importSources.find((item) => item.id === source)?.accept || '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const data = await importChatFile(file, source);
        if (!data || (!data.settings && !data.conversations && !data.extensions)) {
          throw new Error('No importable data found in file.');
        }

        onImportData(data);
        alert('Data imported successfully!');
      } catch (err) {
        console.error('Failed to import file:', err);
        alert(`Failed to import data: ${err instanceof Error ? err.message : 'Invalid file format'}`);
      }
    };
    input.click();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Warning:</strong> The exported data contains API keys and other sensitive information in raw text. Please safeguard properly.
        </p>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Import Data</h3>
        <p className="text-sm text-[rgb(var(--muted))] mb-4">
          Import data from another chat app or a Lumina export. Choose the source then select the file to import.
        </p>

        <div className="grid gap-3 mb-4">
          {importSources.map((source) => (
            <label
              key={source.id}
              className={`block rounded-2xl border p-4 cursor-pointer transition-all ${
                selectedSource === source.id
                  ? 'border-[rgb(var(--accent))] bg-[rgb(var(--panel))] shadow-sm'
                  : 'border-[rgb(var(--border))] bg-[rgb(var(--panel))] hover:border-[rgb(var(--accent))]'
              }`}
            >
              <input
                type="radio"
                name="importSource"
                value={source.id}
                checked={selectedSource === source.id}
                onChange={() => setSelectedSource(source.id)}
                className="sr-only"
              />
              <div className="flex items-start gap-3">
                <div className="mt-1 h-4 w-4 rounded-full border-2 border-[rgb(var(--border))] flex items-center justify-center">
                  {selectedSource === source.id ? (
                    <div className="h-2 w-2 rounded-full bg-[rgb(var(--accent))]" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[rgb(var(--text))]">{source.label}</div>
                  <div className="text-sm text-[rgb(var(--muted))] mt-1">{source.description}</div>
                </div>
                {source.beta ? (
                  <span className="self-start rounded-full bg-[rgb(var(--panel))] border border-[rgb(var(--border))] px-2 py-1 text-[10px] text-[rgb(var(--muted))]">
                    beta
                  </span>
                ) : null}
              </div>
            </label>
          ))}
        </div>

        <button onClick={importData} className="btn-secondary">
          <Upload size={16} />
          Import Data from File
        </button>
      </section>

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
    </div>
  );
}
