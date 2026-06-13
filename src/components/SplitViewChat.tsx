import { useState, useRef, useEffect } from 'react';
import { X, GripVertical } from 'lucide-react';
import ChatArea from './ChatArea';
import type { Conversation } from '../types';

interface Model {
  fullId: string;
  name: string;
  providerName: string;
  providerId: string;
  supportsImages?: boolean;
  contextLength?: number;
}

interface SplitViewChatProps {
  leftConversation: Conversation | null;
  rightConversation: Conversation | null;
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
  onModeChange?: (mode: 'chat' | 'image' | 'code') => void;
  onAttachmentsChange?: (attachments: string[]) => void;
  onGenerateTitle?: () => void;
  onGenerateFollowUps?: () => void;
  homeMode?: 'chat' | 'image' | 'code';
  homeAttachments?: string[];
  prettifyModelNames?: boolean;
  workflows?: Array<{ id: string; slug: string; prompt: string }>;
  useResponsesApi?: boolean;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  onReasoningEffortChange?: (effort: 'off' | 'low' | 'medium' | 'high') => void;
  onVersionChange?: (msgId: string, versionIndex: number) => void;
  onTranscribeAudio?: (blob: Blob, mimeType: string) => Promise<string>;
  onOpenShare?: () => void;
  onForkConversation?: () => void;
  selectedFineTuningId?: string | null;
  onFineTuningChange?: (fineTuningId: string | null) => void;
  onCloseSplitView: () => void;
  onSwitchToRight: () => void;
}

export default function SplitViewChat({
  leftConversation,
  rightConversation,
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
  homeMode,
  homeAttachments,
  prettifyModelNames,
  workflows,
  useResponsesApi,
  reasoningEffort,
  onReasoningEffortChange,
  onVersionChange,
  onTranscribeAudio,
  onOpenShare,
  onForkConversation,
  selectedFineTuningId,
  onFineTuningChange,
  onCloseSplitView,
  onSwitchToRight,
}: SplitViewChatProps) {
  const [dividerPosition, setDividerPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;

      // Clamp between 20% and 80%
      const clampedPercentage = Math.max(20, Math.min(80, percentage));
      setDividerPosition(clampedPercentage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden bg-[rgb(var(--bg))]">
      {/* Close split view button */}
      <button
        onClick={onCloseSplitView}
        className="fixed top-4 right-4 z-50 btn-icon shadow-lg bg-[rgb(var(--panel))] border border-[rgb(var(--border))]"
        title="Close split view"
      >
        <X size={16} />
      </button>

      <div ref={containerRef} className="flex-1 flex min-w-0">
        {/* Left panel */}
        <div
          style={{ width: `${dividerPosition}%` }}
          className="min-w-0 border-r border-[rgb(var(--border))]"
        >
          <ChatArea
            conversation={leftConversation}
            isGenerating={isGenerating}
            streamingContent={streamingContent}
            streamingContentRef={streamingContentRef}
            allModels={allModels}
            onSend={onSend}
            onModelChange={onModelChange}
            defaultModelId={defaultModelId}
            onTogglePanel={onTogglePanel}
            onOpenProviders={onOpenProviders}
            onRetry={onRetry}
            onStopGeneration={onStopGeneration}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onContinue={onContinue}
            onModeChange={onModeChange}
            onAttachmentsChange={onAttachmentsChange}
            onGenerateTitle={onGenerateTitle}
            onGenerateFollowUps={onGenerateFollowUps}
            homeMode={homeMode}
            homeAttachments={homeAttachments}
            prettifyModelNames={prettifyModelNames}
            workflows={workflows}
            useResponsesApi={useResponsesApi}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={onReasoningEffortChange}
            onVersionChange={onVersionChange}
            onTranscribeAudio={onTranscribeAudio}
            onOpenShare={onOpenShare}
            onForkConversation={onForkConversation}
            selectedFineTuningId={selectedFineTuningId}
            onFineTuningChange={onFineTuningChange}
          />
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={handleMouseDown}
          className={`w-2 bg-[rgb(var(--border))] hover:bg-[rgb(var(--primary))] cursor-col-resize transition-colors flex items-center justify-center ${
            isDragging ? 'bg-[rgb(var(--primary))]' : ''
          }`}
        >
          <GripVertical size={12} className="text-[rgb(var(--muted))] opacity-50" />
        </div>

        {/* Right panel */}
        <div
          style={{ width: `${100 - dividerPosition}%` }}
          className="min-w-0"
        >
          <ChatArea
            conversation={rightConversation}
            isGenerating={false}
            streamingContent=""
            streamingContentRef={streamingContentRef}
            allModels={allModels}
            onSend={onSend}
            onModelChange={onModelChange}
            defaultModelId={defaultModelId}
            onTogglePanel={onTogglePanel}
            onOpenProviders={onOpenProviders}
            onRetry={onRetry}
            onStopGeneration={onStopGeneration}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onContinue={onContinue}
            onModeChange={onModeChange}
            onAttachmentsChange={onAttachmentsChange}
            onGenerateTitle={onGenerateTitle}
            onGenerateFollowUps={onGenerateFollowUps}
            homeMode={homeMode}
            homeAttachments={homeAttachments}
            prettifyModelNames={prettifyModelNames}
            workflows={workflows}
            useResponsesApi={useResponsesApi}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={onReasoningEffortChange}
            onVersionChange={onVersionChange}
            onTranscribeAudio={onTranscribeAudio}
            onOpenShare={onOpenShare}
            onForkConversation={onForkConversation}
            selectedFineTuningId={selectedFineTuningId}
            onFineTuningChange={onFineTuningChange}
          />
        </div>
      </div>
    </div>
  );
}
