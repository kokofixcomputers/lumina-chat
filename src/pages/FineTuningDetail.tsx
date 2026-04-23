import React, { useState } from 'react';
import { ArrowLeft, Settings, Database, Edit2, Trash2, Save, X } from 'lucide-react';
import { useFineTuningStore } from '../store/fineTuningStore';
import { FineTuningFormData } from '../types/fineTuning';
import KnowledgeEntryList from '../components/knowledge/KnowledgeEntryList';

interface FineTuningDetailProps {
  fineTuningId: string;
  onBack: () => void;
}

const FineTuningDetail: React.FC<FineTuningDetailProps> = ({ fineTuningId, onBack }) => {
  const { getFineTuning, updateFineTuning, deleteFineTuning } = useFineTuningStore();
  
  const [activeTab, setActiveTab] = useState<'settings' | 'data'>('data');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<FineTuningFormData>({
    name: '',
    description: '',
  });

  const fineTuning = fineTuningId ? getFineTuning(fineTuningId) : null;

  React.useEffect(() => {
    if (fineTuning) {
      setEditForm({
        name: fineTuning.name,
        description: fineTuning.description,
      });
    }
  }, [fineTuning]);

  if (!fineTuning) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Knowledge Base Not Found</h2>
          <p className="text-muted-foreground mb-4">The knowledge base you're looking for doesn't exist.</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const handleSaveSettings = () => {
    if (!editForm.name.trim()) return;

    updateFineTuning(fineTuning.id, editForm);
    setIsEditing(false);
  };

  const handleDeleteFineTuning = () => {
    if (confirm('Are you sure you want to delete this knowledge base? This action cannot be undone.')) {
      deleteFineTuning(fineTuning.id);
      onBack();
    }
  };

  const handleCancelEdit = () => {
    setEditForm({
      name: fineTuning.name,
      description: fineTuning.description,
    });
    setIsEditing(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[rgb(var(--bg))] animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="btn-icon"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="text-lg font-semibold text-[rgb(var(--text))] bg-transparent border-b border-[rgb(var(--border))] focus:outline-none focus:border-primary w-full"
                autoFocus
              />
            ) : (
              <h1 className="text-lg font-semibold text-[rgb(var(--text))] truncate">{fineTuning.name}</h1>
            )}
            <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="bg-transparent border-b border-[rgb(var(--border))] focus:outline-none focus:border-primary text-[rgb(var(--muted))] w-full"
                  placeholder="Add description..."
                />
              ) : (
                fineTuning.description || 'No description provided'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveSettings}
                className="btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="btn-secondary flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          )}
          <button
            onClick={handleDeleteFineTuning}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))]">
        <div className="max-w-4xl mx-auto px-5">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('data')}
              className={`py-3 px-1 border-b-2 transition-colors font-medium text-sm ${
                activeTab === 'data'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Data
                <span className="text-xs bg-[rgb(var(--muted))] px-2 py-0.5 rounded-full">
                  {fineTuning.knowledgeEntries.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-1 border-b-2 transition-colors font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-5 py-6">
          {activeTab === 'data' ? (
            <KnowledgeEntryList fineTuningId={fineTuning.id} entries={fineTuning.knowledgeEntries} />
          ) : (
            <div className="space-y-4">
              <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg p-4">
                <h3 className="font-medium text-[rgb(var(--text))] mb-4">Knowledge Base Information</h3>
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--text))] mb-1">Name</label>
                    <p className="text-sm text-[rgb(var(--muted))]">{fineTuning.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--text))] mb-1">Description</label>
                    <p className="text-sm text-[rgb(var(--muted))]">{fineTuning.description || 'No description provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--text))] mb-1">Knowledge Entries</label>
                    <p className="text-sm text-[rgb(var(--muted))]">{fineTuning.knowledgeEntries.length} entries</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[rgb(var(--text))] mb-1">Created</label>
                      <p className="text-sm text-[rgb(var(--muted))]">{fineTuning.createdAt.toLocaleDateString()} at {fineTuning.createdAt.toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[rgb(var(--text))] mb-1">Last Updated</label>
                      <p className="text-sm text-[rgb(var(--muted))]">{fineTuning.updatedAt.toLocaleDateString()} at {fineTuning.updatedAt.toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg p-4">
                <h3 className="font-medium text-[rgb(var(--text))] mb-3">Danger Zone</h3>
                <div className="space-y-3">
                  <p className="text-sm text-[rgb(var(--muted))]">
                    Once you delete a knowledge base, there is no going back. Please be certain.
                  </p>
                  <button
                    onClick={handleDeleteFineTuning}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Delete Knowledge Base
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FineTuningDetail;
