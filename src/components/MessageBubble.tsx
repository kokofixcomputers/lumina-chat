import { useState, useRef, useEffect } from 'react';
import {
  Copy, Edit2, Trash2, RotateCcw, Check, AlertCircle,
  User, Bot, Wrench, Sparkles, ChevronDown, ChevronUp,
  Eye, Loader2, CheckCircle, XCircle, ChevronRight, Download, X, ChevronLeft, Quote
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getModelInfo } from '../utils/models';
import type { Message } from '../types';
import { writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import ChartComponent from './ChartComponent';

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
  console.log(tauri)
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
            className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
            onClick={e => openLink(url, e)}
          >
            {label}
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
          className="px-1.5 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.08] text-[12px] font-mono"
        >
          {p.slice(1, -1)}
        </code>
      );
    }


    return p;
  });
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
                <SyntaxHighlighter language="json" style={isDark ? oneDark : oneLight} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers={false}>
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
              <SyntaxHighlighter language={lang || 'text'} style={isDark ? oneDark : oneLight} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers={false}>
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

    if (line.startsWith('### ')) { out.push(<h3 key={k++} className="text-[14px] font-semibold mt-4 mb-1">{parseInline(line.slice(4))}</h3>); }
    else if (line.startsWith('#### ')) { out.push(<h4 key={k++} className="text-[13px] font-semibold mt-4 mb-1">{parseInline(line.slice(5))}</h4>); }
    else if (line.startsWith('## ')) { out.push(<h2 key={k++} className="text-[15px] font-semibold mt-4 mb-1">{parseInline(line.slice(3))}</h2>); }
    else if (line.startsWith('# ')) { out.push(<h1 key={k++} className="text-[16px] font-semibold mt-4 mb-2">{parseInline(line.slice(2))}</h1>); }
    else if (line.match(/^[-*] /)) { out.push(<li key={k++} className="ml-5 list-disc text-[13.5px] leading-relaxed">{parseInline(line.slice(2))}</li>); }
    else if (line.match(/^\d+\. /)) { out.push(<li key={k++} className="ml-5 list-decimal text-[13.5px] leading-relaxed">{parseInline(line.replace(/^\d+\. /, ''))}</li>); }
    else if (line === '') { out.push(<div key={k++} className="h-2.5" />); }
    else if (/^---+$/.test(line.trim())) { out.push(<hr key={k++} className="my-3 border-none h-px bg-[rgb(var(--border))]" />); }
    else { out.push(<p key={k++} className="text-[13.5px] leading-relaxed">{parseInline(line)}</p>); }
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
    
    return (
      <div className="flex gap-2 sm:gap-3 px-4 sm:px-8 py-1 max-w-4xl mx-auto w-full mb-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mt-0.5">
          {message.tool_status === 'loading' && <Loader2 size={14} className="animate-spin text-purple-600 dark:text-purple-400" />}
          {message.tool_status === 'success' && <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
          {message.tool_status === 'error' && <XCircle size={14} className="text-red-600 dark:text-red-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div 
            className={`text-[13px] text-[rgb(var(--muted))] flex items-center gap-1.5 ${isLong && message.tool_status !== 'loading' && !hasImages && !hasArtifacts ? 'cursor-pointer hover:text-[rgb(var(--text))]' : ''}`}
            onClick={() => isLong && message.tool_status !== 'loading' && !hasImages && !hasArtifacts && setExpanded(p => !p)}
          >
            {isLong && message.tool_status !== 'loading' && !hasImages && !hasArtifacts && (
              expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            )}
            <span className="font-medium">{message.tool_name}</span>
            {message.tool_status === 'loading' && <span> - Running...</span>}
            {message.tool_status === 'success' && <span> - Completed</span>}
            {message.tool_status === 'error' && <span> - Failed</span>}
          </div>
          {hasImages && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.images.map((img, idx) => (
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
              {message.artifacts.map((artifact, idx) => (
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
          {message.tool_status !== 'loading' && message.content && (!isLong || expanded) && !hasImages && !hasArtifacts && (
            <pre className="text-[11px] text-[rgb(var(--muted))] mt-1 font-mono bg-black/[0.03] dark:bg-white/[0.05] p-2 rounded overflow-x-auto max-h-[300px] overflow-y-auto">
              {message.content}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 sm:gap-3 px-4 sm:px-8 py-1 max-w-4xl mx-auto w-full mb-3 overflow-x-hidden ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-slide-in-up`}>
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

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} ${isUser ? 'max-w-[70%]' : 'flex-1'} min-w-0`}>
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
            <div className="bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] rounded-[18px_18px_4px_18px] px-4 py-2.5 text-[13.5px] leading-relaxed shadow-[0_1px_4px_rgba(0,0,0,0.15)] group max-w-full">
              <p className="whitespace-pre-wrap break-words overflow-wrap-anywhere">{message.content}</p>
            </div>
          )
        ) : (
          <div 
            ref={contentRef}
            className={`text-[rgb(var(--text))] w-full min-w-0 break-words overflow-wrap-anywhere ${displayMessage.isError ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-3' : ''}`}
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
