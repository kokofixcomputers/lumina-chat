import { Download, Upload } from 'lucide-react';
import type { AppSettings } from '../../types';

interface DataTabProps {
  settings: AppSettings;
  conversations: any[];
  onImportData: (data: any) => void;
}

export default function DataTab({ settings, conversations, onImportData }: DataTabProps) {
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
  );
}
