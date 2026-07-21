import { useRef, useEffect, useState, memo } from 'react';
import { Bot, X } from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { getModelInfo } from '../utils/models';
import { streamingRegistry } from '../utils/streamingRegistry';
import type { Conversation } from '../types';

const MemoMessageBubble = memo(MessageBubble);

interface Model {
  fullId: string;
  name: string;
  providerName: string;
  providerId: string;
  supportsImages?: boolean;
  contextLength?: number;
}

function StreamingText({ convId }: { convId: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Show any content already in the registry when mounting
    const initial = streamingRegistry.get(convId);
    if (initial && containerRef.current) containerRef.current.textContent = initial;

    // Update DOM directly on every token — no trickle, no RAF lag
    const unsub = streamingRegistry.subscribe(convId, content => {
      if (containerRef.current && content) containerRef.current.textContent = content;
    });
    return unsub;
  }, [convId]);

  return <span ref={containerRef} className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words" />;
}

interface ParallelCompareViewProps {
  conversations: (Conversation | null)[];
  parallelConvIds: string[];
  allModels: Model[];
  isGenerating: boolean;
  onParallelSend: (content: string, images: string[], modelIds: string[]) => void;
  onClose: () => void;
  onStopGeneration?: () => void;
  onOpenProviders?: () => void;
  prettifyModelNames?: boolean;
  workflows?: Array<{ id: string; slug: string; prompt: string }>;
  onTranscribeAudio?: (blob: Blob, mimeType: string) => Promise<string>;
  parallelModelIds: string[];
  onParallelModelIdsChange: (ids: string[]) => void;
  defaultModelId: string;
}

function ConversationColumn({
  conversation,
  convId,
  modelId,
  allModels,
  isGenerating,
  prettifyModelNames,
}: {
  conversation: Conversation | null;
  convId: string;
  modelId: string;
  allModels: Model[];
  isGenerating: boolean;
  prettifyModelNames?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const easeToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= 1) { rafRef.current = null; return; }
    const step = Math.min(80, Math.max(2, remaining * 0.12));
    el.scrollTop += step;
    rafRef.current = requestAnimationFrame(easeToBottom);
  };

  // Subscribe to streaming events for this specific conversation
  useEffect(() => {
    const unsub = streamingRegistry.subscribe(convId, content => {
      // Only set false when content is empty AND the conversation already has the final message,
      // so there's no flash between bubble clearing and message rendering.
      if (content.length > 0) {
        setIsStreaming(true);
      } else {
        // Small delay so the message has time to appear before we hide the bubble
        setTimeout(() => setIsStreaming(false), 100);
      }
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(easeToBottom);
    });
    return unsub;
  }, [convId]);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(easeToBottom);
  }, [conversation?.messages.length]);

  const model = allModels.find(m => m.fullId === modelId);
  const shortModelId = modelId.slice(modelId.indexOf('/') + 1);
  const modelInfo = getModelInfo(shortModelId);
  const displayName = prettifyModelNames ? modelInfo.displayName : shortModelId;
  const ModelIcon = typeof modelInfo.icon === 'string' ? null : modelInfo.icon;

  return (
    <div className="flex flex-col min-h-0 flex-1 border-r border-[rgb(var(--border))] last:border-r-0 min-w-0">
      {/* Column header */}
      <div className="glass-inset flex items-center gap-2 px-3 py-2 shrink-0 relative z-10 rounded-none border-x-0 border-t-0">
        {typeof modelInfo.icon === 'string' ? (
          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-[rgb(var(--border))]">
            <img src={modelInfo.icon} alt="" className="w-full h-full object-cover" />
          </div>
        ) : ModelIcon ? (
          <div className="w-5 h-5 rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] flex items-center justify-center shrink-0">
            <ModelIcon size={10} />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full bg-[rgb(var(--muted))]/20 flex items-center justify-center shrink-0">
            <Bot size={10} className="text-[rgb(var(--muted))]" />
          </div>
        )}
        <span className="text-[12px] font-medium text-[rgb(var(--text))] truncate">{displayName}</span>
        <span className="text-[11px] text-[rgb(var(--muted))] truncate">{model?.providerName}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        {conversation?.messages.map((msg) => (
          <MemoMessageBubble
            key={msg.id}
            message={msg}
            modelName={msg.role === 'assistant' ? displayName : undefined}
            modelId={msg.role === 'assistant' ? shortModelId : undefined}
          />
        ))}

        {/* Per-column streaming bubble */}
        {isStreaming && (
          <div className="flex gap-3 px-4 py-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={11} className="text-white dark:text-black" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <StreamingText convId={convId} />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current align-middle ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Thinking dots — generating but no stream yet for this conv */}
        {isGenerating && !isStreaming && !conversation?.messages.find(m => m.role === 'assistant') && (
          <div className="flex gap-2 px-4 py-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center shrink-0">
              <Bot size={11} className="text-white dark:text-black" />
            </div>
            <div className="flex items-center gap-1 pt-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--muted))] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParallelCompareView({
  conversations,
  parallelConvIds,
  allModels,
  isGenerating,
  onParallelSend,
  onClose,
  onStopGeneration,
  onOpenProviders,
  prettifyModelNames,
  workflows,
  onTranscribeAudio,
  parallelModelIds,
  onParallelModelIdsChange,
  defaultModelId,
}: ParallelCompareViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[rgb(var(--bg))]">
      {/* Top bar */}
      <div className="glass-inset flex items-center gap-3 px-4 py-2.5 shrink-0 relative z-10 rounded-none border-x-0 border-t-0">
        <span className="text-[13px] font-semibold text-[rgb(var(--text))]">Model Comparison</span>
        <span className="text-[11px] text-[rgb(var(--muted))] bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))] px-2 py-0.5 rounded-full font-medium">
          {parallelModelIds.length} models
        </span>
        <button
          onClick={onClose}
          className="ml-auto btn-icon"
          title="Exit comparison"
        >
          <X size={15} />
        </button>
      </div>

      {/* Column layout */}
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        {parallelModelIds.map((modelId, i) => (
          <ConversationColumn
            key={modelId}
            conversation={conversations[i] || null}
            convId={parallelConvIds[i] ?? modelId}
            modelId={modelId}
            allModels={allModels}
            isGenerating={isGenerating}
            prettifyModelNames={prettifyModelNames}
          />
        ))}
      </div>

      {/* Shared input */}
      <div className="shrink-0 border-t border-[rgb(var(--border))]">
        <ChatInput
          onSend={(content, images) => onParallelSend(content, images, parallelModelIds)}
          isGenerating={isGenerating}
          onStopGeneration={onStopGeneration}
          modelName=""
          allModels={allModels}
          selectedModelId={defaultModelId}
          onModelChange={() => {}}
          onOpenProviders={onOpenProviders}
          prettifyModelNames={prettifyModelNames}
          workflows={workflows}
          onTranscribeAudio={onTranscribeAudio}
          parallelModelIds={parallelModelIds}
          onParallelModelIdsChange={onParallelModelIdsChange}
          parallelMode
        />
      </div>
    </div>
  );
}
