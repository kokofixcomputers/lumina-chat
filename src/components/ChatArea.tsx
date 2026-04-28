import { useEffect, useRef, useState, memo } from 'react';
import { Settings, Bot } from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import BuildModeFS from './BuildModeFS';
import PreviewSidebar from './PreviewSidebar';

// Memoized bubble — only re-renders when its own message object changes
const MemoMessageBubble = memo(MessageBubble);

// StreamingBubble writes directly to the DOM — zero React re-renders during streaming
function StreamingBubble({ streamingContentRef, modelDisplayName, modelId }: {
  streamingContentRef: React.MutableRefObject<string>;
  modelDisplayName: string;
  modelId: string;
}) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const displayedRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const CHARS_PER_FRAME = 24;

  useEffect(() => {
    const trickle = () => {
      const target = streamingContentRef.current;
      const cur = displayedRef.current;
      if (cur.length < target.length) {
        const next = target.slice(0, cur.length + CHARS_PER_FRAME);
        displayedRef.current = next;
        if (containerRef.current) containerRef.current.textContent = next;
      }
      rafRef.current = requestAnimationFrame(trickle);
    };
    rafRef.current = requestAnimationFrame(trickle);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex gap-3 px-8 py-2 max-w-4xl mx-auto w-full">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={13} className="text-white dark:text-black" />
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <p ref={containerRef} className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words" />
        <span className="inline-block w-2 h-2 rounded-full bg-current align-middle ml-0.5 animate-pulse" />
      </div>
    </div>
  );
}
import type { Conversation } from '../types';

interface Model {
  fullId: string;
  name: string;
  providerName: string;
  providerId: string;
  supportsImages?: boolean;
  contextLength?: number;
}

interface ChatAreaProps {
  conversation: Conversation | null;
  isGenerating: boolean;
  streamingContent: string;
  streamingContentRef: React.MutableRefObject<string>;
  allModels: Model[];
  onSend: (content: string, images: string[]) => void;
  onModelChange: (modelId: string) => void;
  defaultModelId: string;
  onTogglePanel: () => void;
  onOpenProviders: () => void;
  onRetry?: () => void;
  onStopGeneration?: () => void;
  onEditMessage?: (msgId: string, newContent: string) => void;
  onDeleteMessage?: (msgId: string) => void;
  onContinue?: (msgId: string) => void;
  onModeChange?: (mode: 'chat' | 'image') => void;
  onAttachmentsChange?: (attachments: string[]) => void;
  onGenerateTitle?: () => void;
  onGenerateFollowUps?: () => void;
  homeMode?: 'chat' | 'image';
  homeAttachments?: string[];
  prettifyModelNames?: boolean;
  workflows?: Array<{ id: string; slug: string; prompt: string }>;
  useResponsesApi?: boolean;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  onReasoningEffortChange?: (effort: 'off' | 'low' | 'medium' | 'high') => void;
  onVersionChange?: (msgId: string, versionIndex: number) => void;
  onTranscribeAudio?: (blob: Blob, mimeType: string) => Promise<string>;
  onBuildModeChange?: (on: boolean) => void;
  onOpenBuildFS?: () => void;
  onOpenShare?: () => void;
  onForkConversation?: () => void;
  homeBuildMode?: boolean;
  selectedFineTuningId?: string | null;
  onFineTuningChange?: (fineTuningId: string | null) => void;
}

const QUICK_ACTIONS = [
  { label: '✨ Create Agent', },
  { label: '👥 Create Group', },
  { label: '✍️ Write', },
  { label: '🍌 Nano Banana 2', },
];

