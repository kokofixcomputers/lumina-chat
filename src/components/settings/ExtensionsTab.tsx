import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit2, Download, Upload, Power, PowerOff, Code, AlertCircle, CheckCircle, XCircle, Store, ShieldCheck, ShieldAlert } from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { extensionStorage, StoredExtension, ExtensionType } from '../../extensions/extensionStorage';
import { extensionLoader } from '../../extensions/extensionLoader';
import { extensionManager } from '../../extensions/extensionSystem';
import { extensionLogRegistry, LogEntry } from '../../extensions/extensionLogRegistry';
import type { AppSettings } from '../../types';

interface ExtensionsTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export default function ExtensionsTab({ settings, onUpdateSettings }: ExtensionsTabProps) {
  const navigate = useNavigate();
  const [extensions, setExtensions] = useState<Record<string, StoredExtension>>({});
  const [selectedExtension, setSelectedExtension] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editForm, setEditForm] = useState<{
    id: string;
    name?: string;
    version?: string;
    description?: string;
    author?: string;
  }>({
    id: ''
  });
  const [editType, setEditType] = useState<ExtensionType>('sandboxed');
  const [isLoading, setIsLoading] = useState(false);
  const editFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadExtensions();
  }, []);

  useEffect(() => {
    if (isEditing && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isEditing]);

  const loadExtensions = () => {
    setExtensions(extensionStorage.getAllExtensions());
  };

  const sandboxedTemplate = `// Sandboxed Extension Template
// Tools + UI only. No DOM/window access.

api.registerExtension({
  id: 'your.extension.id',
  name: 'Your Extension Name',
  version: '1.0.0',
  description: 'Describe what your extension does',
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
        ctx.log('Tool called with:', args);
        return { result: 'Hello from extension!' };
      }
    }
  ]
});

// ── UI ────────────────────────────────────────────────────────────────────
// api.ui.toast('Loaded!', { type: 'success' });
// await api.ui.alert('Something happened', { title: 'Info', type: 'info' });
// const ok = await api.ui.confirm('Are you sure?', { type: 'warning' });
// const name = await api.ui.prompt('Enter your name:', { placeholder: 'Jane' });
// const close = api.ui.openModal({ title: 'My Modal', body: '<p>Hello!</p>', buttons: [{ label: 'OK', primary: true, onClick: () => {} }] });
// api.ui.addButton({ label: 'Click me', icon: '⚡', location: 'chat-toolbar', onClick: () => api.ui.toast('Hi!') });
// api.ui.addSidebarSection({ title: 'My Extension', items: [{ id: 'a', label: 'Action', icon: '🔥', onClick: () => {} }] });
`;

  const unsandboxedTemplate = `// Unsandboxed Extension Template
// Full access: DOM, window, document, api.dom, api.app, api.ui, tools.

api.registerExtension({
  id: 'your.extension.id',
  name: 'Your Extension Name',
  version: '1.0.0',
  description: 'Describe what your extension does',
  author: 'Your Name',
  tools: []
});

// ── DOM: event listeners (auto-cleaned up on disable) ────────────────────
// api.dom.onDocument('keydown', (e) => { if (e.key === 'F2') api.ui.toast('F2 pressed!'); });
// api.dom.onWindow('resize', () => console.log('resized to', window.innerWidth));

// ── DOM: inject CSS ───────────────────────────────────────────────────────
// api.dom.addStyle(\`.chat-input-box { border-radius: 24px !important; }\`);

// ── DOM: query / mutate elements ─────────────────────────────────────────
// const el = api.dom.query('[data-tour="chat-input"]');
// el?.remove();                        // delete an element
// el?.setAttribute('style', '...');    // patch inline style
// document.body.appendChild(...)       // raw DOM manipulation

// ── DOM: inject a script tag ─────────────────────────────────────────────
// const s = document.createElement('script');
// s.textContent = 'window.myGlobal = 42;';
// document.head.appendChild(s);
// api.dom.onCleanup(() => s.remove());

// ── DOM: MutationObserver ─────────────────────────────────────────────────
// api.dom.observe(document.body, (mutations) => { console.log('DOM changed', mutations); }, { childList: true, subtree: true });

// ── DOM: tracked timers ───────────────────────────────────────────────────
// api.dom.setInterval(() => console.log('tick'), 5000);

// ── App: sidebar control ─────────────────────────────────────────────────
// api.app.sidebar.collapse();
// api.app.sidebar.onChange((collapsed) => console.log('sidebar:', collapsed));

// ── DOM: smooth auto-collapse sidebar with pin button ────────────────────
// (function() {
//   const EDGE_PX = 48; let pinned = false;
//   api.dom.addStyle(\`
//     [data-tour="sidebar"] { transition: width 240ms cubic-bezier(0.4,0,0.2,1), min-width 240ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease !important; overflow:hidden!important; min-width:0!important; }
//     [data-tour="sidebar"].ext-sidebar-collapsed { width:0!important; opacity:0!important; pointer-events:none!important; }
//     #ext-sidebar-pin { display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:rgb(var(--muted));transition:color 120ms,background 120ms;flex-shrink:0; }
//     #ext-sidebar-pin:hover { background:rgb(var(--border)/0.6);color:rgb(var(--text)); }
//     #ext-sidebar-pin.pinned { color:rgb(var(--accent)); }
//   \`);
//   const sidebar = api.dom.query('[data-tour="sidebar"]');
//   const collapse = () => { if (!pinned) sidebar?.classList.add('ext-sidebar-collapsed'); };
//   const expand   = () => sidebar?.classList.remove('ext-sidebar-collapsed');
//   const isCollapsed = () => sidebar?.classList.contains('ext-sidebar-collapsed') ?? false;
//   const header = sidebar?.querySelector('.border-b');
//   if (header) {
//     const pin = document.createElement('button');
//     pin.id = 'ext-sidebar-pin'; pin.title = 'Pin sidebar open';
//     pin.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>\`;
//     pin.addEventListener('click', () => { pinned = !pinned; pin.classList.toggle('pinned', pinned); pin.title = pinned ? 'Unpin sidebar' : 'Pin sidebar open'; if (pinned) expand(); });
//     const buttons = header.querySelectorAll('button');
//     header.insertBefore(pin, buttons[buttons.length - 2] ?? null);
//     api.dom.onCleanup(() => pin.remove());
//   }
//   collapse();
//   api.dom.onDocument('mousemove', (e) => { if (e.clientX <= EDGE_PX && isCollapsed()) expand(); });
//   if (sidebar) api.dom.on(sidebar, 'mouseleave', (e) => { if (e.clientX > EDGE_PX) collapse(); });
//   api.dom.onCleanup(expand);
// })();

// ── App: cross-extension events ───────────────────────────────────────────
// api.app.emit('myevent', { foo: 'bar' });
// api.app.on('myevent', (detail) => console.log(detail));
`;

  const handleCreateExtension = () => {
    setIsEditing(true);
    setEditType('sandboxed');
    setEditForm({
      id: ''
    });
    setEditCode(sandboxedTemplate);
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
        id: editForm.id,
        name: '',
        version: '',
        description: '',
        author: '',
        code: editCode,
        enabled: true,
        type: editType,
        tools: []
      };

      extensionStorage.saveExtension(extension);
      
      // Load the extension
      await extensionLoader.loadExtension(extension);
      
      setIsEditing(false);
      setSelectedExtension(null);
      setEditCode('');
      setEditForm({ id: '' });
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
              onClick={() => navigate('/marketplace')}
              className="btn-secondary text-xs py-1.5 px-3 gap-1.5"
            >
              <Store size={12} />
              Marketplace
            </button>
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
          <div ref={editFormRef} className="border border-[rgb(var(--border))] rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium mb-3">
              {editForm.id ? 'Edit Extension' : 'Create Extension'}
            </h4>

            {/* Type selector */}
            <div className="mb-4">
              <label className="form-label mb-2">Extension Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditType('sandboxed');
                    if (!editForm.id) setEditCode(sandboxedTemplate);
                  }}
                  className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-colors ${
                    editType === 'sandboxed'
                      ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10'
                      : 'border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/50'
                  }`}
                >
                  <ShieldCheck size={16} className="text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">Sandboxed</p>
                    <p className="text-[10px] text-[rgb(var(--muted))] mt-0.5">Tools + UI only. No DOM or window access.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditType('unsandboxed');
                    if (!editForm.id) setEditCode(unsandboxedTemplate);
                  }}
                  className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-colors ${
                    editType === 'unsandboxed'
                      ? 'border-orange-400 bg-orange-500/10'
                      : 'border-[rgb(var(--border))] hover:border-orange-400/50'
                  }`}
                >
                  <ShieldAlert size={16} className="text-orange-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">Unsandboxed</p>
                    <p className="text-[10px] text-[rgb(var(--muted))] mt-0.5">Full DOM access, script injection, api.dom, api.app.</p>
                  </div>
                </button>
              </div>
              {editType === 'unsandboxed' && (
                <p className="text-[10px] text-orange-400 mt-2 flex items-center gap-1">
                  <ShieldAlert size={11} />
                  Unsandboxed extensions have full access to the page. Only install code you trust.
                </p>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label">Extension ID (for reference)</label>
              <input
                type="text"
                placeholder="Extension ID (e.g., demo.math)"
                value={editForm.id}
                onChange={e => setEditForm({ ...editForm, id: e.target.value })}
                className="input text-sm"
              />
              <p className="text-xs text-[rgb(var(--muted))] mt-1">
                Metadata (name, version, description, author) is extracted from the code automatically
              </p>
            </div>

            <div className="mb-3">
              <label className="form-label mb-1.5">Extension Code</label>
              <div className="rounded-lg border border-[rgb(var(--border))] overflow-hidden" style={{ height: 420 }}>
                <JsEditor value={editCode} onChange={setEditCode} settings={settings} />
              </div>
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
                  setEditType('sandboxed');
                  setEditForm({ id: '' });
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
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h4 className="text-sm font-medium">{extension.name}</h4>
                      <span className="text-xs text-[rgb(var(--muted))]">v{extension.version}</span>
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {extension.tools.length} tools
                      </span>
                      {(extension.type ?? 'sandboxed') === 'unsandboxed' ? (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          <ShieldAlert size={9} />
                          Unsandboxed
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          <ShieldCheck size={9} />
                          Sandboxed
                        </span>
                      )}
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
                        by {extension.author} • Installed {new Date(extension.installedAt ?? 0).toLocaleDateString()}
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

                    <ExtLogViewer extensionId={extension.id} />
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
                        setEditType(extension.type ?? 'sandboxed');
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

// ── Extension log viewer ──────────────────────────────────────────────────

function useExtensionLogs(extensionId: string): LogEntry[] {
  const [logs, setLogs] = useState<LogEntry[]>(() => extensionLogRegistry.getLogs(extensionId));
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.extensionId;
      if (id === null || id === extensionId) setLogs([...extensionLogRegistry.getLogs(extensionId)]);
    };
    window.addEventListener('ext-log-update', handler);
    return () => window.removeEventListener('ext-log-update', handler);
  }, [extensionId]);
  return logs;
}

