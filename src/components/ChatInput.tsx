import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Send, Paperclip, X, Loader2,
  Smile, Image as ImageIcon, Table, LayoutGrid,
  Type, List, Eraser, MoreHorizontal, ChevronDown,
  Check, Search, Eye, Zap, Settings2, RotateCcw
} from 'lucide-react';
import { getModelInfo } from '../utils/models';

interface Model {
  fullId: string;
  name: string;
  providerName: string;
  providerId: string;
  supportsImages?: boolean;
  contextLength?: number;
}

interface ChatInputProps {
  onSend: (content: string, images: string[]) => void;
  isGenerating: boolean;
  onStopGeneration?: () => void;
  modelName: string;
  allModels: Model[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  onOpenProviders?: () => void;
  onRetry?: () => void;
  mode?: 'chat' | 'image';
  onModeChange?: (mode: 'chat' | 'image') => void;
  attachments?: string[];
  onAttachmentsChange?: (attachments: string[]) => void;
  prettifyModelNames?: boolean;
}

// Color per provider
const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  'anthropic-proxy': '#d4a574',
  ollama: '#6366f1',
  groq: '#f97316',
  mistral: '#eb6f33',
  together: '#8b5cf6',
};

const PROVIDER_INITIALS: Record<string, string> = {
  openai: 'O',
  'anthropic-proxy': 'A',
  ollama: 'L',
  groq: 'G',
  mistral: 'M',
  together: 'T',
};

function ProviderDot({ providerId, providerName }: { providerId: string; providerName: string }) {
  const color = PROVIDER_COLORS[providerId] || '#8b5cf6';
  const initial = PROVIDER_INITIALS[providerId] || providerName[0]?.toUpperCase() || '?';
  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
      style={{ background: color }}
    >
      {initial}
    </div>
  );
}

function formatCtx(n?: number) {
  if (!n) return null;
  if (n >= 1000000) return `${n / 1000000}M`;
  if (n >= 1000) return `${n / 1000}K`;
  return String(n);
}

