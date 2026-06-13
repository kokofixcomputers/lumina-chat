import { useState, useRef, useCallback } from 'react';
import { AlertTriangle, Check, X, Code2, FolderOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { CodeSession } from '../utils/codeSessionDB';
import type { Message } from '../types';
import { useAppStore } from '../hooks/useAppStore';
import { universalFetch } from '../utils/tauriFetch';
import { isTauri } from '../utils/tauri';
import { resolveFormat } from './ProvidersPanel';
import ChatArea from './ChatArea';

// Tauri plugins — lazy-loaded, desktop only
let tauriFs: any = null;
let tauriDialog: any = null;

async function getFs() {
  if (!tauriFs) tauriFs = await import('@tauri-apps/plugin-fs');
  return tauriFs;
}
async function getDialog() {
  if (!tauriDialog) tauriDialog = await import('@tauri-apps/plugin-dialog');
  return tauriDialog;
}

async function executeShellCommand(command: string, cwd: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ stdout: string; stderr: string; code: number }>('plugin:shell|execute', {
    program: 'sh',
    args: ['-c', `cd "${cwd}" && ${command}`],
    options: {},
  });
}

// Tool definitions sent to the LLM
const CODE_TOOLS = [
  { name: 'read_file', description: 'Read the content of a file in the workspace.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or overwrite a file in the workspace.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Edit a file by replacing a specific string. Prefer this over write_file for existing files — use targeted replacements instead of rewriting the whole file. Fails if old_string is not found or not unique.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, old_string: { type: 'string', description: 'Exact string to find and replace. Keep it short but unique within the file.' }, new_string: { type: 'string', description: 'Replacement string' } }, required: ['path', 'old_string', 'new_string'] } },
  { name: 'delete_file', description: 'Delete a file or directory.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' } }, required: ['path'] } },
  { name: 'create_directory', description: 'Create a directory (and any missing parents).', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path relative to workspace root' } }, required: ['path'] } },
  { name: 'list_directory', description: 'List files and directories at a path.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path relative to workspace root (use "." for root)' } }, required: ['path'] } },
  { name: 'execute_command', description: 'Execute a shell command. Requires user approval before running.', input_schema: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute' }, working_dir: { type: 'string', description: 'Working directory relative to workspace root' } }, required: ['command'] } },
];

interface PendingApproval {
  command: string;
  workingDir: string;
  resolve: (approved: boolean) => void;
}

interface CodeModeProps {
  session: CodeSession | null;
  onUpdate: (session: CodeSession) => void;
  onNewSession: (workspace: string) => void;
  onOpenProviders?: () => void;
  onTogglePanel?: () => void;
}

