import { useEffect, useRef, useState, memo } from 'react';
import { Settings, Bot, FolderOpen, ChevronDown, ChevronRight, BrainCircuit, Columns, GitBranch, GitCommit, ExternalLink, ListChecks, CheckSquare, Square, GitPullRequest, Loader2, Check, ListTodo, X } from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import PreviewSidebar from './PreviewSidebar';
import Modal from './Modal';
import { TAB_DRAG_TYPE } from './TabBar';

// Memoized bubble — only re-renders when its own message object changes
const MemoMessageBubble = memo(MessageBubble);

// ReasoningStreamingBlock — collapsible "thinking" trace, writes directly to the DOM like StreamingBubble
function ReasoningStreamingBlock({ streamingReasoningRef }: {
  streamingReasoningRef: React.MutableRefObject<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLParagraphElement>(null);
  const displayedRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const CHARS_PER_FRAME = 24;

  useEffect(() => {
    const trickle = () => {
      const target = streamingReasoningRef.current;
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
    <div className="glass animate-glow-pulse mb-1.5 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[12px] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <BrainCircuit size={13} />
        <span className="font-medium">Thinking…</span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse ml-0.5" />
      </button>
      {!collapsed && (
        <p ref={containerRef} className="px-2.5 pb-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-[rgb(var(--muted))]" />
      )}
    </div>
  );
}

// StreamingBubble writes directly to the DOM — zero React re-renders during streaming
function StreamingBubble({ streamingContentRef, streamingReasoningRef, modelDisplayName, modelId }: {
  streamingContentRef: React.MutableRefObject<string>;
  streamingReasoningRef?: React.MutableRefObject<string>;
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
        {streamingReasoningRef && <ReasoningStreamingBlock streamingReasoningRef={streamingReasoningRef} />}
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
  streamingReasoning?: string;
  streamingReasoningRef?: React.MutableRefObject<string>;
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
  onDropToSplit?: (convId: string, side: 'left' | 'right') => void;
  isCode?: boolean;
  codeWorkspace?: string;
  onChangeWorkspace?: () => void;
  gitStatus?: { branch: string; filesChanged: number; additions: number; deletions: number } | null;
  onOpenCommit?: () => void;
  onOpenRepo?: () => void;
  onParallelSend?: (content: string, images: string[], modelIds: string[]) => void;
  plan?: { text: string; completed: boolean }[];
  onCreatePR?: () => void;
  creatingPR?: boolean;
  activeTasks?: { id: string; label: string }[];
  branches?: string[];
  onSwitchBranch?: (branch: string) => void;
  onCreateBranch?: (name: string) => void;
  switchingBranch?: boolean;
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
  streamingReasoning,
  streamingReasoningRef,
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
  homeMode = 'chat',
  homeAttachments = [],
  prettifyModelNames = true,
  workflows = [],
  useResponsesApi = false,
  reasoningEffort = 'off',
  onReasoningEffortChange,
  onVersionChange,
  onTranscribeAudio,
  selectedFineTuningId = null,
  onFineTuningChange,
  onDropToSplit,
  isCode = false,
  codeWorkspace,
  onChangeWorkspace,
  gitStatus,
  onOpenCommit,
  onOpenRepo,
  onParallelSend,
  plan,
  onCreatePR,
  creatingPR,
  activeTasks,
  branches,
  onSwitchBranch,
  onCreateBranch,
  switchingBranch,
}: ChatAreaProps) {
  const [showCommitMenu, setShowCommitMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showTasksModal, setShowTasksModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const prevConvIdRef = useRef<string | null>(null);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null);

  const handleTabDragOver = (e: React.DragEvent) => {
    if (!onDropToSplit || !e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const rect = e.currentTarget.getBoundingClientRect();
    setDropSide(e.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
  };

  const handleTabDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropSide(null);
  };

  const handleTabDrop = (e: React.DragEvent) => {
    const convId = e.dataTransfer.getData(TAB_DRAG_TYPE);
    setDropSide(null);
    if (convId && onDropToSplit) {
      e.preventDefault();
      onDropToSplit(convId, dropSide ?? 'right');
    }
  };

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
    if (!streamingContent && !streamingReasoning) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(easeToBottom);
  }, [streamingContent, streamingReasoning]);

  const selectedModelId = conversation?.modelId || defaultModelId;
  const currentModel = allModels.find(m => m.fullId === selectedModelId);
  const modelDisplayName = currentModel?.name || selectedModelId.slice(selectedModelId.indexOf('/') + 1) || 'Unknown model';
  const modelId = selectedModelId.slice(selectedModelId.indexOf('/') + 1);

  // ── Home / empty state ──────────────────────────────
  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
        {/* Top bar */}
        <div className="glass flex items-center justify-end px-5 py-3 shrink-0 relative z-10">
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
              onOpenShare={onOpenShare}
              onForkConversation={onForkConversation}
              conversation={{ messages: [] }}
              selectedFineTuningId={selectedFineTuningId}
              onFineTuningChange={onFineTuningChange}
              onParallelSend={onParallelSend}
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
    <div className="flex-1 flex min-w-0 min-h-0 bg-[rgb(var(--bg))] animate-fade-in w-full">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
      {/* Header — code workspace bar only; regular chat has no header */}
      {isCode && (
        <div className="glass-inset flex items-center gap-2 px-4 py-2.5 shrink-0 relative z-10 rounded-none border-x-0 border-t-0">
          <FolderOpen size={14} className="text-[rgb(var(--muted))] shrink-0" />
          <span className="text-[12px] text-[rgb(var(--muted))] font-mono truncate flex-1" title={codeWorkspace}>
            {codeWorkspace}
          </span>
          {onChangeWorkspace && (
            <button className="btn-ghost text-[12px] gap-1.5 shrink-0 py-1" onClick={onChangeWorkspace}>
              <FolderOpen size={12} />
              Change
            </button>
          )}
          {gitStatus && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <button
                  className="text-[11px] text-[rgb(var(--muted))] font-mono flex items-center gap-1 hover:text-[rgb(var(--text))] transition-colors disabled:opacity-50"
                  title={`Branch: ${gitStatus.branch} — click to switch`}
                  disabled={!onSwitchBranch || switchingBranch}
                  onClick={() => setShowBranchMenu(v => !v)}
                >
                  {switchingBranch ? <Loader2 size={11} className="animate-spin" /> : <GitBranch size={11} />}
                  {gitStatus.branch}
                  {onSwitchBranch && <ChevronDown size={10} className={`transition-transform ${showBranchMenu ? 'rotate-180' : ''}`} />}
                </button>
                {showBranchMenu && onSwitchBranch && (
                  <div className="absolute top-full left-0 mt-1.5 w-56 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm shadow-xl overflow-hidden z-30">
                    <div className="max-h-48 overflow-y-auto">
                      {(branches || []).map(b => (
                        <button
                          key={b}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] font-mono truncate hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                          onClick={() => { onSwitchBranch(b); setShowBranchMenu(false); }}
                        >
                          {b === gitStatus.branch ? <Check size={12} className="text-[rgb(var(--accent))] shrink-0" /> : <span className="w-3 shrink-0" />}
                          <span className="truncate">{b}</span>
                        </button>
                      ))}
                    </div>
                    {onCreateBranch && (
                      <div className="flex items-center gap-1.5 p-2 border-t border-[rgb(var(--border))]">
                        <input
                          autoFocus
                          className="input text-[12px] py-1 px-2 flex-1 min-w-0"
                          placeholder="new-branch-name"
                          value={newBranchName}
                          onChange={e => setNewBranchName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newBranchName.trim()) {
                              onCreateBranch(newBranchName.trim());
                              setNewBranchName('');
                              setShowBranchMenu(false);
                            }
                          }}
                        />
                        <button
                          className="btn-primary text-[11px] py-1 px-2 shrink-0 disabled:opacity-50"
                          disabled={!newBranchName.trim()}
                          onClick={() => {
                            onCreateBranch(newBranchName.trim());
                            setNewBranchName('');
                            setShowBranchMenu(false);
                          }}
                        >
                          New
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {onOpenRepo && (
                <button className="btn-icon w-6 h-6" onClick={onOpenRepo} title="Open repo in browser">
                  <ExternalLink size={12} />
                </button>
              )}
              {gitStatus.filesChanged > 0 && (
                <>
                  <span className="text-[11px] font-mono text-green-500">+{gitStatus.additions}</span>
                  <span className="text-[11px] font-mono text-red-500">-{gitStatus.deletions}</span>
                  {creatingPR ? (
                    <div className="btn-secondary text-[11px] py-1 px-2.5 gap-1.5 opacity-80 cursor-default">
                      <Loader2 size={11} className="animate-spin" />
                      Creating PR…
                    </div>
                  ) : (
                    <div className="relative flex">
                      <button
                        className="btn-secondary text-[11px] py-1 pl-2.5 pr-2 gap-1 rounded-r-none border-r border-[rgb(var(--border))]"
                        onClick={onOpenCommit}
                      >
                        <GitCommit size={11} />
                        Commit & Push
                      </button>
                      <button
                        className="btn-secondary text-[11px] py-1 px-1.5 rounded-l-none"
                        onClick={() => setShowCommitMenu(v => !v)}
                        title="Other actions"
                      >
                        <ChevronDown size={11} className={`transition-transform ${showCommitMenu ? 'rotate-180' : ''}`} />
                      </button>
                      {showCommitMenu && (
                        <div className="absolute top-full right-0 mt-1.5 w-48 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm shadow-xl overflow-hidden z-30">
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                            disabled={!onCreatePR}
                            onClick={() => { onCreatePR?.(); setShowCommitMenu(false); }}
                          >
                            <GitPullRequest size={12} className="shrink-0" />
                            Create PR
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <button
            className={`text-[11px] py-1 px-2.5 gap-1.5 rounded-lg flex items-center shrink-0 transition-colors ${
              (activeTasks?.length ?? 0) > 0
                ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]'
                : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'
            }`}
            onClick={() => setShowTasksModal(true)}
            title="Active tasks"
          >
            <ListTodo size={12} />
            {activeTasks?.length ?? 0} task{(activeTasks?.length ?? 0) === 1 ? '' : 's'}
          </button>
          <button className="btn-icon" onClick={onTogglePanel}><Settings size={15} /></button>
        </div>
      )}

      {/* Active tasks modal */}
      <Modal
        open={showTasksModal}
        onClose={() => setShowTasksModal(false)}
        panelClassName="glass-panel-strong rounded-3xl shadow-2xl max-w-sm w-full max-h-[70vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgb(var(--border))] shrink-0">
          <ListTodo size={15} className="text-[rgb(var(--accent))] shrink-0" />
          <h3 className="text-sm font-semibold flex-1">
            Active task{(activeTasks?.length ?? 0) === 1 ? '' : 's'} ({activeTasks?.length ?? 0})
          </h3>
          <button className="btn-icon w-7 h-7" onClick={() => setShowTasksModal(false)}><X size={15} /></button>
        </div>
        <div className="overflow-y-auto p-3 flex-1 min-h-0 space-y-1">
          {(activeTasks?.length ?? 0) === 0 ? (
            <p className="text-sm text-[rgb(var(--muted))] text-center py-8">Nothing running right now.</p>
          ) : (
            activeTasks!.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
                <Loader2 size={14} className="animate-spin text-[rgb(var(--accent))] shrink-0" />
                <span className="text-[13px] text-[rgb(var(--text))] truncate">{t.label}</span>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Messages */}
      <div
        className="flex-1 relative min-h-0"
        onDragOver={handleTabDragOver}
        onDragLeave={handleTabDragLeave}
        onDrop={handleTabDrop}
      >
      <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden py-6">
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
              streamingReasoningRef={streamingReasoning ? streamingReasoningRef : undefined}
              modelDisplayName={modelDisplayName}
              modelId={modelId}
            />
          )}

          {/* Reasoning-only (no reply text yet) */}
          {isGenerating && !streamingContent && streamingReasoning && streamingReasoningRef && (
            <div className="flex gap-3 px-4 sm:px-8 py-2 sm:max-w-4xl mx-auto w-full">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-black dark:from-gray-300 dark:to-white flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={13} className="text-white dark:text-black" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <ReasoningStreamingBlock streamingReasoningRef={streamingReasoningRef} />
              </div>
            </div>
          )}

          {/* Thinking */}
          {isGenerating && !streamingContent && !streamingReasoning && (
            <div className="flex gap-3 px-4 sm:px-8 py-2 sm:max-w-4xl mx-auto w-full">
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

      {/* Drop zone — drag a browser tab here to open it in a split pane */}
      {dropSide && (
        <div className="absolute inset-0 z-30 pointer-events-none flex animate-fade-in">
          <div className={`h-full w-1/2 flex items-center justify-center transition-colors ${dropSide === 'left' ? 'bg-[rgb(var(--accent)/0.12)] border-2 border-[rgb(var(--accent))]' : ''}`}>
            {dropSide === 'left' && (
              <div className="glass-panel-strong rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-xl">
                <Columns size={15} className="text-[rgb(var(--accent))]" />
                <span className="text-[13px] font-medium">Split left</span>
              </div>
            )}
          </div>
          <div className={`h-full w-1/2 flex items-center justify-center transition-colors ${dropSide === 'right' ? 'bg-[rgb(var(--accent)/0.12)] border-2 border-[rgb(var(--accent))]' : ''}`}>
            {dropSide === 'right' && (
              <div className="glass-panel-strong rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-xl">
                <Columns size={15} className="text-[rgb(var(--accent))] scale-x-[-1]" />
                <span className="text-[13px] font-medium">Split right</span>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Plan checklist — collapsible, sits just above the input */}
      {isCode && !!plan?.length && (
        <div className="px-4 pt-2 shrink-0">
          <div className="glass-inset rounded-2xl border border-[rgb(var(--border))] overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
              onClick={() => setPlanCollapsed(v => !v)}
            >
              <ListChecks size={13} className="text-[rgb(var(--muted))] shrink-0" />
              <span className="text-[12px] font-medium text-[rgb(var(--text))] flex-1">
                Plan — {plan.filter(p => p.completed).length}/{plan.length} done
              </span>
              <ChevronDown size={13} className={`text-[rgb(var(--muted))] shrink-0 transition-transform ${planCollapsed ? '-rotate-90' : ''}`} />
            </button>
            {!planCollapsed && (
              <div className="px-3 pb-2.5 space-y-1 max-h-40 overflow-y-auto">
                {plan.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12.5px]">
                    {item.completed
                      ? <CheckSquare size={13} className="text-green-500 mt-0.5 shrink-0" />
                      : <Square size={13} className="text-[rgb(var(--muted))] mt-0.5 shrink-0" />}
                    <span className={item.completed ? 'line-through text-[rgb(var(--muted))]' : 'text-[rgb(var(--text))]'}>{item.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
        onRetry={isCode ? undefined : onRetry}
        onGenerateTitle={isCode ? undefined : onGenerateTitle}
        onGenerateFollowUps={isCode ? undefined : onGenerateFollowUps}
        mode={isCode ? 'chat' : (conversation.mode || 'chat')}
        onModeChange={isCode ? undefined : onModeChange}
        attachments={isCode ? [] : (conversation.attachments || [])}
        onAttachmentsChange={isCode ? undefined : onAttachmentsChange}
        prettifyModelNames={prettifyModelNames}
        workflows={isCode ? [] : workflows}
        useResponsesApi={isCode ? false : useResponsesApi}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={isCode ? undefined : onReasoningEffortChange}
        onOpenShare={isCode ? undefined : onOpenShare}
        onForkConversation={isCode ? undefined : onForkConversation}
        conversation={conversation}
        selectedFineTuningId={isCode ? null : selectedFineTuningId}
        onFineTuningChange={isCode ? undefined : onFineTuningChange}
        onParallelSend={isCode ? undefined : onParallelSend}
      />
      </div>
      <PreviewSidebar />
    </div>
  );
}
