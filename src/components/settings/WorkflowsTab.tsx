import { Plus, Trash2 } from 'lucide-react';
import type { AppSettings } from '../../types';

interface WorkflowsTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export default function WorkflowsTab({ settings, onUpdateSettings }: WorkflowsTabProps) {
  return (
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
  );
}