export default function CodeMode({ session, onUpdate, onNewSession, onOpenProviders, onTogglePanel }: CodeModeProps) {
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const streamingContentRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const resolvePath = (workspace: string, relPath: string) => {
    const clean = relPath.replace(/^\/+/, '');
    const joined = clean ? `${workspace}/${clean}` : workspace;
    const normalized = joined.replace(/\/\.\.\//g, '/').replace(/\/\.\.$/, '');
    return normalized.startsWith(workspace) ? normalized : workspace;
  };

  const executeTool = async (
    name: string,
    input: Record<string, unknown>,
    workspace: string,
    requestApproval: (cmd: string, dir: string) => Promise<boolean>,
  ): Promise<{ result: string; diff?: Message['toolDiff'] }> => {
    const fs = await getFs();

    if (name === 'read_file') {
      try {
        const content = await fs.readTextFile(resolvePath(workspace, input.path as string));
        return { result: content, diff: { type: 'output', path: input.path as string, output: content } };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'write_file') {
      const fullPath = resolvePath(workspace, input.path as string);
      try {
        const parts = fullPath.split('/'); parts.pop();
        await fs.mkdir(parts.join('/'), { recursive: true });
        let before: string | undefined;
        try { before = await fs.readTextFile(fullPath); } catch {}
        await fs.writeTextFile(fullPath, input.content as string);
        return {
          result: `Written: ${input.path}`,
          diff: { type: 'write', path: input.path as string, before, after: input.content as string },
        };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'edit_file') {
      const fullPath = resolvePath(workspace, input.path as string);
      try {
        const before = await fs.readTextFile(fullPath);
        const old = input.old_string as string;
        if (!before.includes(old)) return { result: `Error: old_string not found in ${input.path}` };
        const after = before.replace(old, input.new_string as string);
        await fs.writeTextFile(fullPath, after);
        return {
          result: `Edited: ${input.path}`,
          diff: { type: 'edit', path: input.path as string, before: old, after: input.new_string as string },
        };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'delete_file') {
      try {
        const fullPath = resolvePath(workspace, input.path as string);
        let before: string | undefined;
        try { before = await fs.readTextFile(fullPath); } catch {}
        await fs.remove(fullPath);
        return {
          result: `Deleted: ${input.path}`,
          diff: { type: 'delete', path: input.path as string, before },
        };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'create_directory') {
      try {
        await fs.mkdir(resolvePath(workspace, input.path as string), { recursive: true });
        return { result: `Created: ${input.path}` };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'list_directory') {
      try {
        const entries = await fs.readDir(resolvePath(workspace, input.path as string));
        const listing = entries
          .sort((a: any, b: any) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
          .map((e: any) => `${e.isDirectory ? '📁' : '📄'} ${e.name}`)
          .join('\n');
        return { result: listing, diff: { type: 'output', path: input.path as string, output: listing } };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'execute_command') {
      const command = input.command as string;
      const workDir = resolvePath(workspace, (input.working_dir as string) || '.');
      const approved = await requestApproval(command, workDir);
      if (!approved) return { result: 'Command denied by user.' };
      try {
        const out = await executeShellCommand(command, workDir);
        const stdout = out.stdout?.trim() || '';
        const stderr = out.stderr?.trim() || '';
        let combined = stdout;
        if (stderr) combined += (combined ? '\n' : '') + stderr;
        const output = combined || `(exit ${out.code ?? 0})`;
        return { result: output, diff: { type: 'output', output, path: command } };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    return { result: `Unknown tool: ${name}` };
  };

  const runSession = useCallback(async (content: string, startingSession: CodeSession) => {
    const { provider, model } = store.getProviderAndModel(
      startingSession.modelId || store.settings.defaultProviderModelId
    );
    if (!provider) {
      alert('No provider configured. Please add a provider in Settings.');
      return;
    }

    const userMsg: Message = {
      id: uuidv4(), role: 'user', content: content.trim(), timestamp: Date.now(),
    };

    let currentSession: CodeSession = {
      ...startingSession,
      messages: [...startingSession.messages, userMsg],
      title: startingSession.messages.length === 0 ? content.slice(0, 50) : startingSession.title,
      updatedAt: Date.now(),
    };
    onUpdate(currentSession);
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const systemPrompt = `You are an expert software engineer. The user's workspace is at: ${startingSession.workspace}

All paths are relative to the workspace root. Run shell commands only when needed and they require user approval.

IMPORTANT — file editing rules:
- Always prefer edit_file over write_file when modifying existing files. Use edit_file for targeted replacements instead of rewriting entire files.
- Only use write_file when creating a new file or when the changes are so extensive that multiple edits would be less clear.
- When using edit_file, make the old_string as short as possible while still being unique in the file.
- Read a file before editing it if you are unsure of its current contents.`;

      const buildApiMessages = (messages: Message[], anthropic: boolean) => {
        const out: any[] = [];
        for (const m of messages) {
          if (m.role === 'user') {
            out.push({ role: 'user', content: m.content });
          } else if (m.role === 'assistant') {
            if (m.tool_calls?.length) {
              if (anthropic) {
                const blocks: any[] = [];
                if (m.content) blocks.push({ type: 'text', text: m.content });
                for (const tc of m.tool_calls) {
                  blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
                }
                out.push({ role: 'assistant', content: blocks });
              } else {
                out.push({ role: 'assistant', content: m.content || null, tool_calls: m.tool_calls });
              }
            } else {
              out.push({ role: 'assistant', content: m.content });
            }
          } else if (m.role === 'tool') {
            if (anthropic) {
              const last = out[out.length - 1];
              const block = { type: 'tool_result', tool_use_id: m.tool_call_id || '', content: m.content };
              if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
                last.content.push(block);
              } else {
                out.push({ role: 'user', content: [block] });
              }
            } else {
              out.push({ role: 'tool', tool_call_id: m.tool_call_id || '', content: m.content });
            }
          }
        }
        return out;
      };

      const activeApiFormat = resolveFormat(store.settings.apiFormats || [], provider.apiFormatId);
      const isAnthropic = activeApiFormat?.id === 'anthropic';
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const apiUrl = isAnthropic
        ? (baseUrl.includes('/messages') ? baseUrl : `${baseUrl}/messages`)
        : (baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`);
      const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isAnthropic) {
        apiHeaders['x-api-key'] = provider.apiKey;
        apiHeaders['anthropic-version'] = '2023-06-01';
      } else {
        apiHeaders['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      let continueLoop = true;
      while (continueLoop && !controller.signal.aborted) {
        const body: Record<string, unknown> = {
          model: model?.id || 'claude-opus-4-8',
          max_tokens: 8096,
          messages: buildApiMessages(currentSession.messages, isAnthropic),
        };
        if (isAnthropic) {
          body.system = systemPrompt;
          body.tools = CODE_TOOLS;
        } else {
          body.messages = [{ role: 'system', content: systemPrompt }, ...buildApiMessages(currentSession.messages, false)];
          body.tools = CODE_TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
        }
        const response = await universalFetch(apiUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let clean = `Request failed (${response.status})`;
          try { const p = JSON.parse(errText); clean = p?.error?.message || p?.message || clean; } catch {}
          throw new Error(clean);
        }

        const data = await response.json();

        let textContent = '';
        const toolCallRequests: Message['tool_calls'] = [];

        if (isAnthropic) {
          for (const b of (data.content || [])) {
            if (b.type === 'text') textContent += b.text;
            if (b.type === 'tool_use') {
              toolCallRequests!.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } });
            }
          }
        } else {
          const msg = data.choices?.[0]?.message;
          textContent = msg?.content || '';
          for (const tc of (msg?.tool_calls || [])) {
            toolCallRequests!.push({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } });
          }
        }

        const stopReason = isAnthropic ? data.stop_reason : data.choices?.[0]?.finish_reason;

        if (!toolCallRequests?.length) {
          // Final response — add assistant message
          const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: textContent, timestamp: Date.now() };
          currentSession = { ...currentSession, messages: [...currentSession.messages, assistantMsg], updatedAt: Date.now() };
          onUpdate(currentSession);
          continueLoop = false;
        } else {
          // Add assistant message with tool_calls
          const assistantMsg: Message = {
            id: uuidv4(), role: 'assistant', content: textContent,
            tool_calls: toolCallRequests, timestamp: Date.now(),
          };
          currentSession = { ...currentSession, messages: [...currentSession.messages, assistantMsg], updatedAt: Date.now() };
          onUpdate(currentSession);

          // Execute each tool call, ask approval for shell commands
          const requestApproval = (cmd: string, dir: string): Promise<boolean> =>
            new Promise(resolve => setPendingApproval({ command: cmd, workingDir: dir, resolve }));

          for (const tc of toolCallRequests!) {
            const toolInput = JSON.parse(tc.function.arguments);
            const { result, diff } = await executeTool(tc.function.name, toolInput, startingSession.workspace, requestApproval);
            setPendingApproval(null);

            const toolMsg: Message = {
              id: uuidv4(), role: 'tool', content: result,
              tool_call_id: tc.id, tool_name: tc.function.name,
              tool_status: result.startsWith('Error:') ? 'error' : 'success',
              toolDiff: diff,
              timestamp: Date.now(),
            };
            currentSession = { ...currentSession, messages: [...currentSession.messages, toolMsg], updatedAt: Date.now() };
            onUpdate(currentSession);
          }

          if (stopReason !== 'tool_use' && stopReason !== 'tool_calls') continueLoop = false;
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        const errMsg: Message = { id: uuidv4(), role: 'assistant', content: e?.message || String(e), timestamp: Date.now(), isError: true };
        onUpdate({ ...currentSession, messages: [...currentSession.messages, errMsg], updatedAt: Date.now() });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [isGenerating, store, onUpdate]);

  const sendMessage = useCallback((content: string, images: string[]) => {
    if (!session || !content.trim() || isGenerating) return;
    return runSession(content, session);
  }, [session, isGenerating, runSession]);

  const handleModelChange = (modelId: string) => {
    if (!session) return;
    onUpdate({ ...session, modelId, updatedAt: Date.now() });
  };

  const handleEditMessage = (msgId: string, newContent: string) => {
    if (!session) return;
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    const updated = session.messages.slice(0, idx + 1);
    updated[idx] = { ...updated[idx], content: newContent };
    onUpdate({ ...session, messages: updated, updatedAt: Date.now() });
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!session) return;
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    onUpdate({ ...session, messages: session.messages.slice(0, idx), updatedAt: Date.now() });
  };

  const handleRetry = () => {
    if (!session || isGenerating) return;
    const messages = session.messages;
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx === -1) return;
    let userMsgIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsgIdx = i; break; }
    }
    if (userMsgIdx === -1) return;
    const userMsg = messages[userMsgIdx];
    const trimmedSession = { ...session, messages: messages.slice(0, userMsgIdx), updatedAt: Date.now() };
    onUpdate(trimmedSession);
    runSession(userMsg.content, trimmedSession);
  };

  const handleContinue = (msgId: string) => {
    if (!session) return;
    const msg = session.messages.find(m => m.id === msgId);
    if (!msg || msg.role !== 'assistant') return;
    sendMessage(`Continue as if it were the same message. Continue from: "${msg.content.slice(-200)}"`, []);
  };

  const pickWorkspace = async () => {
    if (!isTauri) return;
    const dialog = await getDialog();
    const selected = await dialog.open({ directory: true, multiple: false, title: 'Choose Workspace' });
    if (selected && typeof selected === 'string') onNewSession(selected);
  };

  // Map CodeSession → Conversation shape ChatArea expects
  const fakeConversation = session ? {
    id: session.id,
    title: session.title || 'Code Session',
    messages: session.messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    modelId: session.modelId || store.settings.defaultProviderModelId,
  } as any : null;

  // Welcome screen when no session
  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-[rgb(var(--bg))]">
        <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--accent))] flex items-center justify-center shadow-lg">
          <Code2 size={28} className="text-[rgb(var(--accent-contrast))]" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-[rgb(var(--text))]">Start a Code Session</h2>
          <p className="text-sm text-[rgb(var(--muted))] max-w-sm">
            Choose a workspace folder. The AI can read, write, and edit files — and run commands with your approval.
          </p>
        </div>
        <button className="btn-primary gap-2" onClick={pickWorkspace}>
          <FolderOpen size={15} />
          Choose Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      <ChatArea
        conversation={fakeConversation}
        isGenerating={isGenerating}
        streamingContent=""
        streamingContentRef={streamingContentRef}
        allModels={store.allProviderModels}
        onSend={sendMessage}
        onModelChange={handleModelChange}
        defaultModelId={session.modelId || store.settings.defaultProviderModelId}
        onTogglePanel={onTogglePanel || (() => {})}
        onOpenProviders={onOpenProviders || (() => {})}
        onRetry={handleRetry}
        onStopGeneration={() => { abortRef.current?.abort(); setIsGenerating(false); }}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onContinue={handleContinue}
        prettifyModelNames={store.settings.prettifyModelNames}
        isCode
        codeWorkspace={session.workspace}
        onChangeWorkspace={pickWorkspace}
      />

      {/* Terminal approval overlay */}
      {pendingApproval && (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 z-20">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-50/95 dark:bg-amber-950/80 backdrop-blur-sm p-4 space-y-3 shadow-xl animate-slide-in-up">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[rgb(var(--text))]">Run terminal command?</p>
                <p className="text-[11px] text-[rgb(var(--muted))] mt-0.5 truncate" title={pendingApproval.workingDir}>
                  in {pendingApproval.workingDir}
                </p>
              </div>
            </div>
            <pre className="font-mono text-[12px] bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 overflow-x-auto text-[rgb(var(--text))] whitespace-pre-wrap">
              {pendingApproval.command}
            </pre>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center gap-1.5 py-1.5"
                onClick={() => { pendingApproval.resolve(true); setPendingApproval(null); }}>
                <Check size={13} /> Allow
              </button>
              <button className="btn-secondary flex-1 justify-center gap-1.5 py-1.5"
                onClick={() => { pendingApproval.resolve(false); setPendingApproval(null); }}>
                <X size={13} /> Deny
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
