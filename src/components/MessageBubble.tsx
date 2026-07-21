import { useState, useRef, useEffect } from 'react';
import {
  Copy, Edit2, Trash2, RotateCcw, Check, AlertCircle,
  User, Bot, Wrench, Sparkles, ChevronDown, ChevronUp,
  Eye, Loader2, CheckCircle, XCircle, ChevronRight, Download, X, ChevronLeft, Quote,
  BrainCircuit
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { buildSyntaxStyle } from '../utils/syntaxTheme';
import { getModelInfo } from '../utils/models';
import type { Message } from '../types';
import { writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { tauriUtils } from '../utils/tauri';
import ChartComponent from './ChartComponent';
import RemotionPreview from './RemotionPreview';

function formatToolLabel(name?: string, path?: string, status?: string): string {
  const file = path ? path.split('/').pop() : undefined;
  const loading = status === 'loading';
  switch (name) {
    case 'read_file':        return file ? `Reading ${file}…` : (loading ? 'Reading…' : 'Read file');
    case 'write_file':       return file ? (loading ? `Writing ${file}…` : `Wrote ${file}`) : (loading ? 'Writing…' : 'Wrote file');
    case 'edit_file':        return file ? (loading ? `Editing ${file}…` : `Edited ${file}`) : (loading ? 'Editing…' : 'Edited file');
    case 'delete_file':      return file ? (loading ? `Deleting ${file}…` : `Deleted ${file}`) : (loading ? 'Deleting…' : 'Deleted file');
    case 'create_directory': return file ? (loading ? `Creating ${file}/…` : `Created ${file}/`) : (loading ? 'Creating directory…' : 'Created directory');
    case 'list_directory':   return file ? (loading ? `Listing ${file}/…` : `Listed ${file}/`) : (loading ? 'Listing…' : 'Listed directory');
    case 'execute_command':  return path ? (loading ? `Running: ${path}` : `Ran: ${path}`) : (loading ? 'Running command…' : 'Ran command');
    default:
      if (name?.startsWith('mcp:')) {
        const [, server, tool] = name.split(':');
        return loading ? `Using ${server}/${tool}…` : `Used ${server}/${tool}`;
      }
      return name || 'Tool';
  }
}

function ReasoningBlock({ reasoning, defaultCollapsed }: { reasoning: string; defaultCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => { setCollapsed(defaultCollapsed); }, [defaultCollapsed]);

  return (
    <div className="glass mb-2 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[12px] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <BrainCircuit size={13} />
        <span className="font-medium">Reasoning</span>
      </button>
      {!collapsed && (
        <p className="animate-slide-in-up px-3 pb-2.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-[rgb(var(--muted))]">
          {reasoning}
        </p>
      )}
    </div>
  );
}

type DiffLine = { kind: 'same' | 'add' | 'remove'; text: string };

function computeDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { result.push({ kind: 'same', text: a[i++] }); j++; }
    else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) result.push({ kind: 'add', text: b[j++] });
    else result.push({ kind: 'remove', text: a[i++] });
  }
  return result;
}

function getLang(path?: string): string {
  const ext = path?.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', css: 'css', scss: 'scss',
    html: 'markup', json: 'json', md: 'markdown', sh: 'bash',
    bash: 'bash', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    sql: 'sql', rb: 'ruby', java: 'java', kt: 'kotlin',
    swift: 'swift', c: 'c', cpp: 'cpp', cs: 'csharp',
  };
  return map[ext] || 'text';
}

function renderNode(node: any, key: number, stylesheet?: any): React.ReactNode {
  if (!node) return null;
  if (node.type === 'text') return node.value;
  const props = node.properties ?? {};
  // inline styles come in props.style; class-based come in props.className
  let style: React.CSSProperties = props.style ?? {};
  if (!props.style && props.className && stylesheet) {
    const cls = Array.isArray(props.className) ? props.className : [props.className];
    for (const c of cls) {
      if (stylesheet[c]) style = { ...style, ...stylesheet[c] };
    }
  }
  return (
    <span key={key} style={style}>
      {(node.children ?? []).map((child: any, i: number) => renderNode(child, i, stylesheet))}
    </span>
  );
}

