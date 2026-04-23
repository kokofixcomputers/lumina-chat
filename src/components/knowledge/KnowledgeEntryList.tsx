import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2, Tag, Calendar, X, Link, Loader2 } from 'lucide-react';
import { KnowledgeEntry, KnowledgeEntryFormData } from '../../types/fineTuning';
import { useFineTuningStore } from '../../store/fineTuningStore';
import { urlToMarkdown } from '../../utils/urlToMarkdown';

interface KnowledgeEntryListProps {
  fineTuningId: string;
  entries: KnowledgeEntry[];
}

const KnowledgeEntryList: React.FC<KnowledgeEntryListProps> = ({ fineTuningId, entries }) => {
  const { addKnowledgeEntry, deleteKnowledgeEntry, updateKnowledgeEntry } = useFineTuningStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<KnowledgeEntryFormData>({
    title: '',
    content: '',
    tags: [],
  });
  const [inputMode, setInputMode] = useState<'content' | 'url'>('content');
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const filteredEntries = entries.filter(entry =>
    entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreateEntry = () => {
    if (!formData.title.trim() || !formData.content.trim()) return;

    addKnowledgeEntry(fineTuningId, formData);
    setIsCreateModalOpen(false);
    resetForm();
  };

  const handleEditEntry = () => {
    if (!editingEntry || !formData.title.trim() || !formData.content.trim()) return;

    updateKnowledgeEntry(fineTuningId, editingEntry.id, formData);
    setIsEditModalOpen(false);
    setEditingEntry(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ title: '', content: '', tags: [] });
    setInputMode('content');
    setUrlInput('');
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm('Are you sure you want to delete this knowledge entry?')) {
      deleteKnowledgeEntry(fineTuningId, id);
    }
  };

  const openEditModal = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setFormData({
      title: entry.title,
      content: entry.content,
      tags: entry.tags || [],
    });
    setIsEditModalOpen(true);
  };

  const handleTagsChange = (tagsString: string) => {
    const tags = tagsString.split(',').map(tag => tag.trim()).filter(Boolean);
    setFormData({ ...formData, tags });
  };

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) return;

    setIsFetchingUrl(true);
    try {
      const markdown = await urlToMarkdown(urlInput.trim());
      
      // Try to extract a title from the URL or content
      let title = formData.title;
      if (!title.trim()) {
        // Try to get title from URL domain
        try {
          const url = new URL(urlInput);
          title = url.hostname;
        } catch {
          title = 'Web Content';
        }
      }

      setFormData({ 
        ...formData, 
        title: title.trim(),
        content: markdown,
        tags: [...(formData.tags || []), 'web']
      });
    } catch (error) {
      console.error('Failed to fetch URL:', error);
      alert(`Failed to fetch content from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[rgb(var(--muted-foreground))] w-4 h-4" />
            <input
              type="text"
              placeholder="Search entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
            />
          </div>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Entry
        </button>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-[rgb(var(--muted))] mb-4">
            {searchQuery ? 'No entries found matching your search' : 'No knowledge entries yet'}
          </div>
          {!searchQuery && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              Add First Entry
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg hover:bg-[rgb(var(--accent))]/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-[rgb(var(--text))]">{entry.title}</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(entry)}
                    className="p-1.5 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--accent))] rounded-md transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="p-1.5 text-[rgb(var(--muted-foreground))] hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-[rgb(var(--muted))] mb-3 line-clamp-3">
                {entry.content}
              </p>
              
              <div className="flex items-center justify-between text-xs text-[rgb(var(--muted))]">
                <div className="flex items-center gap-2">
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      <span>{entry.tags.join(', ')}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{entry.updatedAt.toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(isCreateModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[rgb(var(--panel))] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[rgb(var(--border))]">
              <h2 className="text-lg font-semibold text-[rgb(var(--text))]">
                {isEditModalOpen ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}
              </h2>
              <button 
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setIsEditModalOpen(false);
                  setEditingEntry(null);
                  resetForm();
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
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
                    placeholder="Enter entry title"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    Content Source
                  </label>
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setInputMode('content')}
                      className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
                        inputMode === 'content'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-[rgb(var(--bg))] border-[rgb(var(--border))] text-[rgb(var(--text))]'
                      }`}
                    >
                      Direct Input
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('url')}
                      className={`flex-1 px-3 py-2 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                        inputMode === 'url'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-[rgb(var(--bg))] border-[rgb(var(--border))] text-[rgb(var(--text))]'
                      }`}
                    >
                      <Link size={16} />
                      From URL
                    </button>
                  </div>

                  {inputMode === 'content' ? (
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] resize-none"
                      placeholder="Enter knowledge content"
                      rows={6}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          className="flex-1 px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
                          placeholder="https://example.com/article"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !isFetchingUrl) {
                              handleFetchUrl();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleFetchUrl}
                          disabled={!urlInput.trim() || isFetchingUrl}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                          {isFetchingUrl ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Fetching
                            </>
                          ) : (
                            <>
                              <Link size={16} />
                              Fetch
                            </>
                          )}
                        </button>
                      </div>
                      
                      {formData.content && (
                        <div>
                          <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                            Fetched Content (you can edit)
                          </label>
                          <textarea
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] resize-none"
                            placeholder="Content will appear here after fetching..."
                            rows={6}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags?.join(', ') || ''}
                  onChange={(e) => handleTagsChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
                  placeholder="tag1, tag2, tag3"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  if (isEditModalOpen) {
                    setIsEditModalOpen(false);
                    setEditingEntry(null);
                  } else {
                    setIsCreateModalOpen(false);
                  }
                  resetForm();
                }}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={isEditModalOpen ? handleEditEntry : handleCreateEntry}
                disabled={!formData.title.trim() || !formData.content.trim()}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEditModalOpen ? 'Save Changes' : 'Create Entry'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeEntryList;
