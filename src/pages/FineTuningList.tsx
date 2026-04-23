import React, { useState } from 'react';
import { Plus, BookOpen, Settings, X, Trash2 } from 'lucide-react';
import { useFineTuningStore } from '../store/fineTuningStore';
import { FineTuningFormData } from '../types/fineTuning';

interface FineTuningListProps {
  onOpenFineTuningDetail: (id: string) => void;
}

const FineTuningList: React.FC<FineTuningListProps> = ({ onOpenFineTuningDetail }) => {
  const { fineTunings, createFineTuning, deleteFineTuning } = useFineTuningStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState<FineTuningFormData>({
    name: '',
    description: '',
  });

  const handleCreateFineTuning = () => {
    if (!formData.name.trim()) return;

    const newFineTuning = createFineTuning(formData);
    setIsCreateModalOpen(false);
    setFormData({ name: '', description: '' });
    onOpenFineTuningDetail(newFineTuning.id);
  };

  const handleDeleteFineTuning = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this knowledge base?')) {
      deleteFineTuning(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[rgb(var(--bg))] animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--text))]">Knowledge Bases</h1>
          <p className="text-xs text-[rgb(var(--muted))]">Manage your custom knowledge bases</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-5 py-6">
          {fineTunings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="w-16 h-16 bg-[rgb(var(--muted))/50] rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-[rgb(var(--muted-foreground))]" />
              </div>
              <h3 className="text-lg font-semibold text-[rgb(var(--text))] mb-2">No knowledge bases yet</h3>
              <p className="text-sm text-[rgb(var(--muted))] mb-6 text-center max-w-md">
                Create your first knowledge base to start organizing information and providing context to AI conversations
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Knowledge Base
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {fineTunings.map((fineTuning) => (
                <div
                  key={fineTuning.id}
                  onClick={() => onOpenFineTuningDetail(fineTuning.id)}
                  className="group bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg p-4 hover:bg-[rgb(var(--accent))]/20 transition-all cursor-pointer hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                          <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-[rgb(var(--text))] truncate">
                            {fineTuning.name}
                          </h3>
                        </div>
                      </div>
                      <p className="text-sm text-[rgb(var(--muted))] mb-3 line-clamp-2">
                        {fineTuning.description || 'No description provided'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-[rgb(var(--muted))]">
                        <div className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          <span>{fineTuning.knowledgeEntries.length} {fineTuning.knowledgeEntries.length === 1 ? 'entry' : 'entries'}</span>
                        </div>
                        <div>
                          Created {fineTuning.createdAt.toLocaleDateString()}
                        </div>
                        <div>
                          Updated {fineTuning.updatedAt.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFineTuningDetail(fineTuning.id);
                          }}
                          className="p-1.5 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--accent))] rounded-md transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDeleteFineTuning(fineTuning.id, e)}
                          className="p-1.5 text-[rgb(var(--muted-foreground))] hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[rgb(var(--border))]">
              <h2 className="text-lg font-semibold text-[rgb(var(--text))]">Create Knowledge Base</h2>
              <button 
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setFormData({ name: '', description: '' });
                }}
                className="btn-icon"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
                    placeholder="Enter knowledge base name"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] resize-none"
                    placeholder="Describe what this knowledge base is for"
                    rows={3}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setFormData({ name: '', description: '' });
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFineTuning}
                  disabled={!formData.name.trim()}
                  className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
  );
};

export default FineTuningList;