function DiffLines({ lines, path, isDark }: { lines: DiffLine[]; path?: string; isDark: boolean }) {
  const lang = getLang(path);
  const content = lines.map(l => l.text).join('\n');

  // colours
  const C = isDark ? {
    bg:        '#0d1117',
    addBg:     '#1a4d2e', addGutter: '#163d24', addNum: '#3fb950', addSign: '#3fb950', addText: '#e6edf3',
    remBg:     '#4d1a1a', remGutter: '#3d1616', remNum: '#f85149', remSign: '#f85149', remText: '#e6edf3',
    sameBg:    'transparent', sameNum: '#8b949e', sameSign: '#8b949e', sameText: '#8b949e',
    border:    '#30363d',
  } : {
    bg:        '#fafafa',
    addBg:     '#e8f5ec', addGutter: '#d0ecda', addNum: '#3a8a5a', addSign: '#3a8a5a', addText: '#1f2328',
    remBg:     '#faebeb', remGutter: '#f2d0d0', remNum: '#b84040', remSign: '#b84040', remText: '#1f2328',
    sameBg:    'transparent', sameNum: '#8b949e', sameSign: '#8b949e', sameText: '#57606a',
    border:    '#d0d7de',
  };

  const renderer = ({ rows, stylesheet, useInlineStyles: inlineStyles }: { rows: any[]; stylesheet: any; useInlineStyles: boolean }) => {
    let bLine = 0, aLine = 0;
    return (
      <>
        {rows.map((row, i) => {
          const kind = lines[i]?.kind ?? 'same';
          if (kind === 'same')   { bLine++; aLine++; }
          if (kind === 'remove') { bLine++; }
          if (kind === 'add')    { aLine++; }

          const bNum = kind !== 'add'    ? bLine : null;
          const aNum = kind !== 'remove' ? aLine : null;
          const sign = kind === 'add' ? '+' : kind === 'remove' ? '-' : ' ';

          const col = kind === 'add' ? C : kind === 'remove'
            ? { bg: C.remBg, gutter: C.remGutter, num: C.remNum, sign: C.remSign, text: C.remText }
            : { bg: C.sameBg, gutter: 'transparent', num: C.sameNum, sign: C.sameSign, text: C.sameText };

          const addC  = { bg: C.addBg,  gutter: C.addGutter,  num: C.addNum,  sign: C.addSign,  text: C.addText  };
          const remC  = { bg: C.remBg,  gutter: C.remGutter,  num: C.remNum,  sign: C.remSign,  text: C.remText  };
          const samC  = { bg: C.sameBg, gutter: 'transparent',num: C.sameNum, sign: C.sameSign, text: C.sameText };
          const cc = kind === 'add' ? addC : kind === 'remove' ? remC : samC;

          const gutterStyle: React.CSSProperties = {
            display: 'inline-block', width: 36, textAlign: 'right', paddingRight: 6, flexShrink: 0,
            fontSize: 10, color: cc.num, background: cc.gutter,
            borderRight: `1px solid ${C.border}`, userSelect: 'none',
          };
          const signStyle: React.CSSProperties = {
            display: 'inline-block', width: 20, textAlign: 'center', flexShrink: 0,
            color: cc.sign, background: cc.gutter,
            borderRight: `1px solid ${C.border}`, userSelect: 'none',
          };

          return (
            <div key={i} style={{ display: 'flex', background: cc.bg, lineHeight: '20px' }}>
              <span style={gutterStyle}>{bNum ?? ''}</span>
              <span style={gutterStyle}>{aNum ?? ''}</span>
              <span style={signStyle}>{sign}</span>
              <span style={{ paddingLeft: 8, whiteSpace: 'pre', flex: 1, color: cc.text }}>
                {(row.children ?? []).map((node: any, j: number) => renderNode(node, j, stylesheet))}
              </span>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <SyntaxHighlighter
      language={lang}
      style={buildSyntaxStyle()}
      renderer={renderer}
      PreTag="div"
      CodeTag="div"
      useInlineStyles={true}
      customStyle={{ margin: 0, padding: 0, background: C.bg, fontSize: 11 }}
    >
      {content}
    </SyntaxHighlighter>
  );
}

function ToolDiffView({ diff }: { diff: NonNullable<Message['toolDiff']> }) {
  const isDark = document.documentElement.classList.contains('dark');

  if (diff.type === 'output') {
    return (
      <pre className="mt-2 text-[11px] font-mono bg-black/[0.04] dark:bg-white/[0.04] rounded-lg px-3 py-2.5 overflow-x-auto max-h-[300px] overflow-y-auto text-[rgb(var(--text))] whitespace-pre-wrap">
        {diff.output || '(no output)'}
      </pre>
    );
  }

  const containerBg = isDark ? '#0d1117' : '#ffffff';
  const headerBg    = isDark ? '#161b22' : '#f6f8fa';
  const headerText  = isDark ? '#8b949e' : '#57606a';
  const headerBorder= isDark ? '#30363d' : '#d0d7de';
  const border      = isDark ? '#30363d' : '#d0d7de';

  const DiffContainer = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: `1px solid ${border}`, maxHeight: 300, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace', background: containerBg }}>
      <div style={{ padding: '4px 12px', background: headerBg, color: headerText, fontSize: 10, borderBottom: `1px solid ${headerBorder}` }}>
        {label}
      </div>
      {children}
    </div>
  );

  if (diff.type === 'write') {
    const hasBefore = diff.before !== undefined;
    const lines = hasBefore
      ? computeDiff(diff.before!, diff.after ?? '')
      : (diff.after ?? '').split('\n').map(t => ({ kind: 'add' as const, text: t }));
    return (
      <DiffContainer label={`${hasBefore ? 'modified' : 'created'} — ${diff.path}`}>
        <DiffLines lines={lines} path={diff.path} isDark={isDark} />
      </DiffContainer>
    );
  }

  if (diff.type === 'delete') {
    const lines = (diff.before ?? '').split('\n').map(t => ({ kind: 'remove' as const, text: t }));
    return (
      <DiffContainer label={`deleted — ${diff.path}`}>
        <DiffLines lines={lines} path={diff.path} isDark={isDark} />
      </DiffContainer>
    );
  }

  if (diff.type === 'edit') {
    const lines = computeDiff(diff.before ?? '', diff.after ?? '');
    return (
      <DiffContainer label={`edited — ${diff.path}`}>
        <DiffLines lines={lines} path={diff.path} isDark={isDark} />
      </DiffContainer>
    );
  }

  return null;
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
      className="btn-icon w-6 h-6"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function DownloadBtn({ filename, dataUrl }: { filename: string; dataUrl: string }) {
  const [downloading, setDownloading] = useState(false);
  
  const handleDownload = async () => {
    setDownloading(true);
    try {
      
      // Extract base64 data
      const base64Data = dataUrl.split(',')[1];
      
      if (!base64Data) {
        throw new Error('No base64 data found in dataUrl');
      }
      
      const binaryData = atob(base64Data);
      
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      
      if (tauriUtils.isTauri) {
        // Use Tauri APIs for desktop app
        const filePath = await save({
          title: 'Save Presentation',
          defaultPath: filename,
          filters: [
            {
              name: 'PowerPoint Presentation',
              extensions: ['pptx']
            }
          ]
        });
        
        if (filePath) {
          
          await writeFile(filePath, bytes);
          
        }
      } else {
        // Use browser download for web
        const blob = new Blob([bytes], { 
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="btn-icon w-6 h-6"
    >
      {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
    </button>
  );
}

function PreviewBtn({ code, language }: { code: string; language?: string }) {
  const handlePreview = () => {
    // Show preview sidebar
    window.dispatchEvent(new CustomEvent('showPreview', { 
      detail: { code, language, title: `Preview (${language || 'code'})` } 
    }));
  };
  
  return (
    <button
      onClick={handlePreview}
      className="btn-icon w-6 h-6"
      title="Preview"
    >
      <Eye size={12} />
    </button>
  );
}

function openLink(url: string, e: React.MouseEvent) {
  const tauri = (window as any).__TAURI_INTERNALS__;
  if (!tauri) return; // not in Tauri — let browser handle target="_blank"
  e.preventDefault();
  import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
    openUrl(url);
  }).catch(() => {
    // fallback for older Tauri versions
    tauri.invoke?.('plugin:shell|open', { path: url });
  });
}

function parseInline(text: string): React.ReactNode {
  // Match **bold**, *italic*, `code`, and [label](url)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^()]+\))/g);

  return parts.map((p, i) => {
    if (!p) return null;

    // [label](url)
    if (p.startsWith('[') && p.includes('](') && p.endsWith(')')) {
      const match = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        const [, label, url] = match;
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline underline-offset-2 break-words"
            onClick={e => openLink(url, e)}
          >
            {insertSoftBreaks(label, getWrapLength())}
          </a>
        );
      }
    }

    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('*') && p.endsWith('*')) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.08] text-[12px] font-mono break-words"
        >
          {insertSoftBreaks(p.slice(1, -1), getWrapLength())}
        </code>
      );
    }


    return insertSoftBreaks(p, getWrapLength());
  });
}

function getWrapLength() {
  if (typeof window === 'undefined') return 35;
  const width = window.innerWidth;
  // Calculate wrap length continuously based on screen width
  // Ensure wrapping is always active on mobile
  if (width < 360) return 10;
  if (width < 1024) {
    // Smooth scaling: each pixel of width adds to wrap length
    // At 360px: 10, scales up to ~22 at 1024px
    return Math.max(10, Math.floor(10 + (width - 360) * 12 / 664));
  }
  return 35;
}

function insertSoftBreaks(text: string, maxWordLength: number) {
  const segments = text.split(/(\s+)/);
  let lineLength = 0;
  const result: string[] = [];

  for (const segment of segments) {
    if (!segment) continue;

    if (/\s+/.test(segment)) {
      // Whitespace: if adding it would exceed wrap limit, replace with soft break
      if (lineLength > 0 && lineLength + segment.length > maxWordLength) {
        result.push('\u200b');
        lineLength = 0;
      } else {
        result.push(segment);
        lineLength += segment.length;
      }
    } else {
      // Word: if it doesn't fit on current line, wrap it to next line entirely
      // Use lower threshold on very small screens for more aggressive wrapping
      const threshold = maxWordLength <= 14 ? 0.65 : 0.8;
      if (lineLength > 0 && lineLength + segment.length > maxWordLength * threshold) {
        result.push('\u200b');
        lineLength = 0;
      }

      // If word itself is too long, split it into chunks
      if (segment.length > maxWordLength) {
        const chunks = segment.match(new RegExp(`.{1,${maxWordLength}}`, 'g')) || [];
        result.push(chunks.join('\u200b'));
        lineLength = chunks[chunks.length - 1]?.length || 0;
      } else {
        result.push(segment);
        lineLength += segment.length;
      }
    }
  }

  return result.join('');
}


function getVisibleStepText(raw: string | undefined | null): string {
  if (!raw) return '';

  // Regex to match {"status": "value"} - handles spaces around keys/values
  const jsonRegex = /\{\s*"status"\s*:\s*"[^"]*"\s*\}/g;
  const cleaned = raw.replace(jsonRegex, '').trim();

  return cleaned;
}

function parseChartConfig(chartText: string) {
  try {
    // Extract JSON from the chart block
    const jsonMatch = chartText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const config = JSON.parse(jsonMatch[0]);
    
    // Validate required fields
    if (!config.type || !config.data || !config.data.datasets) {
      return null;
    }
    
    // Labels are required for most charts except scatter and bubble
    if (config.type !== 'scatter' && config.type !== 'bubble' && !config.data.labels) {
      return null;
    }
    
    return config;
  } catch (error) {
    console.error('Error parsing chart config:', error);
    return null;
  }
}


function renderContent(content: string) {
  const isDark = document.documentElement.classList.contains('dark');
  const lines = content.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0, k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      let lang = line.slice(3).trim();
      // Map common language aliases
      if (lang === 'bash' || lang === 'sh') lang = 'shell';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      const code = codeLines.join('\n');
      
      // Check if this is a chart block
      if (lang === 'chart') {
        const chartConfig = parseChartConfig(code);
        if (chartConfig) {
          out.push(
            <div key={k++} className="my-4 p-4 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl">
              <ChartComponent config={chartConfig} className="w-full" />
            </div>
          );
        } else {
          // If chart parsing fails, show as regular code
          out.push(
            <div key={k++} className="code-block max-w-full">
              <div className="code-block-header">
                <span>chart (invalid config)</span>
                <div className="flex gap-1">
                  <CopyBtn text={code} />
                </div>
              </div>
              <div className="code-block-body overflow-x-auto">
                <SyntaxHighlighter language="json" style={buildSyntaxStyle()} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers={false}>
                  {code}
                </SyntaxHighlighter>
              </div>
            </div>
          );
        }
      } else if (lang === 'presentation') {
        // Handle presentation files
        const lines = code.split('\n');
        const filenameLine = lines.find(line => !line.startsWith('data:'));
        const dataLine = lines.find(line => line.startsWith('data:'));
        
        if (filenameLine && dataLine) {
          const filename = filenameLine.trim();
          const dataUrl = dataLine.trim();
          
          out.push(
            <div key={k++} className="my-4 p-4 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-[rgb(var(--text))]" />
                  <span className="text-sm font-medium text-[rgb(var(--text))]">PowerPoint Presentation</span>
                </div>
                <DownloadBtn filename={filename} dataUrl={dataUrl} />
              </div>
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
                  <Download size={24} className="text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-sm text-[rgb(var(--muted))] mb-1">{filename}</p>
                <p className="text-xs text-[rgb(var(--muted))]">Click download to get your presentation</p>
              </div>
            </div>
          );
        } else {
          // Invalid presentation format
          out.push(
            <div key={k++} className="code-block max-w-full">
              <div className="code-block-header">
                <span>presentation (invalid format)</span>
                <div className="flex gap-1">
                  <CopyBtn text={code} />
                </div>
              </div>
              <div className="code-block-body overflow-x-auto">
                <SyntaxHighlighter language="json" style={buildSyntaxStyle()} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers={false}>
                  {code}
                </SyntaxHighlighter>
              </div>
            </div>
          );
        }
      } else {
        out.push(
          <div key={k++} className="code-block max-w-full">
            <div className="code-block-header">
              <span>{lang || 'code'}</span>
              <div className="flex gap-1">
                <PreviewBtn code={code} language={lang} />
                <CopyBtn text={code} />
              </div>
            </div>
            <div className="code-block-body overflow-x-auto">
              <SyntaxHighlighter language={lang || 'text'} style={buildSyntaxStyle()} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers={false}>
                {code}
              </SyntaxHighlighter>
            </div>
          </div>
        );
      }
      i++; continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].startsWith('|') && lines[i].endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0].split('|').slice(1, -1).map(h => h.trim());
        const rows = tableLines.slice(2).map(row => row.split('|').slice(1, -1).map(c => c.trim()));
        out.push(
          <div key={k++} className="overflow-x-auto my-3 rounded-xl overflow-hidden border border-[rgb(var(--border))]">
            <table className="min-w-full border-collapse text-[13px]">
              <thead className="bg-black/[0.03] dark:bg-white/[0.05]">
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx} className="border border-[rgb(var(--border))] px-3 py-2 text-left font-semibold">
                      {parseInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ridx) => (
                  <tr key={ridx} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    {row.map((cell, cidx) => (
                      <td key={cidx} className="border border-[rgb(var(--border))] px-3 py-2">
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    if (line.startsWith('### ')) { out.push(<h3 key={k++} className="text-[14px] font-semibold mt-4 mb-1 break-words">{parseInline(line.slice(4))}</h3>); }
    else if (line.startsWith('#### ')) { out.push(<h4 key={k++} className="text-[13px] font-semibold mt-4 mb-1 break-words">{parseInline(line.slice(5))}</h4>); }
    else if (line.startsWith('## ')) { out.push(<h2 key={k++} className="text-[15px] font-semibold mt-4 mb-1 break-words">{parseInline(line.slice(3))}</h2>); }
    else if (line.startsWith('# ')) { out.push(<h1 key={k++} className="text-[16px] font-semibold mt-4 mb-2 break-words">{parseInline(line.slice(2))}</h1>); }
    else if (line.match(/^[-*] /)) { out.push(<li key={k++} className="ml-5 list-disc text-[13.5px] leading-relaxed break-words">{parseInline(line.slice(2))}</li>); }
    else if (line.match(/^\d+\. /)) { out.push(<li key={k++} className="ml-5 list-decimal text-[13.5px] leading-relaxed break-words">{parseInline(line.replace(/^\d+\. /, ''))}</li>); }
    else if (line === '') { out.push(<div key={k++} className="h-2.5" />); }
    else if (/^---+$/.test(line.trim())) { out.push(<hr key={k++} className="my-3 border-none h-px bg-[rgb(var(--border))]" />); }
    else { out.push(<p key={k++} className="text-[13.5px] leading-relaxed break-words">{parseInline(line)}</p>); }
    i++;
  }
  return out;
}

interface MessageBubbleProps {
  message: Message;
  modelName?: string;
  modelId?: string;
  isStreaming?: boolean;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
  onContinue?: () => void;
  onFollowUpClick?: (followUp: string) => void;
  onVersionChange?: (versionIndex: number) => void;
}

export default function MessageBubble({ message, modelName, modelId, isStreaming, onRetry, onEdit, onDelete, onContinue, onFollowUpClick, onVersionChange }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [, setTheme] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(message.currentVersionIndex ?? 0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const modelInfo = modelId ? getModelInfo(modelId) : null;
  const ModelIcon = modelInfo && typeof modelInfo.icon !== 'string' ? modelInfo.icon : null;
  const displayName = modelInfo?.displayName || modelName || 'Assistant';

  const versions = message.versions || [];
  const hasVersions = versions.length > 0;
  const displayMessage = hasVersions && currentVersionIndex < versions.length 
    ? versions[currentVersionIndex] 
    : message;
  
  
  const handleVersionChange = (newIndex: number) => {
    setCurrentVersionIndex(newIndex);
    onVersionChange?.(newIndex);
  };

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(t => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    const handleContextMenu = (e: MouseEvent) => {
      if (isUser || isTool) return;
      
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      
      if (selectedText && selectedText.length > 0 && contentRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, selectedText });
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isUser, isTool]);

  const handleAddQuote = () => {
    if (contextMenu) {
      window.dispatchEvent(new CustomEvent('addQuote', { 
        detail: { text: contextMenu.selectedText } 
      }));
      setContextMenu(null);
    }
  };

  const stepText = !isUser && displayMessage.isStep
  ? getVisibleStepText(displayMessage.content)
  : '';

  const isEmpty =
    !isUser &&
    (displayMessage.content == null || displayMessage.content.trim().length === 0);

  if (isEmpty) {
    // Completely hide this message, nothing gets rendered
    return null;
  }

  // Tool execution message
  if (isTool) {
    const contentLength = message.content?.length || 0;
    const isLong = contentLength > 100;
    const hasImages = message.images && message.images.length > 0;
    const hasArtifacts = message.artifacts && message.artifacts.length > 0;
    
    // Check if this is a Remotion tool response
    let remotionData = null;
    if (message.tool_name === 'remotion' && message.content) {
      try {
        remotionData = JSON.parse(message.content);
      } catch {
        // Not valid JSON, ignore
      }
    }
    
    return (
      <div className="flex gap-2 sm:gap-3 px-4 sm:px-8 py-1 sm:max-w-4xl mx-auto w-full mb-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mt-0.5">
          {message.tool_status === 'loading' && <Loader2 size={14} className="animate-spin text-purple-600 dark:text-purple-400" />}
          {message.tool_status === 'success' && <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
          {message.tool_status === 'error' && <XCircle size={14} className="text-red-600 dark:text-red-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div 
            className={`text-[13px] text-[rgb(var(--muted))] flex items-center gap-1.5 ${message.tool_status !== 'loading' && !hasImages && !hasArtifacts && !remotionData ? 'cursor-pointer hover:text-[rgb(var(--text))]' : ''}`}
            onClick={() => message.tool_status !== 'loading' && !hasImages && !hasArtifacts && !remotionData && setExpanded(p => !p)}
          >
            {message.tool_status !== 'loading' && !hasImages && !hasArtifacts && !remotionData && (
              expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            )}
            <span className="font-medium">{formatToolLabel(message.tool_name, message.toolDiff?.path, message.tool_status)}</span>
            {message.tool_status === 'error' && <span className="text-red-500"> — Failed</span>}
          </div>
          {hasImages && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(message.images ?? []).map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={img} alt="Generated" className="rounded-xl max-w-md max-h-96 object-cover border border-[rgb(var(--border))]" />
                  <button
                    onClick={async () => {
                      try {
                        // Try Tauri file save first
                        const response = await fetch(img);
                        const arrayBuffer = await response.arrayBuffer();
                        const uint8Array = new Uint8Array(arrayBuffer);
                        
                        // Use Tauri dialog to pick save location
                        const filePath = await save({
                          filters: [
                            {
                              name: 'PNG Images',
                              extensions: ['png']
                            }
                          ],
                          defaultPath: `plot-${Date.now()}.png`
                        });
                        
                        if (filePath) {
                          await writeFile(filePath, uint8Array);
                        }
                      } catch (error) {
                        // Fallback to browser download if Tauri fails
                        console.error('Tauri save failed, using browser fallback:', error);
                        try {
                          const response = await fetch(img);
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `plot-${Date.now()}.png`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch {
                          const a = document.createElement('a');
                          a.href = img;
                          a.download = `plot-${Date.now()}.png`;
                          a.click();
                        }
                      }
                    }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-[rgb(var(--panel))] border border-[rgb(var(--border))] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {hasArtifacts && (
            <div className="flex flex-col gap-2 mt-2">
              {(message.artifacts ?? []).map((artifact, idx) => (
                <div key={idx} className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[rgb(var(--text))] truncate">{artifact.original_path}</p>
                      <p className="text-[11px] text-[rgb(var(--muted))] mt-0.5">{artifact.message}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const url = artifact.direct_download;
                        const filename = artifact.original_path.split('/').pop() || artifact.original_path;

                        // Tauri: use native save dialog
                        if ((window as any).__TAURI_INTERNALS__) {
                          try {
                            const { save } = await import('@tauri-apps/plugin-dialog');
                            const { writeFile } = await import('@tauri-apps/plugin-fs');
                            const savePath = await save({ defaultPath: filename });
                            if (!savePath) return;
                            // Convert data URL or fetch remote to Uint8Array
                            let bytes: Uint8Array;
                            if (url.startsWith('data:')) {
                              const base64 = url.split(',')[1];
                              const binary = atob(base64);
                              bytes = new Uint8Array(binary.length);
                              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                            } else {
                              const res = await fetch(url);
                              bytes = new Uint8Array(await res.arrayBuffer());
                            }
                            await writeFile(savePath, bytes);
                            return;
                          } catch { /* fall through to browser download */ }
                        }

                        // Browser fallback
                        if (url.startsWith('data:')) {
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = filename;
                          a.click();
                        } else {
                          fetch(url)
                            .then(r => r.blob())
                            .then(blob => {
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = blobUrl;
                              a.download = filename;
                              a.click();
                              URL.revokeObjectURL(blobUrl);
                            })
                            .catch(() => window.open(url, '_blank'));
                        }
                      }}
                      className="btn-secondary text-xs py-1.5 px-3 gap-1.5 shrink-0"
                    >
                      <Download size={12} />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {remotionData && remotionData.success && remotionData.code && (
            <div className="mt-2">
              <RemotionPreview
                code={remotionData.code}
                durationInFrames={remotionData.durationInFrames || 150}
                fps={remotionData.fps || 30}
                compositionWidth={remotionData.compositionWidth || 1920}
                compositionHeight={remotionData.compositionHeight || 1080}
              />
            </div>
          )}
          {message.tool_status !== 'loading' && expanded && !hasImages && !hasArtifacts && !remotionData && (
            message.toolDiff ? (
              <ToolDiffView diff={message.toolDiff} />
            ) : message.content ? (
              <pre className="text-[11px] text-[rgb(var(--muted))] mt-1 font-mono bg-black/[0.03] dark:bg-white/[0.05] p-2 rounded overflow-x-auto max-h-[300px] overflow-y-auto">
                {message.content}
              </pre>
            ) : null
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 sm:gap-3 px-4 sm:px-8 py-1 sm:max-w-4xl mx-auto w-full mb-3 overflow-x-hidden ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-slide-in-up`}>
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center text-white dark:text-black text-[11px] font-bold mt-0.5">
          {modelInfo && typeof modelInfo.icon === 'string' && !imgError ? (
            <img src={modelInfo.icon} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : ModelIcon ? (
            <ModelIcon size={13} />
          ) : (
            <Bot size={13} />
          )}
        </div>
      )}

      <div className={`flex flex-col ${isUser ? 'items-center sm:items-end' : 'items-start'} ${isUser ? 'w-full sm:w-auto sm:max-w-[70%]' : 'flex-1'} min-w-0`}>
        {!isUser && modelName && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[13px] font-medium text-[rgb(var(--text))]">{displayName}</span>
          </div>
        )}

        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {message.images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img} alt="attachment" className="rounded-xl max-w-[200px] max-h-[200px] object-cover border border-[rgb(var(--border))]" />
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = img;
                    a.download = `image-${Date.now()}.png`;
                    a.click();
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-[rgb(var(--panel))] border border-[rgb(var(--border))] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bubble */}
        {isUser ? (
          isEditing ? (
            <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl p-3 shadow-sm">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full bg-transparent text-[13.5px] text-[rgb(var(--text))] resize-none outline-none leading-relaxed"
                rows={3}
                autoFocus
              />
              <div className="flex gap-1 mt-2">
                <button onClick={() => { onEdit?.(editText); setIsEditing(false); }} className="toolbar-btn"><Check size={15} /></button>
                <button onClick={() => { setEditText(message.content); setIsEditing(false); }} className="toolbar-btn"><X size={15} /></button>
              </div>
            </div>
          ) : (
            <div className="bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] rounded-[22px_22px_6px_22px] px-4 py-2.5 text-[13.5px] leading-relaxed shadow-[0_2px_12px_rgb(var(--accent)/0.28)] group max-w-full break-words">
              <p className="message-text whitespace-pre-wrap break-words">{insertSoftBreaks(message.content, getWrapLength())}</p>
            </div>
          )
        ) : (
          <div 
            ref={contentRef}
            className={`text-[rgb(var(--text))] w-full min-w-0 message-text break-words ${displayMessage.isError ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-3' : ''}`}
          >
            {displayMessage.isStep && (
              <div className="mb-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--panel))] border border-[rgb(var(--border))] px-3 py-1.5 text-[11px] text-[rgb(var(--muted))]">
                  <div className="flex items-center justify-center w-4 h-4 rounded-full bg-[rgb(var(--accent))]/10">
                    <div className="w-2 h-2 rounded-full bg-[rgb(var(--accent))]" />
                  </div>
                  <span className="font-medium uppercase tracking-wide">
                    Step
                  </span>
                  <span className="text-[rgb(var(--border))]">•</span>
                  <span className="text-[rgb(var(--text))] text-[11px]">
                    {stepText}
                  </span>
                </div>
              </div>
            )}

            {!isUser && !displayMessage.isStep && (
              <>
                {displayMessage.reasoning && (
                  <ReasoningBlock reasoning={displayMessage.reasoning} defaultCollapsed={!isStreaming} />
                )}
                {renderContent(displayMessage.content)}
                {isStreaming && (
                  <span className="inline-block w-2 h-2 rounded-full bg-current align-middle ml-0.5 animate-pulse" />
                )}
                                {/* Model tag below */}
                {modelName && (
                  <p className="mt-2 text-[11px] text-[rgb(var(--muted))] flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-[rgb(var(--muted))] inline-block" />
                    {modelName}
                    {displayMessage.tokensPerSecond && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[rgb(var(--muted))] inline-block" />
                        {displayMessage.tokensPerSecond} t/s
                      </>
                    )}
                    {displayMessage.tokens && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[rgb(var(--muted))] inline-block" />
                        {displayMessage.tokens} tokens
                      </>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Hover actions */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 mt-2">
            {!isUser && <CopyBtn text={message.content} />}
            {!isUser && onRetry && <button className="toolbar-btn" title="Retry" onClick={onRetry}><RotateCcw size={15} /></button>}
            {/* Continue button for incomplete responses */}
            {!isUser && onContinue && message.finishReason && message.finishReason !== 'stop' && message.finishReason !== 'function_call' && message.finishReason !== 'tool_calls' && (
              <button className="toolbar-btn" title="Continue response" onClick={onContinue}>
                <ChevronRight size={15} />
              </button>
            )}
            {/* Compact retry navigation */}
            {!isUser && hasVersions && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => handleVersionChange(Math.max(0, currentVersionIndex - 1))}
                  disabled={currentVersionIndex === 0}
                  className="toolbar-btn disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous retry"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="text-[10px] text-[rgb(var(--muted))] px-1 font-medium">
                  {currentVersionIndex + 1}/{versions.length + 1}
                </span>
                <button
                  onClick={() => handleVersionChange(Math.min(versions.length, currentVersionIndex + 1))}
                  disabled={currentVersionIndex === versions.length}
                  className="toolbar-btn disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next retry"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
            {isUser && onEdit && <button className="toolbar-btn" title="Edit" onClick={() => setIsEditing(true)}><Edit2 size={15} /></button>}
            {onDelete && <button className="toolbar-btn" title="Delete" onClick={onDelete}><Trash2 size={15} /></button>}
          </div>
        )}

        {/* Follow-ups */}
        {!isUser && message.followUps && message.followUps.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.followUps.map((followUp, idx) => (
              <button
                key={idx}
                onClick={() => onFollowUpClick?.(followUp)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {followUp}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg shadow-lg py-1 z-50 min-w-[150px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleAddQuote}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[rgb(var(--text))] hover:bg-[rgb(var(--accent))]/10 hover:text-[rgb(var(--accent))] w-full text-left transition-colors"
          >
            <Quote size={14} />
            Add to quote
          </button>
        </div>
      )}
    </div>
  );
}
