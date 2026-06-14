import { useRef, useState, useEffect } from 'react';
import {
  GripVertical, Trash2, Upload, Eye, EyeOff, Plus, Check,
  ArrowLeft, RotateCcw, Pencil,
} from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { v4 as uuidv4 } from 'uuid';
import { isTauri } from '../../utils/tauri';
import type { AppSettings, CssThemeFile } from '../../types';
import { THEME_PRESETS } from '../../data/themePresets';

interface AppearanceTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
];

// ─────────────────────────────────────────────────────────────
// Main tab — two views: list | editor
// ─────────────────────────────────────────────────────────────
export default function AppearanceTab({ settings, onUpdateSettings }: AppearanceTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const files = settings.cssThemeFiles ?? [];
  const updateFiles = (next: CssThemeFile[]) => onUpdateSettings({ cssThemeFiles: next });

  const editingFile = editingId ? files.find(f => f.id === editingId) ?? null : null;

  if (editingFile) {
    return (
      <CssEditor
        file={editingFile}
        settings={settings}
        onSave={updated => {
          updateFiles(files.map(f => f.id === updated.id ? updated : f));
          setEditingId(null);
        }}
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <ListView
      settings={settings}
      files={files}
      onUpdateSettings={onUpdateSettings}
      updateFiles={updateFiles}
      onEdit={id => setEditingId(id)}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// List view
// ─────────────────────────────────────────────────────────────
function ListView({
  settings,
  files,
  onUpdateSettings,
  updateFiles,
  onEdit,
}: {
  settings: AppSettings;
  files: CssThemeFile[];
  onUpdateSettings: (p: Partial<AppSettings>) => void;
  updateFiles: (f: CssThemeFile[]) => void;
  onEdit: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // ── Import ──
  const importViaWeb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    picked.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const content = ev.target?.result as string;
        updateFiles([...files, { id: uuidv4(), name: file.name, content, enabled: true }]);
      };
      reader.readAsText(file);
    });
  };

  const importViaTauri = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const selected = await open({ multiple: true, filters: [{ name: 'CSS Files', extensions: ['css'] }] });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const loaded: CssThemeFile[] = await Promise.all(
        paths.map(async p => ({
          id: uuidv4(),
          name: p.split('/').pop() ?? p,
          content: await readTextFile(p),
          enabled: true,
        }))
      );
      updateFiles([...files, ...loaded]);
    } catch (err) {
      console.error('Tauri file import failed:', err);
    }
  };

  const handleImport = () => { if (isTauri) importViaTauri(); else fileInputRef.current?.click(); };

  // ── Add preset ──
  const addPreset = (presetId: string) => {
    const preset = THEME_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const existing = files.findIndex(f => f.id === presetId || f.presetId === presetId);
    if (existing !== -1) {
      updateFiles(files.map((f, i) => i === existing ? { ...f, enabled: true } : f));
    } else {
      updateFiles([...files, { id: presetId, name: preset.name, content: preset.css, enabled: true, presetId }]);
    }
  };

  // ── Drag reorder ──
  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDragEnter = (i: number) => setDragOver(i);
  const onDragEnd = () => {
    const from = dragIdx.current;
    if (from !== null && dragOver !== null && from !== dragOver) {
      const next = [...files];
      const [item] = next.splice(from, 1);
      next.splice(dragOver, 0, item);
      updateFiles(next);
    }
    dragIdx.current = null;
    setDragOver(null);
  };

  const toggleFile = (id: string) => updateFiles(files.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  const deleteFile = (id: string) => updateFiles(files.filter(f => f.id !== id));

  const activeCount = files.filter(f => f.enabled).length;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">

      {/* Base theme */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Base Theme</h3>
        <div className="form-group">
          <label className="form-label">Color scheme</label>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onUpdateSettings({ theme: value })}
                className={`flex-1 rounded-xl px-3.5 py-2 text-xs capitalize font-medium transition-all ${
                  settings.theme === value
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                    : 'border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="form-help">Switches between light/dark CSS variables. Files below override these variables.</p>
        </div>
      </section>

      {/* Presets gallery */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-3">Presets</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEME_PRESETS.map(preset => {
            const entry = files.find(f => f.id === preset.id || f.presetId === preset.id);
            const isActive = !!entry?.enabled;
            const isModified = entry && entry.content !== preset.css;
            return (
              <button
                key={preset.id}
                onClick={() => addPreset(preset.id)}
                className={`group relative flex flex-col gap-1 text-left px-3 py-3 rounded-xl border transition-all ${
                  isActive
                    ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/[0.06]'
                    : 'border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/50 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13px] font-medium truncate">{preset.name}</span>
                  {isActive ? (
                    <Check size={13} className="text-[rgb(var(--accent))] shrink-0" />
                  ) : entry ? (
                    <span className="text-[10px] text-[rgb(var(--muted))]">off</span>
                  ) : (
                    <Plus size={12} className="text-[rgb(var(--muted))] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
                <span className="text-[11px] text-[rgb(var(--muted))] leading-snug">{preset.description}</span>
                {isModified && (
                  <span className="text-[10px] text-amber-500 font-medium">modified</span>
                )}
                <PresetSwatch css={preset.css} />
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[rgb(var(--muted))] mt-2">
          Click a preset to add it. Edit it freely — it becomes a custom file you can reset back to the original anytime.
        </p>
      </section>

      {/* Active files */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            CSS Files
            {activeCount > 0 && (
              <span className="ml-2 normal-case font-normal">({activeCount} active)</span>
            )}
          </h3>
          <button onClick={handleImport} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5">
            <Upload size={13} />
            Import
          </button>
        </div>
        <p className="text-[11px] text-[rgb(var(--muted))] mb-3">
          <strong>#1 is loaded last</strong> and overrides all others. Drag to reorder.
        </p>

        {!isTauri && (
          <input ref={fileInputRef} type="file" accept=".css" multiple className="hidden" onChange={importViaWeb} />
        )}

        {files.length === 0 ? (
          <div className="border border-dashed border-[rgb(var(--border))] rounded-xl p-6 text-center">
            <p className="text-sm text-[rgb(var(--muted))]">No theme files yet. Pick a preset or import a CSS file.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {files.map((file, i) => {
              const parentPreset = THEME_PRESETS.find(p => p.id === file.presetId);
              const isModified = parentPreset && file.content !== parentPreset.css;
              return (
                <div
                  key={file.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragEnter={() => onDragEnter(i)}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={onDragEnd}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                    dragOver === i
                      ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/[0.06] scale-[1.01]'
                      : 'border-[rgb(var(--border))] bg-[rgb(var(--panel))]'
                  } ${!file.enabled ? 'opacity-40' : ''}`}
                >
                  <span className="text-[10px] font-mono text-[rgb(var(--muted))] w-4 text-center select-none shrink-0">{i + 1}</span>
                  <GripVertical size={14} className="text-[rgb(var(--muted))] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] truncate block">{file.name}</span>
                    {isModified && (
                      <span className="text-[10px] text-amber-500">modified from preset</span>
                    )}
                  </div>
                  <button onClick={() => onEdit(file.id)} title="Edit" className="btn-icon">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => toggleFile(file.id)} title={file.enabled ? 'Disable' : 'Enable'} className="btn-icon">
                    {file.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => deleteFile(file.id)} title="Remove" className="btn-icon hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CSS variable reference */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-3">CSS Variable Reference</h3>
        <div className="rounded-xl border border-[rgb(var(--border))] overflow-hidden">
          <div className="px-4 py-2.5 bg-[rgb(var(--panel))] border-b border-[rgb(var(--border))] text-[11px] text-[rgb(var(--muted))] uppercase tracking-wider font-semibold">
            All values are space-separated RGB triplets
          </div>
          <pre className="px-4 py-3 text-[rgb(var(--text))] overflow-x-auto leading-relaxed bg-[rgb(var(--bg))] text-[12px] font-mono">{`:root {
  --bg: 250 250 250;        /* page background */
  --panel: 255 255 255;     /* sidebar, cards */
  --text: 18 18 18;         /* primary text */
  --muted: 150 150 160;     /* secondary text, icons */
  --border: 232 232 236;    /* dividers, input borders */
  --accent: 45 45 48;       /* buttons, active states */
  --accent-contrast: 255 255 255; /* text on accent bg */
}

.dark {
  /* same variables, override for dark mode */
}`}</pre>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers: read computed CSS vars → Monaco hex colors
// ─────────────────────────────────────────────────────────────
function cssVarToHex(name: string): string {
  const rgb = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  if (!rgb) return '#888888';
  const [r, g, b] = rgb.split(/\s+/).map(Number);
  return '#' + [r, g, b].map(n => (isNaN(n) ? 0 : n).toString(16).padStart(2, '0')).join('');
}

function buildLuminaMonacoTheme(): editor.IStandaloneThemeData {
  const bg       = cssVarToHex('bg');
  const panel    = cssVarToHex('panel');
  const text     = cssVarToHex('text');
  const muted    = cssVarToHex('muted');
  const border   = cssVarToHex('border');
  const accent   = cssVarToHex('accent');
  const isDark   = document.documentElement.classList.contains('dark');

  // Derive a subtle selection colour: accent at ~20% opacity blended on bg
  // Monaco colors must be opaque hex or #RRGGBBAA (8-digit)
  const selectionBg = accent + '33'; // ~20% alpha
  const lineHighlight = panel + '80';

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment',             foreground: muted.slice(1) },
      { token: 'keyword',             foreground: accent.slice(1) },
      { token: 'attribute.name.css',  foreground: accent.slice(1) },
      { token: 'attribute.value.css', foreground: text.slice(1)   },
      { token: 'number',              foreground: text.slice(1)    },
      { token: 'string',              foreground: text.slice(1)    },
    ],
    colors: {
      'editor.background':                    bg,
      'editor.foreground':                    text,
      'editor.lineHighlightBackground':       lineHighlight,
      'editor.selectionBackground':           selectionBg,
      'editor.inactiveSelectionBackground':   accent + '1a',
      'editorLineNumber.foreground':          muted,
      'editorLineNumber.activeForeground':    text,
      'editorGutter.background':              panel,
      'editorCursor.foreground':              accent,
      'editorIndentGuide.background1':        border,
      'editorIndentGuide.activeBackground1':  muted,
      'editorWidget.background':              panel,
      'editorWidget.border':                  border,
      'editorSuggestWidget.background':       panel,
      'editorSuggestWidget.border':           border,
      'editorSuggestWidget.selectedBackground': accent + '33',
      'scrollbarSlider.background':           muted + '44',
      'scrollbarSlider.hoverBackground':      muted + '66',
      'scrollbarSlider.activeBackground':     muted + '88',
      'focusBorder':                          accent + '88',
    },
  };
}

// ─────────────────────────────────────────────────────────────
// CSS editor view — Monaco
// ─────────────────────────────────────────────────────────────
function CssEditor({
  file,
  settings,
  onSave,
  onClose,
}: {
  file: CssThemeFile;
  settings: AppSettings;
  onSave: (f: CssThemeFile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(file.name);
  const [content, setContent] = useState(file.content);
  const monaco = useMonaco();

  const parentPreset = THEME_PRESETS.find(p => p.id === file.presetId);
  const isModified = parentPreset
    ? content !== parentPreset.css || name !== parentPreset.name
    : false;

  // Re-define and apply the lumina Monaco theme whenever the app theme or CSS
  // files change (CSS vars are already updated in the DOM by the time this runs).
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme('lumina', buildLuminaMonacoTheme());
    monaco.editor.setTheme('lumina');
  }, [monaco, settings.theme, settings.cssThemeFiles]);

  const resetToPreset = () => {
    if (!parentPreset) return;
    setContent(parentPreset.css);
    setName(parentPreset.name);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgb(var(--border))] shrink-0">
        <button onClick={onClose} className="btn-icon shrink-0">
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-transparent text-[14px] font-medium outline-none text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] min-w-0"
          placeholder="Theme name"
        />
        <div className="flex items-center gap-2 shrink-0">
          {parentPreset && isModified && (
            <button
              onClick={resetToPreset}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5"
            >
              <RotateCcw size={12} />
              Reset to preset
            </button>
          )}
          <button onClick={() => onSave({ ...file, name, content })} className="btn-primary text-xs py-1.5 px-3">
            Save
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-1 border-b border-[rgb(var(--border))] bg-[rgb(var(--bg))] shrink-0 text-[11px] text-[rgb(var(--muted))]">
        <span>CSS</span>
        <span>·</span>
        <span>{content.split('\n').length} lines</span>
        {parentPreset && !isModified && <><span>·</span><span className="text-[rgb(var(--accent))]">unmodified preset</span></>}
        {parentPreset && isModified && <><span>·</span><span className="text-amber-500">modified — diverged from preset</span></>}
      </div>

      {/* Monaco editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="css"
          value={content}
          theme="lumina"
          onChange={v => setContent(v ?? '')}
          options={{
            fontSize: 13,
            fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            lineNumbers: 'on',
            renderLineHighlight: 'gutter',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Color swatch strip derived from theme CSS
// ─────────────────────────────────────────────────────────────
function PresetSwatch({ css }: { css: string }) {
  const colors = extractSwatchColors(css);
  return (
    <div className="flex gap-1 mt-1.5">
      {colors.map((c, i) => (
        <div key={i} className="h-3 rounded-full flex-1" style={{ background: `rgb(${c})` }} />
      ))}
    </div>
  );
}

function extractSwatchColors(css: string): string[] {
  const darkBlock = css.match(/\.dark\s*\{([^}]+)\}/s)?.[1] ?? '';
  const rootBlock = css.match(/:root\s*\{([^}]+)\}/s)?.[1] ?? '';
  const get = (block: string, v: string) => block.match(new RegExp(`--${v}:\\s*([^;]+)`))?.[1]?.trim();
  return [
    get(rootBlock, 'bg') ?? '250 250 250',
    get(rootBlock, 'accent') ?? '80 80 80',
    get(darkBlock, 'panel') ?? get(rootBlock, 'panel') ?? '50 50 50',
    get(darkBlock, 'bg') ?? '40 40 40',
    get(darkBlock, 'accent') ?? get(rootBlock, 'accent') ?? '100 100 100',
  ];
}