export default function ChatInput({
  onSend,
  isGenerating,
  onStopGeneration,
  modelName,
  allModels,
  selectedModelId,
  onModelChange,
  onOpenProviders,
  onRetry,
  mode = 'chat',
  onModeChange,
  attachments = [],
  onAttachmentsChange,
  prettifyModelNames = true,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const openModelPicker = () => {
    if (!modelBtnRef.current) return;
    const rect = modelBtnRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // Center on mobile - use fixed positioning
      setDropdownPos({ 
        top: rect.top, 
        left: window.innerWidth / 2 // 100 is half of dropdown width (200px)
      });
    } else {
      // Align to button on desktop
      setDropdownPos({ top: rect.top, left: rect.left });
    }
    
    setShowModelPicker(true);
    setTimeout(() => modelSearchRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        modelBtnRef.current && !modelBtnRef.current.contains(e.target as Node)
      ) {
        setShowModelPicker(false);
        setModelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelPicker]);

  const handleSend = useCallback(() => {
    if ((!text.trim() && !images.length && !attachments.length) || isGenerating) return;
    const allAttachments = [...images, ...attachments];
    onSend(text.trim(), allAttachments);
    setText('');
    setImages([]);
    if (onAttachmentsChange) onAttachmentsChange([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, images, attachments, isGenerating, onSend, onAttachmentsChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result as string;
        if (mode === 'chat' && onAttachmentsChange) {
          onAttachmentsChange([...attachments, result]);
        } else {
          setImages(prev => [...prev, result]);
        }
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    Array.from(e.dataTransfer.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result as string;
        if (mode === 'chat' && onAttachmentsChange) {
          onAttachmentsChange([...attachments, result]);
        } else {
          setImages(prev => [...prev, result]);
        }
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const currentModel = allModels.find(m => m.fullId === selectedModelId);
  const canAttachImages = currentModel?.supportsImages ?? false;
  const modelId = currentModel?.fullId.split('/')[1] || '';
  const modelInfo = getModelInfo(modelId);
  const displayModelName = prettifyModelNames ? modelInfo.displayName : modelId;
  const ModelIcon = typeof modelInfo.icon === 'string' ? null : modelInfo.icon;

  // Group filtered models by provider
  const filteredModels = modelSearch.trim()
    ? allModels.filter(m =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.providerName.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : allModels;

  const grouped = filteredModels.reduce<Record<string, Model[]>>((acc, m) => {
    const key = m.providerName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <div 
      className="w-full max-w-3xl mx-auto px-2 sm:px-4 pb-5 pt-2 relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-[rgb(var(--accent))]/10 border-2 border-dashed border-[rgb(var(--accent))] rounded-2xl flex items-center justify-center z-50 pointer-events-none">
          <div className="text-[rgb(var(--accent))] font-semibold text-sm flex items-center gap-2">
            <Paperclip size={20} />
            Drop files here
          </div>
        </div>
      )}
      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map((att, idx) => {
            const isImage = att.startsWith('data:image/');
            return (
              <div key={idx} className="relative group">
                {isImage ? (
                  <img src={att} alt="" className="w-14 h-14 rounded-xl object-cover border border-[rgb(var(--border))]" />
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] flex items-center justify-center">
                    <Paperclip size={20} className="text-[rgb(var(--muted))]" />
                  </div>
                )}
                <button
                  onClick={() => onAttachmentsChange?.(attachments.filter((_, i) => i !== idx))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgb(var(--text))] text-[rgb(var(--bg))] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={9} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img src={img} alt="" className="w-14 h-14 rounded-xl object-cover border border-[rgb(var(--border))]" />
              <button
                onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgb(var(--text))] text-[rgb(var(--bg))] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,text/*,.txt,.md,.json,.csv,.log" multiple className="hidden" onChange={handleFileChange} />

      {/* Main input box */}
      <div className="chat-input-box">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask, create, or start a task..."
          rows={1}
          className="w-full bg-transparent px-3 sm:px-4 pt-3.5 pb-2 text-base sm:text-[13.5px] text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] resize-none outline-none leading-relaxed"
          style={{ minHeight: '48px', maxHeight: '180px' }}
        />

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-3 pb-2.5 pt-0.5">
          <button title="Emoji" className="toolbar-btn"><Smile size={15} /></button>
          <button title="Image" className="toolbar-btn" onClick={canAttachImages ? () => fileRef.current?.click() : undefined}>
            <ImageIcon size={15} />
          </button>
          <button title="Attach" className="toolbar-btn" onClick={() => fileRef.current?.click()}><Paperclip size={15} /></button>
          <button title="Table" className="toolbar-btn"><Table size={15} /></button>
          <button title="Plugins" className="toolbar-btn"><LayoutGrid size={15} /></button>
          <div className="w-px h-4 bg-[rgb(var(--border))] mx-1" />
          <button title="Format" className="toolbar-btn"><Type size={15} /></button>
          <button title="List" className="toolbar-btn"><List size={15} /></button>
          <button title="Clear" className="toolbar-btn" onClick={() => setText('')}><Eraser size={15} /></button>
          <button title="More" className="toolbar-btn"><MoreHorizontal size={15} /></button>
          {onRetry && <button title="Retry" className="toolbar-btn" onClick={onRetry}><RotateCcw size={15} /></button>}

          <button
            onClick={isGenerating ? onStopGeneration : handleSend}
            disabled={!isGenerating && (!text.trim() && !images.length && !attachments.length)}
            className="send-btn ml-auto"
          >
            {isGenerating ? <X size={15} /> : <Send size={15} />}
          </button>
        </div>

        {/* Bottom: mode + model picker */}
        <div className="flex items-center px-3 pb-2.5 gap-2">
          {onModeChange && (
            <div className="flex gap-1">
              <button
                onClick={() => onModeChange('chat')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all ${
                  mode === 'chat' 
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]' 
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => onModeChange('image')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all ${
                  mode === 'image' 
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]' 
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                Image
              </button>
            </div>
          )}
          <button
            ref={modelBtnRef}
            onClick={openModelPicker}
            className="flex items-center gap-1.5 text-[12px] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors rounded-md px-2 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            {typeof modelInfo.icon === 'string' ? (
              <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-[rgb(var(--border))]">
                <img src={modelInfo.icon} alt="" className="w-full h-full object-cover" />
              </div>
            ) : ModelIcon ? (
              <div className="w-5 h-5 rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] flex items-center justify-center shrink-0">
                <ModelIcon size={11} />
              </div>
            ) : null}
            <span className="font-medium">{displayModelName}</span>
            <ChevronDown size={11} />
          </button>
        </div>
      </div>

      {/* ── Model picker dropdown (fixed) ── */}
      {showModelPicker && (
        <div
          ref={dropdownRef}
          className="model-picker-dropdown"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            transform: 'translateY(calc(-100% - 8px))',
          }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 mx-2 mb-1 px-2.5 py-1.5 rounded-lg bg-[rgb(var(--bg))] border border-[rgb(var(--border))]">
            <Search size={13} className="text-[rgb(var(--muted))] shrink-0" />
            <input
              ref={modelSearchRef}
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              placeholder="Search models..."
              className="flex-1 bg-transparent text-[13px] outline-none text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))]"
            />
          </div>

          {/* Groups */}
          {Object.keys(grouped).length === 0 ? (
            <p className="text-[12px] text-[rgb(var(--muted))] text-center py-4">No models found</p>
          ) : (
            Object.entries(grouped).map(([providerName, models]) => {
              const firstModel = models[0];
              return (
                <div key={providerName} className="mb-1">
                  {/* Provider header */}
                  <div className="flex items-center gap-2 px-3 py-1.5 mt-1">
                    <ProviderDot providerId={firstModel.providerId} providerName={providerName} />
                    <span className="text-[11px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">{providerName}</span>
                  </div>

                  {/* Models */}
                  {models.map(m => {
                    const ctx = formatCtx(m.contextLength);
                    const isSelected = selectedModelId === m.fullId;
                    const mId = m.fullId.split('/')[1];
                    const mInfo = getModelInfo(mId);
                    const MIcon = typeof mInfo.icon === 'string' ? null : mInfo.icon;
                    const displayName = prettifyModelNames ? mInfo.displayName : mId;
                    return (
                      <button
                        key={m.fullId}
                        onClick={() => { onModelChange(m.fullId); setShowModelPicker(false); setModelSearch(''); }}
                        className={`model-option w-full text-left ${isSelected ? 'selected' : ''}`}
                      >
                        {typeof mInfo.icon === 'string' ? (
                          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-[rgb(var(--border))]">
                            <img src={mInfo.icon} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : MIcon ? (
                          <div className="w-5 h-5 rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] flex items-center justify-center shrink-0">
                            <MIcon size={11} />
                          </div>
                        ) : null}
                        <span className="flex-1 font-medium truncate">{displayName}</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {m.supportsImages && (
                            <Eye size={12} className="text-[rgb(var(--muted))]" title="Vision" />
                          )}
                          {ctx && (
                            <span className="flex items-center gap-0.5 text-[10px] text-[rgb(var(--muted))]">
                              <Zap size={10} />
                              {ctx}
                            </span>
                          )}
                          {isSelected && <Check size={13} className="text-[rgb(var(--accent))]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}

          {/* Footer */}
          <div className="border-t border-[rgb(var(--border))] mt-1 mx-2" />
          <button
            onClick={() => { setShowModelPicker(false); onOpenProviders?.(); }}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-[12px] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors rounded-b-xl"
          >
            <Settings2 size={13} />
            <span>Manage Providers</span>
            <span className="ml-auto opacity-50">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
