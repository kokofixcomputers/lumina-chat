import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Download, Upload, Power, PowerOff, Code, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { extensionStorage, StoredExtension } from '../../extensions/extensionStorage';
import { extensionLoader } from '../../extensions/extensionLoader';
import { extensionManager } from '../../extensions/extensionSystem';
import type { AppSettings } from '../../types';

interface ExtensionsTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export default function ExtensionsTab({ settings, onUpdateSettings }: ExtensionsTabProps) {
  const [extensions, setExtensions] = useState<Record<string, StoredExtension>>({});
  const [selectedExtension, setSelectedExtension] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    version: '',
    description: '',
    author: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadExtensions();
  }, []);

  const loadExtensions = () => {
    setExtensions(extensionStorage.getAllExtensions());
  };

  const handleCreateExtension = () => {
    setIsEditing(true);
    setEditForm({
      id: '',
      name: '',
      version: '1.0.0',
      description: '',
      author: ''
    });
    setEditCode(`// Extension Template
const api = createChatExtensionAPI();

api.registerExtension({
  id: 'your.extension.id',
  name: 'Your Extension Name',
  version: '1.0.0',
  description: 'Description of your extension',
  author: 'Your Name',
  tools: [
    {
      name: 'example_tool',
      description: 'Description of what this tool does',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input description' }
        },
        required: ['input']
      },
      async call(args, ctx) {
        // Your tool logic here
        ctx.log('Tool called with:', args);
        return { result: 'Hello from extension!' };
      }
    }
  ]
});`);
  };

  const handleSaveExtension = async () => {
    if (!editForm.id.trim()) {
      alert('Extension ID is required');
      return;
    }

    try {
      // Basic validation of the code
      const testFunction = new Function('api', 'console', editCode);
      
      const extension: StoredExtension = {
        ...editForm,
        code: editCode,
        enabled: true,
        tools: [] // Will be populated when the extension registers itself
      };

      extensionStorage.saveExtension(extension);
      
      // Load the extension
      await extensionLoader.loadExtension(extension);
      
      setIsEditing(false);
      setSelectedExtension(null);
      // Small delay to ensure storage is updated
      setTimeout(() => {
        loadExtensions();
      }, 100);
      
      // Trigger sync by dispatching a storage event
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'lumina_extensions',
        newValue: localStorage.getItem('lumina_extensions')
      }));
    } catch (error) {
      alert(`Failed to save extension: ${error}`);
    }
  };

  const handleDeleteExtension = (id: string) => {
    if (confirm('Are you sure you want to delete this extension?')) {
      extensionStorage.deleteExtension(id);
      extensionLoader.unloadExtension(id);
      loadExtensions();
      // Trigger sync by dispatching a storage event
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'lumina_extensions',
        newValue: localStorage.getItem('lumina_extensions')
      }));
    }
  };

  const handleToggleExtension = async (id: string) => {
    const extension = extensions[id];
    if (!extension) return;

    if (extension.enabled) {
      // Disable
      extensionLoader.unloadExtension(id);
      extensionManager.unregisterExtension(id); // Unregister from manager
      extensionStorage.updateExtension(id, { enabled: false });
      // Immediately update UI state
      setExtensions(prev => ({
        ...prev,
        [id]: { ...prev[id], enabled: false }
      }));
    } else {
      // Enable
      extensionStorage.updateExtension(id, { enabled: true });
      // Immediately update UI state
      setExtensions(prev => ({
        ...prev,
        [id]: { ...prev[id], enabled: true }
      }));
      
      const success = await extensionLoader.loadExtension(extension);
      if (success) {
        extensionManager.enableExtension(id);
        // Only refresh if loading was successful to get updated metadata
        setTimeout(() => {
          loadExtensions();
        }, 100);
      }
    }
    // Trigger sync by dispatching a storage event
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'lumina_extensions',
      newValue: localStorage.getItem('lumina_extensions')
    }));
  };

  const handleExportExtensions = () => {
    try {
      const data = extensionStorage.exportExtensions();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extensions-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export extensions');
    }
  };

  const handleImportExtensions = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = extensionStorage.importExtensions(text);
        
        alert(`Imported ${result.success} extensions, ${result.failed} failed`);
        if (result.errors.length > 0) {
          console.error('Import errors:', result.errors);
        }
        
        loadExtensions();
        
        // Trigger sync by dispatching a storage event
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'lumina_extensions',
          newValue: localStorage.getItem('lumina_extensions')
        }));
      } catch (error) {
        alert('Failed to import extensions');
      }
    };
    input.click();
  };

  const getExtensionStatus = (id: string) => {
    const extension = extensions[id];
    if (!extension) return 'unknown';
    
    if (!extension.enabled) return 'disabled';
    if (extensionLoader.isExtensionLoaded(id) && extensionManager.isExtensionEnabled(id)) return 'loaded';
    return 'error';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'loaded':
        return <CheckCircle size={16} className="text-green-600 dark:text-green-400" />;
      case 'disabled':
        return <PowerOff size={16} className="text-gray-600 dark:text-gray-400" />;
      case 'error':
        return <XCircle size={16} className="text-red-600 dark:text-red-400" />;
      default:
        return <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-400" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl mx-auto w-full">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Extensions</h3>
          <div className="flex gap-2">
            <button
              onClick={handleImportExtensions}
              className="btn-secondary text-xs py-1.5 px-3 gap-1.5"
            >
              <Upload size={12} />
              Import
            </button>
            <button
              onClick={handleExportExtensions}
              className="btn-secondary text-xs py-1.5 px-3 gap-1.5"
            >
              <Download size={12} />
              Export
            </button>
            <button
              onClick={handleCreateExtension}
              className="btn-primary text-xs py-1.5 px-3 gap-1.5"
            >
              <Plus size={12} />
              New Extension
            </button>
          </div>
        </div>

        {isEditing && (
          <div className="border border-[rgb(var(--border))] rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium mb-3">
              {editForm.id ? 'Edit Extension' : 'Create Extension'}
            </h4>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                placeholder="Extension ID (e.g., demo.math)"
                value={editForm.id}
                onChange={e => setEditForm({ ...editForm, id: e.target.value })}
                className="input text-sm"
              />
              <input
                type="text"
                placeholder="Extension Name"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="input text-sm"
              />
              <input
                type="text"
                placeholder="Version"
                value={editForm.version}
                onChange={e => setEditForm({ ...editForm, version: e.target.value })}
                className="input text-sm"
              />
              <input
                type="text"
                placeholder="Author"
                value={editForm.author}
                onChange={e => setEditForm({ ...editForm, author: e.target.value })}
                className="input text-sm"
              />
            </div>
            
            <textarea
              placeholder="Description"
              value={editForm.description}
              onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              className="input text-sm mb-3 min-h-[60px]"
              rows={2}
            />
            
            <div className="mb-3">
              <label className="form-label">Extension Code</label>
              <textarea
                value={editCode}
                onChange={e => setEditCode(e.target.value)}
                className="input text-sm font-mono min-h-[400px] w-full"
                placeholder="// Write your extension code here..."
                spellCheck={false}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSaveExtension}
                className="btn-primary text-sm py-2 px-4"
              >
                Save Extension
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSelectedExtension(null);
                  setEditCode('');
                }}
                className="btn-secondary text-sm py-2 px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {Object.values(extensions).map(extension => {
            const status = getExtensionStatus(extension.id);
            const isLoaded = extensionLoader.isExtensionLoaded(extension.id);
            
            return (
              <div
                key={extension.id}
                className={`border border-[rgb(var(--border))] rounded-lg p-4 ${
                  selectedExtension === extension.id ? 'ring-2 ring-[rgb(var(--accent))]' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-medium">{extension.name}</h4>
                      <span className="text-xs text-[rgb(var(--muted))]">v{extension.version}</span>
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {extension.tools.length} tools
                      </span>
                      {getStatusIcon(status)}
                    </div>
                    
                    <p className="text-xs text-[rgb(var(--muted))] mb-2">
                      ID: <code className="bg-black/5 dark:bg-white/5 px-1 rounded">{extension.id}</code>
                    </p>
                    
                    {extension.description && (
                      <p className="text-sm text-[rgb(var(--text))] mb-2">{extension.description}</p>
                    )}
                    
                    {extension.author && (
                      <p className="text-xs text-[rgb(var(--muted))]">
                        by {extension.author} • Installed {new Date(extension.installedAt).toLocaleDateString()}
                      </p>
                    )}
                    
                    {extension.tools.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-[rgb(var(--muted))] cursor-pointer hover:text-[rgb(var(--text))]">
                          Tools ({extension.tools.length})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {extension.tools.map(tool => (
                            <div key={tool.name} className="text-xs bg-black/5 dark:bg-white/5 p-2 rounded">
                              <code className="font-mono">{tool.name}</code>
                              <p className="text-[rgb(var(--muted))] mt-1">{tool.description}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  
                  <div className="flex gap-1 ml-3">
                    <button
                      onClick={() => handleToggleExtension(extension.id)}
                      className="btn-icon w-6 h-6"
                      title={extension.enabled ? 'Disable' : 'Enable'}
                    >
                      {extension.enabled ? <Power size={12} /> : <PowerOff size={12} />}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedExtension(extension.id);
                        setIsEditing(true);
                        setEditForm({
                          id: extension.id,
                          name: extension.name,
                          version: extension.version,
                          description: extension.description || '',
                          author: extension.author || ''
                        });
                        setEditCode(extension.code);
                      }}
                      className="btn-icon w-6 h-6"
                      title="Edit"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteExtension(extension.id)}
                      className="btn-icon w-6 h-6 text-red-600 dark:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          
          {Object.keys(extensions).length === 0 && (
            <div className="text-center py-8">
              <Code size={48} className="mx-auto text-[rgb(var(--muted))] mb-4" />
              <h3 className="text-lg font-medium mb-2">No Extensions Installed</h3>
              <p className="text-sm text-[rgb(var(--muted))] mb-4">
                Create your first extension to add custom functionality to the chat.
              </p>
              <button
                onClick={handleCreateExtension}
                className="btn-primary py-2 px-4"
              >
                <Plus size={16} className="mr-2" />
                Create Extension
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
