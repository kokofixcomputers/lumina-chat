import { useState, useEffect } from 'react';
import { X, Folder, FolderOpen, FileText, Download, Trash2, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { getVfs, clearVfs } from '../tools/buildFs';

interface BuildModeFSProps {
  convId: string;
  onClose: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

function buildTree(fs: Record<string, string>): TreeNode[] {
  const root: Record<string, any> = {};

  Object.keys(fs).forEach(filePath => {
    const parts = filePath.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      if (!cur[part]) cur[part] = i === parts.length - 1 ? null : {};
      else if (i < parts.length - 1 && cur[part] === null) cur[part] = {};
      cur = cur[part] ?? {};
    });
  });

  function toNodes(obj: Record<string, any>, prefix: string): TreeNode[] {
    return Object.entries(obj)
      .filter(([name]) => name !== '.keep')
      .sort(([a, av], [b, bv]) => {
        // dirs first
        const aDir = av !== null && typeof av === 'object';
        const bDir = bv !== null && typeof bv === 'object';
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.localeCompare(b);
      })
      .map(([name, val]) => {
        const path = prefix ? `${prefix}/${name}` : name;
        const isDir = val !== null && typeof val === 'object';
        return {
          name,
          path,
          isDir,
          children: isDir ? toNodes(val, path) : undefined,
        };
      });
  }

  return toNodes(root, '');
}

function FileNode({ node, fs, onSelect, selected }: {
  node: TreeNode;
  fs: Record<string, string>;
  onSelect: (path: string) => void;
  selected: string | null;
}) {
  const [open, setOpen] = useState(true);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-sm text-[rgb(var(--text))]"
        >
          {open ? <ChevronDown size={13} className="text-[rgb(var(--muted))] shrink-0" /> : <ChevronRight size={13} className="text-[rgb(var(--muted))] shrink-0" />}
          {open ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <Folder size={14} className="text-amber-500 shrink-0" />}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open && node.children && (
          <div className="pl-4">
            {node.children.map(child => (
              <FileNode key={child.path} node={child} fs={fs} onSelect={onSelect} selected={selected} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-sm transition-colors ${
        selected === node.path
          ? 'bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]'
          : 'text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
      }`}
    >
      <span className="w-3 shrink-0" />
      <FileText size={13} className="text-[rgb(var(--muted))] shrink-0" />
      <span className="truncate">{node.name}</span>
      <span className="ml-auto text-[10px] text-[rgb(var(--muted))] shrink-0">
        {formatBytes(fs[node.path]?.length ?? 0)}
      </span>
    </button>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}KB`;
}

async function downloadZip(fs: Record<string, string>, convId: string) {
  // Use fflate if available, otherwise fall back to a simple text bundle
  try {
    const { strToU8, zipSync } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    Object.entries(fs).forEach(([path, content]) => {
      if (!path.endsWith('/.keep')) {
        files[path] = strToU8(content);
      }
    });
    const zipped = zipSync(files);
    const blob = new Blob([zipped], { type: 'application/zip' });
    triggerDownload(blob, `build-${convId.slice(0, 8)}.zip`);
  } catch {
    // Fallback: download as a single text file listing
    const lines = Object.entries(fs)
      .filter(([p]) => !p.endsWith('/.keep'))
      .map(([path, content]) => `=== ${path} ===\n${content}`)
      .join('\n\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    triggerDownload(blob, `build-${convId.slice(0, 8)}.txt`);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadFile(path: string, content: string) {
  const name = path.split('/').pop() ?? path;
  const blob = new Blob([content], { type: 'text/plain' });
  triggerDownload(blob, name);
}

export default function BuildModeFS({ convId, onClose }: BuildModeFSProps) {
  const [fs, setFs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = () => {
    setFs(getVfs(convId));
    setTick(t => t + 1);
  };

  useEffect(() => {
    refresh();
    // Poll for changes every second while open
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [convId]);

  const tree = buildTree(fs);
  const fileCount = Object.keys(fs).filter(p => !p.endsWith('/.keep')).length;
  const selectedContent = selected ? fs[selected] : null;

  return (
    <div className="flex flex-col h-full w-80 bg-[rgb(var(--panel))] border-l border-[rgb(var(--border))] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border))] shrink-0">
        <div className="flex items-center gap-2">
          <Folder size={15} className="text-amber-500" />
          <span className="text-sm font-semibold">Virtual FS</span>
          <span className="text-xs text-[rgb(var(--muted))]">({fileCount} files)</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]" title="Refresh">
            <RefreshCw size={13} />
          </button>
          {fileCount > 0 && (
            <button onClick={() => downloadZip(fs, convId)} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]" title="Download all as zip">
              <Download size={13} />
            </button>
          )}
          {fileCount > 0 && (
            <button
              onClick={() => { clearVfs(convId); setFs({}); setSelected(null); }}
              className="btn-icon w-7 h-7 text-[rgb(var(--muted))] hover:text-red-500"
              title="Clear all files"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={onClose} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        {/* File tree */}
        <div className={`overflow-y-auto p-2 ${selected ? 'h-48 shrink-0 border-b border-[rgb(var(--border))]' : 'flex-1'}`}>
          {tree.length === 0 ? (
            <p className="text-xs text-[rgb(var(--muted))] text-center py-8 px-4">
              No files yet. Ask the AI to create files using Build Mode.
            </p>
          ) : (
            tree.map(node => (
              <FileNode key={node.path} node={node} fs={fs} onSelect={setSelected} selected={selected} />
            ))
          )}
        </div>

        {/* File viewer */}
        {selected && selectedContent !== null && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[rgb(var(--border))] shrink-0 bg-[rgb(var(--bg))]">
              <span className="text-xs font-mono text-[rgb(var(--muted))] truncate flex-1">{selected}</span>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button onClick={() => downloadFile(selected, selectedContent)} className="btn-icon w-6 h-6 text-[rgb(var(--muted))]" title="Download file">
                  <Download size={12} />
                </button>
                <button onClick={() => setSelected(null)} className="btn-icon w-6 h-6 text-[rgb(var(--muted))]">
                  <X size={12} />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-[rgb(var(--text))] bg-[rgb(var(--bg))] whitespace-pre-wrap break-all leading-relaxed">
              {selectedContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