export default function ChatArea({
  conversation,
  isGenerating,
  streamingContent,
  streamingContentRef,
  allModels,
  onSend,
  onModelChange,
  defaultModelId,
  onTogglePanel,
  onOpenProviders,
  onRetry,
  onStopGeneration,
  onEditMessage,
  onDeleteMessage,
  onContinue,
  onModeChange,
  onAttachmentsChange,
  onGenerateTitle,
  onGenerateFollowUps,
  onOpenShare,
  onForkConversation,
  onOpenBuildFS,
  homeMode = 'chat',
  homeAttachments = [],
  prettifyModelNames = true,
  workflows = [],
  useResponsesApi = false,
  reasoningEffort = 'off',
  onReasoningEffortChange,
  onVersionChange,
  onTranscribeAudio,
  onBuildModeChange,
  homeBuildMode = false,
  selectedFineTuningId = null,
  onFineTuningChange,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const prevConvIdRef = useRef<string | null>(null);
  const [showFS, setShowFS] = useState(false);

  // Eased scroll — 12% of remaining per frame, feels smooth during streaming
  const easeToBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= 1) { scrollRafRef.current = null; return; }
    const step = Math.min(80, Math.max(2, remaining * 0.12));
    el.scrollTop += step;
    scrollRafRef.current = requestAnimationFrame(easeToBottom);
  };

  // Conversation switch → instant snap
  useEffect(() => {
    const convId = conversation?.id ?? null;
    if (convId !== prevConvIdRef.current) {
      prevConvIdRef.current = convId;
      if (scrollRafRef.current !== null) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [conversation?.id]);

  // New message appended → fast ease
  useEffect(() => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(easeToBottom);
  }, [conversation?.messages.length]);

  // Streaming → keep ease loop alive
  useEffect(() => {
    if (!streamingContent) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(easeToBottom);
  }, [streamingContent]);

  const selectedModelId = conversation?.modelId || defaultModelId;
  const currentModel = allModels.find(m => m.fullId === selectedModelId);
  const modelDisplayName = currentModel?.name || selectedModelId.slice(selectedModelId.indexOf('/') + 1) || 'Unknown model';
  const modelId = selectedModelId.slice(selectedModelId.indexOf('/') + 1);

  // ── Home / empty state ──────────────────────────────
  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[rgb(var(--bg))] animate-fade-in">
        {/* Top bar */}
        <div className="flex items-center justify-end px-5 py-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] shrink-0">
          <button className="btn-icon" onClick={onTogglePanel}><Settings size={16} /></button>
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col items-center justify-center pb-20 select-none">
          <h1 className="text-[26px] font-semibold mb-8 text-[rgb(var(--text))]">
            Ready to begin? ✨
          </h1>

          {/* Input that directly sends */}
          <div className="w-full max-w-2xl">
            <ChatInput
              onSend={onSend}
              isGenerating={isGenerating}
              onStopGeneration={onStopGeneration}
              modelName={modelDisplayName}
              allModels={allModels}
              selectedModelId={selectedModelId}
              onModelChange={onModelChange}
              onOpenProviders={onOpenProviders}
              onRetry={onRetry}
              onGenerateTitle={onGenerateTitle}
              onGenerateFollowUps={onGenerateFollowUps}
              mode={homeMode}
              onModeChange={onModeChange}
              attachments={homeAttachments}
              onAttachmentsChange={onAttachmentsChange}
              prettifyModelNames={prettifyModelNames}
              workflows={workflows}
              useResponsesApi={useResponsesApi}
              reasoningEffort={reasoningEffort}
              onReasoningEffortChange={onReasoningEffortChange}
              onTranscribeAudio={onTranscribeAudio}
              buildMode={homeBuildMode}
              onBuildModeChange={onBuildModeChange}
              onOpenBuildFS={onOpenBuildFS}
              onOpenShare={onOpenShare}
              onForkConversation={onForkConversation}
              conversation={{ messages: [] }}
              selectedFineTuningId={selectedFineTuningId}
              onFineTuningChange={onFineTuningChange}
            />
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                className="btn-secondary text-[12.5px] py-1.5"
                onClick={() => onSend(a.label.replace(/^[^\w]+/, '').trim(), [])}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Chat view ───────────────────────────────────────
  return (
    <div className="flex-1 flex min-h-0 bg-[rgb(var(--bg))] animate-fade-in">
      <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center px-5 py-2.5 border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center shrink-0">
            <Bot size={13} className="text-white dark:text-black" />
          </div>
          <span className="text-[13px] font-medium truncate text-[rgb(var(--text))]">{conversation.title}</span>
          <span className="text-[rgb(var(--muted))] text-[12px] shrink-0">· {modelDisplayName}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {conversation.buildMode && (
            <button
              onClick={() => setShowFS(s => !s)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${showFS ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'text-[rgb(var(--muted))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}`}
              title="Browse virtual filesystem"
            >
              <span>⚒</span> Files
            </button>
          )}
          <button className="btn-icon" onClick={onTogglePanel}><Settings size={15} /></button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden py-6">
        <div className="overflow-x-hidden">
          {conversation.messages.map((msg, idx) => (
            <MemoMessageBubble
              key={msg.id}
              message={msg}
              modelName={msg.role === 'assistant' ? modelDisplayName : undefined}
              modelId={msg.role === 'assistant' ? modelId : undefined}
              onRetry={msg.role === 'assistant' && idx === conversation.messages.length - 1 ? onRetry : undefined}
              onEdit={msg.role === 'user' && onEditMessage ? (newContent) => onEditMessage(msg.id, newContent) : undefined}
              onDelete={onDeleteMessage ? () => onDeleteMessage(msg.id) : undefined}
              onContinue={msg.role === 'assistant' && onContinue ? () => onContinue(msg.id) : undefined}
              onFollowUpClick={onSend ? (followUp) => onSend(followUp, []) : undefined}
              onVersionChange={onVersionChange ? (versionIndex) => onVersionChange(msg.id, versionIndex) : undefined}
            />
          ))}

          {/* Streaming */}
          {isGenerating && streamingContent && (
            <StreamingBubble
              streamingContentRef={streamingContentRef}
              modelDisplayName={modelDisplayName}
              modelId={modelId}
            />
          )}

          {/* Thinking */}
          {isGenerating && !streamingContent && (
            <div className="flex gap-3 px-8 py-2 max-w-4xl mx-auto w-full">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center shrink-0">
                <Bot size={13} className="text-white dark:text-black" />
              </div>
              <div className="flex items-center gap-1 pt-2">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--muted))] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        isGenerating={isGenerating}
        onStopGeneration={onStopGeneration}
        modelName={modelDisplayName}
        allModels={allModels}
        selectedModelId={selectedModelId}
        onModelChange={onModelChange}
        onOpenProviders={onOpenProviders}
        onRetry={onRetry}
        onGenerateTitle={onGenerateTitle}
        onGenerateFollowUps={onGenerateFollowUps}
        mode={conversation.mode || 'chat'}
        onModeChange={onModeChange}
        attachments={conversation.attachments || []}
        onAttachmentsChange={onAttachmentsChange}
        prettifyModelNames={prettifyModelNames}
        workflows={workflows}
        useResponsesApi={useResponsesApi}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={onReasoningEffortChange}
        buildMode={conversation.buildMode}
        onBuildModeChange={onBuildModeChange ? (on) => onBuildModeChange(on) : undefined}
        onOpenBuildFS={() => setShowFS(s => !s)}
        onOpenShare={onOpenShare}
        onForkConversation={onForkConversation}
        conversation={conversation}
        selectedFineTuningId={selectedFineTuningId}
        onFineTuningChange={onFineTuningChange}
      />
      </div>
      {showFS && conversation.id && (
        <BuildModeFS convId={conversation.id} onClose={() => setShowFS(false)} />
      )}
      <PreviewSidebar />
    </div>
  );
}
