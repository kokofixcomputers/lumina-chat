import { useEffect, useRef } from 'react';
import { Settings, Bot } from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
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
  onModeChange,
  onAttachmentsChange,
  onGenerateTitle,
  onGenerateFollowUps,
  homeMode = 'chat',
  homeAttachments = [],
  prettifyModelNames = true,
  workflows = [],
  useResponsesApi = false,
  reasoningEffort = 'off',
  onReasoningEffortChange,
  onVersionChange,
  onTranscribeAudio,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages, streamingContent]);

  const selectedModelId = conversation?.modelId || defaultModelId;
  const currentModel = allModels.find(m => m.fullId === selectedModelId);
  const modelDisplayName = currentModel?.name || selectedModelId.split('/')[1] || 'Unknown model';
  const modelId = selectedModelId.split('/')[1];

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
    <div className="flex-1 flex flex-col min-h-0 bg-[rgb(var(--bg))] animate-fade-in">
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
          <button className="btn-icon" onClick={onTogglePanel}><Settings size={15} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6">
        <div className="overflow-x-hidden">
          {conversation.messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              modelName={msg.role === 'assistant' ? modelDisplayName : undefined}
              modelId={msg.role === 'assistant' ? modelId : undefined}
              onRetry={msg.role === 'assistant' && idx === conversation.messages.length - 1 ? onRetry : undefined}
              onEdit={msg.role === 'user' && onEditMessage ? (newContent) => onEditMessage(msg.id, newContent) : undefined}
              onDelete={onDeleteMessage ? () => onDeleteMessage(msg.id) : undefined}
              onFollowUpClick={onSend ? (followUp) => onSend(followUp, []) : undefined}
              onVersionChange={onVersionChange ? (versionIndex) => onVersionChange(msg.id, versionIndex) : undefined}
            />
          ))}

          {/* Streaming */}
          {isGenerating && streamingContent && (
            <MessageBubble
              message={{ id: 'streaming', role: 'assistant', content: streamingContent, timestamp: Date.now() }}
              modelName={modelDisplayName}
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
      />
    </div>
  );
}
