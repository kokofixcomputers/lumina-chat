import { useState, useEffect } from 'react';
import { Copy, Check, RotateCcw, Edit2, Trash2, X, Bot, Download, Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '../types';
import { getModelInfo } from '../utils/models';

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

function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1,-1)}</em>;
    if (p.startsWith('`') && p.endsWith('`')) return (
      <code key={i} className="px-1.5 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.08] text-[12px] font-mono">{p.slice(1,-1)}</code>
    );
    return p;
  });
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
      out.push(
        <div key={k++} className="code-block max-w-full">
          <div className="code-block-header">
            <span>{line.slice(3).trim() || 'code'}</span>
            <CopyBtn text={code} />
          </div>
          <div className="code-block-body overflow-x-auto">
            <SyntaxHighlighter language={lang || 'text'} style={isDark ? oneDark : oneLight} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers={false}>
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
      );
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
          <div key={k++} className="overflow-x-auto my-3">
            <table className="min-w-full border-collapse border border-[rgb(var(--border))] text-[13px]">
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

    if (line.startsWith('### ')) { out.push(<h3 key={k++} className="text-[14px] font-semibold mt-4 mb-1">{line.slice(4)}</h3>); }
    else if (line.startsWith('## ')) { out.push(<h2 key={k++} className="text-[15px] font-semibold mt-4 mb-1">{line.slice(3)}</h2>); }
    else if (line.startsWith('# ')) { out.push(<h1 key={k++} className="text-[16px] font-semibold mt-4 mb-2">{line.slice(2)}</h1>); }
    else if (line.match(/^[-*] /)) { out.push(<li key={k++} className="ml-5 list-disc text-[13.5px] leading-relaxed">{parseInline(line.slice(2))}</li>); }
    else if (line.match(/^\d+\. /)) { out.push(<li key={k++} className="ml-5 list-decimal text-[13.5px] leading-relaxed">{parseInline(line.replace(/^\d+\. /, ''))}</li>); }
    else if (line === '') { out.push(<div key={k++} className="h-2.5" />); }
    else { out.push(<p key={k++} className="text-[13.5px] leading-relaxed">{parseInline(line)}</p>); }
    i++;
  }
  return out;
}

interface MessageBubbleProps {
  message: Message;
  modelName?: string;
  modelId?: string;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
  onFollowUpClick?: (followUp: string) => void;
}

export default function MessageBubble({ message, modelName, modelId, onRetry, onEdit, onDelete, onFollowUpClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [, setTheme] = useState(0);
  const [imgError, setImgError] = useState(false);

  const modelInfo = modelId ? getModelInfo(modelId) : null;
  const ModelIcon = modelInfo && typeof modelInfo.icon !== 'string' ? modelInfo.icon : null;
  const displayName = modelInfo?.displayName || modelName || 'Assistant';

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(t => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Tool execution message
  if (isTool) {
    const [expanded, setExpanded] = useState(false);
    const contentLength = message.content?.length || 0;
    const isLong = contentLength > 100;
    const hasImages = message.images && message.images.length > 0;
    
    return (
      <div className="flex gap-2 sm:gap-3 px-4 sm:px-8 py-1 max-w-4xl mx-auto w-full mb-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mt-0.5">
          {message.tool_status === 'loading' && <Loader2 size={14} className="animate-spin text-purple-600 dark:text-purple-400" />}
          {message.tool_status === 'success' && <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
          {message.tool_status === 'error' && <XCircle size={14} className="text-red-600 dark:text-red-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div 
            className={`text-[13px] text-[rgb(var(--muted))] flex items-center gap-1.5 ${isLong && message.tool_status !== 'loading' && !hasImages ? 'cursor-pointer hover:text-[rgb(var(--text))]' : ''}`}
            onClick={() => isLong && message.tool_status !== 'loading' && !hasImages && setExpanded(p => !p)}
          >
            {isLong && message.tool_status !== 'loading' && !hasImages && (
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
                        const response = await fetch(img);
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `image-${Date.now()}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        const a = document.createElement('a');
                        a.href = img;
                        a.download = `image-${Date.now()}.png`;
                        a.click();
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
          {message.tool_status !== 'loading' && message.content && (!isLong || expanded) && !hasImages && (
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
          <div className={`text-[rgb(var(--text))] w-full min-w-0 break-words overflow-wrap-anywhere ${message.isError ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-3' : ''}`}>
            {renderContent(message.content)}
            {/* Model tag below */}
            {modelName && (
              <p className="mt-2 text-[11px] text-[rgb(var(--muted))] flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[rgb(var(--muted))] inline-block" />
                {modelName}
                {message.tokensPerSecond && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[rgb(var(--muted))] inline-block" />
                    {message.tokensPerSecond} t/s
                  </>
                )}
                {message.tokens && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[rgb(var(--muted))] inline-block" />
                    {message.tokens} tokens
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {/* Hover actions */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 mt-2">
            {!isUser && <CopyBtn text={message.content} />}
            {!isUser && onRetry && <button className="toolbar-btn" title="Retry" onClick={onRetry}><RotateCcw size={15} /></button>}
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
    </div>
  );
}
