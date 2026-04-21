import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Send, Paperclip, X, Loader2,
  Smile, Image as ImageIcon, Table, LayoutGrid,
  Type, List, Eraser, MoreHorizontal, ChevronDown,
  Check, Search, Eye, Settings2, RotateCcw, Sparkles, MessageSquarePlus,
  Mic, Volume2, Brain, FlaskConical, Radio, BookOpen, ImageIcon as ImgOut, Video,
  Share2
} from 'lucide-react';
import { getModelInfo } from '../utils/models';
import { 
  calculateConversationTokens, 
  getContextUsagePercentage, 
  getContextStatusColor 
} from '../utils/context';
import type { Message } from '../types';

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
  onGenerateTitle?: () => void;
  onGenerateFollowUps?: () => void;
  mode?: 'chat' | 'image';
  onModeChange?: (mode: 'chat' | 'image') => void;
  attachments?: string[];
  onAttachmentsChange?: (attachments: string[])=> void;
  prettifyModelNames?: boolean;
  workflows?: Array<{ id: string; slug: string; prompt: string }>;
  useResponsesApi?: boolean;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  onReasoningEffortChange?: (effort: 'off' | 'low' | 'medium' | 'high') => void;
  onTranscribeAudio?: (blob: Blob, mimeType: string) => Promise<string>;
  buildMode?: boolean;
  onBuildModeChange?: (on: boolean) => void;
  onOpenBuildFS?: () => void;
  onOpenShare?: () => void;
  conversation?: { messages: Message[] };
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