function ExtLogViewer({ extensionId }: { extensionId: string }) {
  const logs = useExtensionLogs(extensionId);
  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount  = logs.filter(l => l.level === 'warn').length;

  const levelStyle = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn':  return 'text-yellow-400';
      case 'info':  return 'text-blue-400';
      default:      return 'text-[rgb(var(--muted))]';
    }
  };
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <details className="mt-2 group">
      <summary className="flex items-center gap-2 text-xs text-[rgb(var(--muted))] cursor-pointer hover:text-[rgb(var(--text))] select-none list-none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 transition-transform group-open:rotate-90 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
        </svg>
        <span>Console</span>
        {errorCount > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 font-medium">
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        {warnCount > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/15 text-yellow-400 font-medium">
            {warnCount} warn{warnCount !== 1 ? 's' : ''}
          </span>
        )}
        {logs.length === 0 && <span className="text-[10px]">no output</span>}
        {logs.length > 0 && (
          <button
            onClick={e => { e.preventDefault(); extensionLogRegistry.clear(extensionId); }}
            className="ml-auto text-[10px] hover:text-[rgb(var(--text))] transition-colors"
          >
            Clear
          </button>
        )}
      </summary>

      <div className="mt-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--bg))] overflow-hidden">
        {logs.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-[rgb(var(--muted))]">No output yet.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto">
            {logs.map(entry => (
              <div key={entry.id} className={`flex gap-2 px-3 py-1 border-b border-[rgb(var(--border))] last:border-0 font-mono text-[11px] leading-relaxed ${entry.level === 'error' ? 'bg-red-500/5' : entry.level === 'warn' ? 'bg-yellow-500/5' : ''}`}>
                <span className="text-[rgb(var(--muted))] shrink-0 select-none">{fmt(entry.timestamp)}</span>
                <span className={`uppercase text-[9px] font-bold mt-0.5 shrink-0 w-8 ${levelStyle(entry.level)}`}>{entry.level}</span>
                <span className={`break-all whitespace-pre-wrap ${levelStyle(entry.level)}`}>{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

// ── Monaco theme helpers (mirrors AppearanceTab) ──────────────────────────
function cssVarToHex(name: string): string {
  const rgb = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!rgb) return '#888888';
  const [r, g, b] = rgb.split(/\s+/).map(Number);
  return '#' + [r, g, b].map(n => (isNaN(n) ? 0 : n).toString(16).padStart(2, '0')).join('');
}

function buildLuminaMonacoTheme() {
  const bg = cssVarToHex('bg'), panel = cssVarToHex('panel'), text = cssVarToHex('text');
  const muted = cssVarToHex('muted'), border = cssVarToHex('border'), accent = cssVarToHex('accent');
  const isDark = document.documentElement.classList.contains('dark');
  return {
    base: (isDark ? 'vs-dark' : 'vs') as 'vs-dark' | 'vs',
    inherit: true as const,
    rules: [
      { token: 'comment',  foreground: muted.slice(1) },
      { token: 'keyword',  foreground: accent.slice(1) },
      { token: 'string',   foreground: text.slice(1) },
      { token: 'number',   foreground: text.slice(1) },
      { token: 'regexp',   foreground: accent.slice(1) },
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': text,
      'editor.lineHighlightBackground': panel + '80',
      'editor.selectionBackground': accent + '33',
      'editor.inactiveSelectionBackground': accent + '1a',
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': text,
      'editorGutter.background': panel,
      'editorCursor.foreground': accent,
      'editorIndentGuide.background1': border,
      'editorWidget.background': panel,
      'editorWidget.border': border,
      'editorSuggestWidget.background': panel,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.selectedBackground': accent + '33',
      'scrollbarSlider.background': muted + '44',
      'scrollbarSlider.hoverBackground': muted + '66',
      'focusBorder': accent + '88',
    },
  };
}

function JsEditor({ value, onChange, settings }: { value: string; onChange: (v: string) => void; settings: AppSettings }) {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme('lumina', buildLuminaMonacoTheme());
    monaco.editor.setTheme('lumina');
  }, [monaco, settings.theme]);

  return (
    <Editor
      height="100%"
      language="javascript"
      value={value}
      theme="lumina"
      onChange={v => onChange(v ?? '')}
      options={{
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        tabSize: 2,
        lineNumbers: 'on',
        renderLineHighlight: 'gutter',
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
        padding: { top: 12, bottom: 12 },
      }}
    />
  );
}
