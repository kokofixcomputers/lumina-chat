import { defineTool } from '../types/tools';

// Virtual filesystem stored in sessionStorage per conversation
// Key: `vfs_${convId}` → JSON Record<path, string>

function getConvId(): string {
  return sessionStorage.getItem('activeConvId') || 'default';
}

function getFs(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(`vfs_${getConvId()}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveFs(fs: Record<string, string>) {
  sessionStorage.setItem(`vfs_${getConvId()}`, JSON.stringify(fs));
}

/** Normalize path: strip leading slash, collapse double slashes */
function norm(p: string) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

/**
 * Unescape literal \n sequences the AI writes as the two characters \ and n
 * into real newlines, but leave \\n (escaped backslash + n) as a literal \n.
 * This lets the AI write actual newlines in file content.
 */
function unescapeContent(content: string): string {
  // Replace \\n with a placeholder, then \n → newline, then restore
  return content
    .replace(/\\\\n/g, '\x00BSLASH_N\x00')
    .replace(/\\n/g, '\n')
    .replace(/\x00BSLASH_N\x00/g, '\\n');
}

export const fsWriteFile = defineTool(
  'fs_write_file',
  'Write content to a file in the virtual filesystem. Creates parent directories automatically. Use \\n for newlines in content.',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path, e.g. "src/index.ts"' },
      content: { type: 'string', description: 'File content. Use \\n for newlines.' },
    },
    required: ['path', 'content'],
  },
  async (args: { path: string; content: string }) => {
    const fs = getFs();
    const path = norm(args.path);
    fs[path] = unescapeContent(args.content);
    saveFs(fs);
    return { success: true, path, bytes: fs[path].length };
  }
);

export const fsReadFile = defineTool(
  'fs_read_file',
  'Read the content of a file from the virtual filesystem.',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
    },
    required: ['path'],
  },
  async (args: { path: string }) => {
    const fs = getFs();
    const path = norm(args.path);
    if (!(path in fs)) return { success: false, error: `File not found: ${path}` };
    return { success: true, path, content: fs[path] };
  }
);

export const fsDeleteFile = defineTool(
  'fs_delete',
  'Delete a file OR directory (recursively deletes all contents) from the virtual filesystem. Works for both files and directories.',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File or directory path to delete. Directories are deleted recursively.' },
    },
    required: ['path'],
  },
  async (args: { path: string }) => {
    const fs = getFs();
    const path = norm(args.path);
    const keys = Object.keys(fs).filter(k => k === path || k.startsWith(path + '/'));
    if (keys.length === 0) return { success: false, error: `Not found: ${path}` };
    keys.forEach(k => delete fs[k]);
    saveFs(fs);
    return { success: true, deleted: keys };
  }
);

export const fsListDir = defineTool(
  'fs_list_dir',
  'List files and directories at a given path in the virtual filesystem.',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list, or "" for root' },
    },
    required: ['path'],
  },
  async (args: { path: string }) => {
    const fs = getFs();
    const dir = norm(args.path);
    const prefix = dir ? dir + '/' : '';
    const entries = new Set<string>();
    Object.keys(fs).forEach(k => {
      if (!k.startsWith(prefix)) return;
      const rest = k.slice(prefix.length);
      const part = rest.split('/')[0];
      entries.add(part);
    });
    return { success: true, path: dir || '/', entries: Array.from(entries).sort() };
  }
);

export const fsMkdir = defineTool(
  'fs_mkdir',
  'Create a directory marker in the virtual filesystem (optional, files create dirs implicitly).',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to create' },
    },
    required: ['path'],
  },
  async (args: { path: string }) => {
    const fs = getFs();
    const path = norm(args.path) + '/.keep';
    fs[path] = '';
    saveFs(fs);
    return { success: true, path: norm(args.path) };
  }
);

export const buildFsTools = [fsWriteFile, fsReadFile, fsDeleteFile, fsListDir, fsMkdir];

/** Get the full virtual filesystem for a conversation */
export function getVfs(convId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(`vfs_${convId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Clear the virtual filesystem for a conversation */
export function clearVfs(convId: string) {
  sessionStorage.removeItem(`vfs_${convId}`);
}