function ContextIndicator({ 
  usedTokens, 
  maxTokens 
}: { 
  usedTokens: number; 
  maxTokens?: number; 
}) {
  if (!maxTokens) return null;
  
  const percentage = getContextUsagePercentage(usedTokens, maxTokens);
  const color = getContextStatusColor(percentage);
  const strokeWidth = 1.5;
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className="relative w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
      <svg 
        width={14} 
        height={14} 
        className="transform -rotate-90"
        style={{ overflow: 'visible' }}
      >
        {/* Background circle */}
        <circle
          cx={7}
          cy={7}
          r={radius}
          stroke="rgb(var(--border))"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={7}
          cy={7}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-300 ease-out"
        />
      </svg>
      {/* Center dot when nearly full */}
      {percentage >= 95 && (
        <div 
          className="absolute w-1 h-1 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
}

interface QandaQuestion {
  question: string;
  suggestedAnswers: string[];
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
  onGenerateTitle,
  onGenerateFollowUps,
  mode = 'chat',
  onModeChange,
  attachments = [],
  onAttachmentsChange,
  prettifyModelNames = true,
  workflows = [],
  useResponsesApi = false,
  reasoningEffort = 'off',
  onReasoningEffortChange,
  onTranscribeAudio,
  buildMode = false,
  onBuildModeChange,
  onOpenBuildFS,
  onOpenShare,
  conversation,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  const [qandaMode, setQandaMode] = useState(false);
  const [qandaQuestions, setQandaQuestions] = useState<QandaQuestion[]>([]);
  const [qandaAnswers, setQandaAnswers] = useState<string[]>([]);
  const [currentQandaIndex, setCurrentQandaIndex] = useState(0);
  const [customAnswer, setCustomAnswer] = useState('');
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [workflowMenuPos, setWorkflowMenuPos] = useState({ top: 0, left: 0 });
  const [workflowSearch, setWorkflowSearch] = useState('');
  const [showReasoningMenu, setShowReasoningMenu] = useState(false);
  const [reasoningMenuPos, setReasoningMenuPos] = useState({ top: 0, left: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showContextWarning, setShowContextWarning] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const workflowMenuRef = useRef<HTMLDivElement>(null);
  const reasoningBtnRef = useRef<HTMLButtonElement>(null);
  const reasoningMenuRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  // Calculate context usage (memoized to prevent unnecessary recalculations)
  const { usedTokens, maxTokens } = useMemo(() => {
    const used = conversation ? calculateConversationTokens(conversation.messages) : 0;
    const max = allModels.find(m => m.fullId === selectedModelId)?.contextLength;
    return { usedTokens: used, maxTokens: max };
  }, [conversation?.messages, selectedModelId, allModels]);

  // Show context warning when usage is high
  useEffect(() => {
    if (!maxTokens) {
      setShowContextWarning(false);
      return;
    }
    
    const percentage = getContextUsagePercentage(usedTokens, maxTokens);
    setShowContextWarning(percentage >= 90);
  }, [usedTokens, maxTokens]);

  const currentModel = allModels.find(m => m.fullId === selectedModelId);
  const canAttachImages = currentModel?.supportsImages ?? false;
  const modelId = currentModel ? currentModel.fullId.slice(currentModel.fullId.indexOf('/') + 1) : '';
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

  const openModelPicker = () => {
    if (!modelBtnRef.current) return;
    const rect = modelBtnRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // On mobile, CSS handles positioning - just set top position
      setDropdownPos({ top: rect.top, left: 0 });
    } else {
      // Align to button on desktop
      setDropdownPos({ top: rect.top, left: rect.left });
    }
    
    setShowModelPicker(true);
    setTimeout(() => modelSearchRef.current?.focus(), 50);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<QandaQuestion[]>;
      setQandaQuestions(customEvent.detail);
      setQandaAnswers([]);
      setCurrentQandaIndex(0);
      setCustomAnswer('');
      setQandaMode(true);
    };
    window.addEventListener('qanda', handler);
    return () => window.removeEventListener('qanda', handler);
  }, []);

  const handleQandaAnswer = (answer: string) => {
    const newAnswers = [...qandaAnswers, answer];
    setQandaAnswers(newAnswers);
    setCustomAnswer('');
    
    if (currentQandaIndex < qandaQuestions.length - 1) {
      setCurrentQandaIndex(currentQandaIndex + 1);
    } else {
      window.dispatchEvent(new CustomEvent('qanda-response', { detail: newAnswers }));
      setQandaMode(false);
    }
  };

  const handleQandaSkip = () => {
    window.dispatchEvent(new CustomEvent('qanda-response', { detail: qandaAnswers }));
    setQandaMode(false);
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
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      
      // Check if there's a workflow match
      const match = text.match(/^\/([a-zA-Z0-9_]+)\s+(.*)$/);
      if (match) {
        const [, slug, rest] = match;
        const workflow = workflows.find(w => w.slug === slug);
        if (workflow) {
          const finalContent = workflow.prompt + (rest.trim() ? ' ' + rest.trim() : '');
          onSend(finalContent, [...images, ...attachments]);
          setText('');
          setImages([]);
          if (onAttachmentsChange) onAttachmentsChange([]);
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
          setShowWorkflowMenu(false);
          return;
        }
      }
      
      handleSend(); 
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
    
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\/([a-zA-Z0-9_]*)$/);
    
    if (match && workflows.length > 0) {
      setWorkflowSearch(match[1]);
      setShowWorkflowMenu(true);
      if (textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect();
        setWorkflowMenuPos({ top: rect.top - 10, left: rect.left });
      }
    } else {
      setShowWorkflowMenu(false);
    }
  };

  const renderTextWithHighlight = () => {
    const match = getWorkflowMatch();
    if (!match) return null;

    const { fullMatch, slug } = match;

    return (
      <div
        className="pointer-events-none absolute inset-0
                  px-3 sm:px-4 pt-3.5 pb-2
                  whitespace-pre-wrap break-words leading-relaxed
                  text-base sm:text-[13.5px]"
      >
        {/* Transparent text to occupy the same width as the raw "/code " */}
        <span className="text-transparent">
          {fullMatch}
        </span>

        {/* Chip absolutely positioned over that transparent span */}
        <span
          className="absolute bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]
                    px-1 rounded"
          // you can tweak left/top if needed
        >
          /{slug}
        </span>
      </div>
    );
  };

  const getWorkflowMatch = () => {
    const match = text.match(/^\/([a-zA-Z0-9_]+)(\s|$)/);
    if (!match) return null;

    const [fullMatch, slug] = match;
    const workflow = workflows.find(w => w.slug === slug);
    if (!workflow) return null;

    return { fullMatch, slug };
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

  const handleWorkflowSelect = (workflow: { slug: string; prompt: string }) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);
    const match = textBeforeCursor.match(/\/([a-zA-Z0-9_]*)$/);
    
    if (match) {
      const beforeSlash = textBeforeCursor.slice(0, -match[0].length);
      const newText = beforeSlash + textAfterCursor.trim();
      setText(newText);
      setShowWorkflowMenu(false);
      
      setTimeout(() => {
        const finalContent = workflow.prompt + (newText.trim() ? ' ' + newText.trim() : '');
        onSend(finalContent, [...images, ...attachments]);
        setText('');
        setImages([]);
        if (onAttachmentsChange) onAttachmentsChange([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }, 0);
    }
  };

  useEffect(() => {
    if (!showWorkflowMenu) return;
    const handler = (e: MouseEvent) => {
      if (workflowMenuRef.current && !workflowMenuRef.current.contains(e.target as Node)) {
        setShowWorkflowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showWorkflowMenu]);

  useEffect(() => {
    if (!showReasoningMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        reasoningMenuRef.current && !reasoningMenuRef.current.contains(e.target as Node) &&
        reasoningBtnRef.current && !reasoningBtnRef.current.contains(e.target as Node)
      ) {
        setShowReasoningMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showReasoningMenu]);

  const filteredWorkflows = workflows.filter(w => 
    w.slug.toLowerCase().includes(workflowSearch.toLowerCase())
  );

  const handleMicClick = async () => {
    if (isTranscribing) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        // ondataavailable fires synchronously before onstop in Chrome,
        // but use a microtask gap to be safe across browsers
        setTimeout(async () => {
          if (!onTranscribeAudio || audioChunksRef.current.length === 0) return;
          setIsTranscribing(true);
          try {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            const transcript = await onTranscribeAudio(blob, mimeType);
            if (transcript) {
              setText(prev => prev ? prev + ' ' + transcript : transcript);
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.style.height = 'auto';
                  textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px';
                }
              }, 0);
            }
          } catch (err) {
            console.error('STT error:', err);
          } finally {
            setIsTranscribing(false);
          }
        }, 0);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  };

  if (qandaMode && qandaQuestions.length > 0) {
    const currentQ = qandaQuestions[currentQandaIndex];
    return (
      <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 pb-5 pt-2">
        <div className="chat-input-box">
          <div className="px-4 pt-4 pb-3">
            <div className="text-xs text-[rgb(var(--muted))] mb-2">Question {currentQandaIndex + 1} of {qandaQuestions.length}</div>
            <div className="text-sm font-medium text-[rgb(var(--text))] mb-3">{currentQ.question}</div>
            <div className="flex flex-col gap-2 mb-3">
              {currentQ.suggestedAnswers.map((answer, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQandaAnswer(answer)}
                  className="px-3 py-2 text-left text-sm rounded-lg border border-[rgb(var(--border))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  {answer}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && customAnswer.trim() && handleQandaAnswer(customAnswer.trim())}
                placeholder="Or type your own answer..."
                className="w-full px-3 py-2 text-sm bg-transparent border border-[rgb(var(--border))] rounded-lg outline-none focus:border-[rgb(var(--accent))]"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 pb-3">
            <button
              onClick={handleQandaSkip}
              className="px-3 py-1.5 text-xs text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
            >
              Skip remaining
            </button>
            <button
              onClick={() => customAnswer.trim() && handleQandaAnswer(customAnswer.trim())}
              disabled={!customAnswer.trim()}
              className="send-btn ml-auto"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  
  return (
    <div 
      className="w-full max-w-3xl mx-auto px-2 sm:px-4 pb-5 pt-2 relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Context Limit Warning */}
      {showContextWarning && (
        <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 text-amber-600 dark:text-amber-400 text-xs">
          <span className="shrink-0 mt-0.5">!</span>
          <div className="flex-1">
            <div className="font-medium mb-0.5">Context limit may be full</div>
            <div className="text-amber-600/70 dark:text-amber-400/70">
              You may be unable to continue chatting with the assistant. This calculation may be inaccurate.
            </div>
          </div>
          <button
            onClick={() => setShowContextWarning(false)}
            className="shrink-0 p-0.5 rounded hover:bg-amber-500/20 transition-colors"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}
      
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
        <div className="relative">
          {renderTextWithHighlight()}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask, create, or start a task..."
            rows={1}
            className="w-full bg-transparent px-3 sm:px-4 pt-3.5 pb-2
                      text-base sm:text-[13.5px] text-[rgb(var(--text))]
                      placeholder:text-[rgb(var(--muted))]
                      resize-none outline-none leading-relaxed relative"
          />
        </div>


        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-3 pb-2.5 pt-0.5">
          <button title="Generate Title" className="toolbar-btn" onClick={onGenerateTitle}><Type size={15} /></button>
          <button title="Generate Follow-ups" className="toolbar-btn" onClick={onGenerateFollowUps}><MessageSquarePlus size={15} /></button>
          <div className="w-px h-4 bg-[rgb(var(--border))] mx-1" />
          <button 
            className="toolbar-btn" 
            onClick={onOpenShare}
            disabled={!conversation?.messages || conversation.messages.length === 0}
            title={!conversation?.messages || conversation.messages.length === 0 ? "No conversation to share" : "Share conversation"}
          >
            <Share2 size={15} />
          </button>
          <button className="toolbar-btn" onClick={() => fileRef.current?.click()}><Paperclip size={15} /></button>
          <button className="toolbar-btn" onClick={() => setText('')}><Eraser size={15} /></button>
          {onRetry && <button className="toolbar-btn" onClick={onRetry}><RotateCcw size={15} /></button>}
          <button
            onClick={handleMicClick}
            disabled={isTranscribing}
            className={`toolbar-btn transition-colors ${
              isRecording
                ? 'text-yellow-400 animate-pulse'
                : isTranscribing
                ? 'text-orange-400'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            <Mic size={15} />
          </button>

          <button
            onClick={isGenerating ? onStopGeneration : handleSend}
            disabled={!isGenerating && (!text.trim() && !images.length && !attachments.length)}
            className="send-btn ml-auto"
          >
            {isGenerating ? <X size={15} /> : <Send size={15} />}
          </button>
        </div>

        {/* Bottom: mode + model picker + reasoning effort */}
        <div className="flex items-center px-3 pb-2.5 gap-2">
          {!useResponsesApi && onModeChange && (
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
          {onBuildModeChange && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onBuildModeChange(!buildMode)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all ${
                  buildMode
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                <span>⚒</span>
                Build
              </button>
              {buildMode && onOpenBuildFS && (
                <button
                  onClick={onOpenBuildFS}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-all"
                >
                  Files
                </button>
              )}
            </div>
          )}
          {useResponsesApi && onReasoningEffortChange && (
            <button
              ref={reasoningBtnRef}
              onClick={() => {
                if (!reasoningBtnRef.current) return;
                const rect = reasoningBtnRef.current.getBoundingClientRect();
                setReasoningMenuPos({ top: rect.top, left: rect.left });
                setShowReasoningMenu(!showReasoningMenu);
              }}
              className={`flex items-center gap-1.5 text-[12px] transition-colors rounded-md px-2 py-0.5 ${
                reasoningEffort === 'off' 
                  ? 'text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  : reasoningEffort === 'low'
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                  : reasoningEffort === 'medium'
                  ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                  : 'bg-red-500/20 text-red-600 dark:text-red-400'
              }`}
            >
              <Sparkles size={13} />
              <span className="font-medium capitalize">{reasoningEffort}</span>
              <ChevronDown size={11} />
            </button>
          )}
          {/* Separator divider */}
          <div className="w-px h-4 bg-[rgb(var(--border))] mx-1" />
          {/* Context indicator */}
          <div className="flex items-center gap-1.5 min-w-0">
            <ContextIndicator usedTokens={usedTokens} maxTokens={maxTokens} />
          </div>
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
              const isCollapsed = collapsedProviders.has(providerName);
              return (
                <div key={providerName} className="mb-1">
                  {/* Provider header */}
                  <button
                    onClick={() => {
                      const newSet = new Set(collapsedProviders);
                      if (isCollapsed) newSet.delete(providerName);
                      else newSet.add(providerName);
                      setCollapsedProviders(newSet);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 mt-1 w-full hover:bg-black/[0.03] dark:hover:bg-white/[0.03] rounded-lg transition-colors"
                  >
                    <ProviderDot providerId={firstModel.providerId} providerName={providerName} />
                    <span className="text-[11px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider flex-1 text-left">{providerName}</span>
                    <ChevronDown size={12} className={`text-[rgb(var(--muted))] transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  </button>

                  {/* Models */}
                  {!isCollapsed && models.map(m => {
                    const ctx = formatCtx(m.contextLength);
                    const isSelected = selectedModelId === m.fullId;
                    const mId = m.fullId.slice(m.fullId.indexOf('/') + 1);
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
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {mInfo.capabilities?.image_input && <Eye size={13} className="text-sky-500" />}
                          {mInfo.capabilities?.audio_input && <Mic size={13} className="text-violet-500" />}
                          {mInfo.capabilities?.audio_output && <Volume2 size={13} className="text-purple-500" />}
                          {mInfo.capabilities?.image_output && <ImgOut size={13} className="text-pink-500" />}
                          {mInfo.capabilities?.video_output && <Video size={13} className="text-rose-500" />}
                          {mInfo.capabilities?.realtime && <Radio size={13} className="text-green-500" />}
                          {mInfo.capabilities?.deep_research && <BookOpen size={13} className="text-amber-500" />}
                          {mInfo.capabilities?.reasoning && <Brain size={13} className="text-blue-500" />}
                          {mInfo.capabilities?.embeddings && <FlaskConical size={13} className="text-teal-500" />}
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

      {/* Workflow menu */}
      {showWorkflowMenu && filteredWorkflows.length > 0 && (
        <div
          ref={workflowMenuRef}
          className="fixed z-50 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl shadow-2xl p-2 min-w-[200px] max-w-[300px]"
          style={{
            top: workflowMenuPos.top,
            left: workflowMenuPos.left,
            transform: 'translateY(calc(-100% - 8px))',
          }}
        >
          {filteredWorkflows.map(workflow => (
            <button
              key={workflow.id}
              onClick={() => handleWorkflowSelect(workflow)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            >
              <div className="text-sm font-medium text-[rgb(var(--text))]">/{workflow.slug}</div>
              <div className="text-xs text-[rgb(var(--muted))] truncate">{workflow.prompt}</div>
            </button>
          ))}
        </div>
      )}

      {/* Reasoning effort menu */}
      {showReasoningMenu && onReasoningEffortChange && (
        <div
          ref={reasoningMenuRef}
          className="fixed z-50 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl shadow-2xl p-2 min-w-[140px]"
          style={{
            top: reasoningMenuPos.top,
            left: reasoningMenuPos.left,
            transform: 'translateY(calc(-100% - 8px))',
          }}
        >
          {(['off', 'low', 'medium', 'high'] as const).map(effort => (
            <button
              key={effort}
              onClick={() => {
                onReasoningEffortChange(effort);
                setShowReasoningMenu(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                reasoningEffort === effort
                  ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${
                effort === 'off' ? 'bg-gray-400' :
                effort === 'low' ? 'bg-blue-500' :
                effort === 'medium' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} />
              <span className="text-sm capitalize text-[rgb(var(--text))]">{effort}</span>
              {reasoningEffort === effort && <Check size={13} className="ml-auto text-[rgb(var(--accent))]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
