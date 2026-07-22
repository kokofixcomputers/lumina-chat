import { useState, useRef, useCallback, useEffect } from 'react';
import { AlertTriangle, Check, X, Code2, FolderOpen, GitCommit, FileText, Loader2, Sparkles } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { CodeSession } from '../utils/codeSessionDB';
import type { Message } from '../types';
import { useAppStore } from '../hooks/useAppStore';
import { universalFetch } from '../utils/tauriFetch';
import { isTauri, openUrl } from '../utils/tauri';
import { resolveFormat, getByPath } from './ProvidersPanel';
import ChatArea from './ChatArea';
import Modal from './Modal';

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

// macOS GUI apps (launched from Finder/Dock, not a terminal) inherit a minimal PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) that omits Homebrew and other common install locations.
// Without this, `git`, `node`, `npm`, etc. installed via Homebrew silently fail as
// "command not found" and callers just see an empty/failed result with no clear cause.
const PATH_FIX = 'export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.local/bin:$HOME/bin:$PATH";';

async function executeShellCommand(command: string, cwd: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ stdout: string; stderr: string; code: number }>('plugin:shell|execute', {
    program: 'sh',
    args: ['-c', `${PATH_FIX} cd "${cwd}" && ${command}`],
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

interface GitFileChange {
  path: string;
  status: string;      // porcelain status code, e.g. 'M', 'A', 'D', '??', 'R'
  additions: number;
  deletions: number;
  untracked: boolean;
}

interface GitStatus {
  branch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  files: GitFileChange[];
  remoteUrl: string | null;
}

// Normalize a git remote URL (SSH or HTTPS) into a browsable https:// web URL.
function remoteToWebUrl(remote: string): string | null {
  const trimmed = remote.trim();
  if (!trimmed) return null;
  const sshShorthand = trimmed.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshShorthand) return `https://${sshShorthand[1]}/${sshShorthand[2].replace(/\.git$/, '')}`;
  const sshUrl = trimmed.match(/^ssh:\/\/git@([^/]+)\/(.+?)(\.git)?$/);
  if (sshUrl) return `https://${sshUrl[1]}/${sshUrl[2].replace(/\.git$/, '')}`;
  if (/^https?:\/\//.test(trimmed)) return trimmed.replace(/\.git$/, '');
  return null;
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
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [showCommitBox, setShowCommitBox] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [committing, setCommitting] = useState(false);
  const [diffView, setDiffView] = useState<{ path: string; content: string; loading: boolean } | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const streamingContentRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  const checkGitStatus = useCallback(async (workspace: string) => {
    if (!isTauri) { setGitStatus(null); return; }
    try {
      const check = await executeShellCommand('git rev-parse --is-inside-work-tree', workspace);
      if (check.code !== 0 || check.stdout.trim() !== 'true') {
        if (check.stderr && !/not a git repository/i.test(check.stderr)) {
          console.warn('[git status] git rev-parse failed:', check.stderr || check.stdout);
        }
        setGitStatus(null);
        return;
      }

      const branchRes = await executeShellCommand('git rev-parse --abbrev-ref HEAD', workspace);
      const branch = branchRes.stdout.trim() || 'HEAD';

      const remoteRes = await executeShellCommand('git remote get-url origin', workspace);
      const remoteUrl = remoteRes.code === 0 ? remoteToWebUrl(remoteRes.stdout) : null;

      const statusRes = await executeShellCommand('git status --porcelain', workspace);
      const statusLines = statusRes.stdout.split('\n').filter(Boolean);

      const files: GitFileChange[] = [];
      if (statusLines.length > 0) {
        const parseNumstat = (output: string): Map<string, { add: number; del: number }> => {
          const map = new Map<string, { add: number; del: number }>();
          for (const line of output.split('\n')) {
            if (!line.trim()) continue;
            const [a, d, ...rest] = line.split('\t');
            const path = rest.join('\t');
            if (!path) continue;
            map.set(path, { add: a === '-' ? 0 : parseInt(a, 10) || 0, del: d === '-' ? 0 : parseInt(d, 10) || 0 });
          }
          return map;
        };

        const [unstagedRes, stagedRes] = await Promise.all([
          executeShellCommand('git diff --numstat', workspace),
          executeShellCommand('git diff --cached --numstat', workspace),
        ]);
        const unstagedMap = parseNumstat(unstagedRes.stdout);
        const stagedMap = parseNumstat(stagedRes.stdout);

        for (const line of statusLines.slice(0, 100)) {
          const statusCode = line.slice(0, 2).trim();
          const rawPath = line.slice(3).trim();
          const path = rawPath.includes(' -> ') ? rawPath.split(' -> ')[1] : rawPath;
          const untracked = statusCode === '??';

          if (untracked) {
            const wc = await executeShellCommand(`wc -l < "${path}" 2>/dev/null || echo 0`, workspace);
            files.push({ path, status: statusCode, additions: parseInt(wc.stdout.trim(), 10) || 0, deletions: 0, untracked: true });
          } else {
            const u = unstagedMap.get(path);
            const s = stagedMap.get(path);
            files.push({
              path,
              status: statusCode,
              additions: (u?.add || 0) + (s?.add || 0),
              deletions: (u?.del || 0) + (s?.del || 0),
              untracked: false,
            });
          }
        }
      }

      const additions = files.reduce((sum, f) => sum + f.additions, 0);
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

      setGitStatus({ branch, filesChanged: files.length, additions, deletions, files, remoteUrl });
    } catch (e) {
      console.warn('[git status] check failed:', e);
      setGitStatus(null);
    }
  }, []);

  useEffect(() => {
    if (session?.workspace) checkGitStatus(session.workspace);
    else setGitStatus(null);
  }, [session?.workspace, checkGitStatus]);

  const handleCommit = async () => {
    if (!session || !commitMessage.trim() || committing) return;
    setCommitting(true);
    try {
      await executeShellCommand('git add -A', session.workspace);
      // Single-quote each message part so the shell treats it as a literal string — no $()/`` expansion.
      // Separate -m flags for summary and description matches `git commit`'s own convention
      // for a short subject line followed by a body paragraph.
      const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
      const msgArgs = [`-m ${quote(commitMessage.trim())}`];
      if (commitDescription.trim()) msgArgs.push(`-m ${quote(commitDescription.trim())}`);
      const commitRes = await executeShellCommand(`git commit ${msgArgs.join(' ')}`, session.workspace);
      if (commitRes.code !== 0) {
        alert(`Commit failed: ${commitRes.stderr || commitRes.stdout}`);
        return;
      }

      // Push — fall back to setting the upstream if this branch has never been pushed before.
      let pushRes = await executeShellCommand('git push', session.workspace);
      if (pushRes.code !== 0 && /set-upstream|no upstream branch|has no upstream/i.test(pushRes.stderr)) {
        pushRes = await executeShellCommand('git push -u origin HEAD', session.workspace);
      }
      if (pushRes.code !== 0) {
        alert(`Committed, but push failed: ${pushRes.stderr || pushRes.stdout}`);
      }

      setShowCommitBox(false);
      setCommitMessage('');
      setCommitDescription('');
      await checkGitStatus(session.workspace);
    } catch (e: any) {
      alert(`Commit failed: ${e?.message || e}`);
    } finally {
      setCommitting(false);
    }
  };

  const handleOpenRepo = () => {
    if (gitStatus?.remoteUrl) openUrl(gitStatus.remoteUrl);
  };

  const generateCommitMessage = async () => {
    if (!session || generatingMsg) return;
    const { provider, model } = store.getProviderAndModel(session.modelId || store.settings.defaultProviderModelId);
    if (!provider) { alert('No provider configured. Please add a provider in Settings.'); return; }

    setGeneratingMsg(true);
    try {
      // Stage everything first so the diff reflects exactly what "Commit & Push" will commit.
      await executeShellCommand('git add -A', session.workspace);
      const diffRes = await executeShellCommand('git diff --cached', session.workspace);
      let diffText = diffRes.stdout.trim();
      if (!diffText) { alert('No changes to describe.'); return; }
      const MAX_DIFF_CHARS = 12000;
      if (diffText.length > MAX_DIFF_CHARS) diffText = diffText.slice(0, MAX_DIFF_CHARS) + '\n… (diff truncated)';

      const fmt = resolveFormat(store.settings.apiFormats || [], provider.apiFormatId);
      const base = provider.baseUrl.replace(/\/$/, '');
      const chatPath = fmt.chatPath || '/chat/completions';
      const url = provider.directUrl ? provider.baseUrl
        : provider.baseUrl.includes(chatPath) ? provider.baseUrl
        : `${base}${chatPath}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (provider.apiKey) headers[fmt.authHeader] = `${fmt.authPrefix}${provider.apiKey}`;
      try { Object.assign(headers, JSON.parse(fmt.extraHeaders)); } catch { /* ignore */ }

      const messages = [{
        role: 'user',
        content: `Analyze this git diff and write a commit message for it. Reply in EXACTLY this format and nothing else:
SUMMARY: <one line, imperative mood (e.g. "Fix", "Add", "Remove"), under 72 characters, no trailing period, no quotes>
BODY: <a short 1-4 sentence description of what changed and why, plain text, no markdown. Leave empty after "BODY:" if the summary alone is clear enough.>

Diff:
${diffText}`,
      }];

      const response = await universalFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: model?.id, messages, stream: false }),
      });

      if (!response.ok) { alert('Failed to generate commit message.'); return; }
      const data = await response.json();
      const text = fmt.responseTextPath ? getByPath(data, fmt.responseTextPath) : data.choices?.[0]?.message?.content;
      const raw = (text || '').trim();
      const summaryMatch = raw.match(/SUMMARY:\s*(.+)/i);
      const bodyMatch = raw.match(/BODY:\s*([\s\S]*)/i);
      const summary = (summaryMatch?.[1] || raw.split('\n')[0]).trim().replace(/^["'`]+|["'`]+$/g, '');
      const body = (bodyMatch?.[1] || '').trim();
      if (summary) setCommitMessage(summary);
      setCommitDescription(body);
    } catch (e: any) {
      alert(`Failed to generate commit message: ${e?.message || e}`);
    } finally {
      setGeneratingMsg(false);
    }
  };

  const openFileDiff = async (file: GitFileChange) => {
    if (!session) return;
    setDiffView({ path: file.path, content: '', loading: true });
    try {
      // `git diff` doesn't cover untracked files — diff against /dev/null to show the
      // whole file as additions instead.
      const cmd = file.untracked
        ? `git diff --no-index -- /dev/null "${file.path}" 2>/dev/null; true`
        : `git diff HEAD -- "${file.path}"`;
      const res = await executeShellCommand(cmd, session.workspace);
      setDiffView({ path: file.path, content: res.stdout || '(no textual diff — binary file?)', loading: false });
    } catch (e: any) {
      setDiffView({ path: file.path, content: `Error loading diff: ${e?.message || e}`, loading: false });
    }
  };

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
      const isAnthropic = activeApiFormat?.id === 'anthropic' || activeApiFormat?.id === 'anthropic-subscription';
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
        const modelId = model?.id || 'claude-opus-4-8';
        const isOSeries = !isAnthropic && /^(o\d|gpt-5)/.test(modelId);
        const body: Record<string, unknown> = {
          model: modelId,
          messages: buildApiMessages(currentSession.messages, isAnthropic),
          [isAnthropic || !isOSeries ? 'max_tokens' : 'max_completion_tokens']: 8096,
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
      checkGitStatus(startingSession.workspace);
    }
  }, [isGenerating, store, onUpdate, checkGitStatus]);

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
        gitStatus={gitStatus}
        onOpenCommit={() => setShowCommitBox(true)}
        onOpenRepo={gitStatus?.remoteUrl ? handleOpenRepo : undefined}
      />

      {/* Commit box */}
      {showCommitBox && !pendingApproval && (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 z-20">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm p-4 space-y-3 shadow-xl animate-slide-in-up">
            <div className="flex items-center gap-2">
              <GitCommit size={15} className="text-[rgb(var(--accent))] shrink-0" />
              <p className="text-[13px] font-medium text-[rgb(var(--text))]">
                Commit {gitStatus?.filesChanged ?? 0} file{gitStatus?.filesChanged === 1 ? '' : 's'}
              </p>
            </div>
            {!!gitStatus?.files.length && (
              <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-1.5">
                {gitStatus.files.map(f => (
                  <button
                    key={f.path}
                    onClick={() => openFileDiff(f)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
                    title="View diff"
                  >
                    <FileText size={12} className="text-[rgb(var(--muted))] shrink-0" />
                    <span className="text-[12px] font-mono truncate flex-1">{f.path}</span>
                    {f.additions > 0 && <span className="text-[11px] font-mono text-green-500 shrink-0">+{f.additions}</span>}
                    {f.deletions > 0 && <span className="text-[11px] font-mono text-red-500 shrink-0">-{f.deletions}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                autoFocus
                className="input text-sm w-full pr-9"
                placeholder="Describe your changes..."
                value={commitMessage}
                onChange={e => setCommitMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !committing) handleCommit();
                  if (e.key === 'Escape') setShowCommitBox(false);
                }}
              />
              <button
                onClick={generateCommitMessage}
                disabled={generatingMsg}
                title="Auto-generate commit message and description from the diff"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-icon w-6 h-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingMsg ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              </button>
            </div>
            <textarea
              className="input text-sm w-full resize-none"
              rows={3}
              placeholder="Description (optional)..."
              value={commitDescription}
              onChange={e => setCommitDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setShowCommitBox(false); }}
            />
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1 justify-center gap-1.5 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!commitMessage.trim() || committing}
                onClick={handleCommit}
              >
                {committing ? 'Committing & pushing…' : (<><Check size={13} /> Commit & Push</>)}
              </button>
              <button className="btn-secondary flex-1 justify-center gap-1.5 py-1.5" onClick={() => setShowCommitBox(false)}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* File diff viewer */}
      <Modal
        open={!!diffView}
        onClose={() => setDiffView(null)}
        panelClassName="glass-panel-strong rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgb(var(--border))] shrink-0">
          <FileText size={14} className="text-[rgb(var(--muted))] shrink-0" />
          <h3 className="text-sm font-mono font-medium truncate flex-1">{diffView?.path}</h3>
          <button className="btn-icon w-7 h-7" onClick={() => setDiffView(null)}><X size={15} /></button>
        </div>
        <div className="overflow-auto p-4 flex-1 min-h-0">
          {diffView?.loading ? (
            <div className="flex items-center gap-2 text-[rgb(var(--muted))] text-sm py-8 justify-center">
              <Loader2 size={15} className="animate-spin" /> Loading diff…
            </div>
          ) : (
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
              {(diffView?.content || '').split('\n').map((line, i) => {
                let cls = 'text-[rgb(var(--text))]';
                if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-[rgb(var(--muted))]';
                else if (line.startsWith('+')) cls = 'text-green-600 dark:text-green-400 bg-green-500/10';
                else if (line.startsWith('-')) cls = 'text-red-600 dark:text-red-400 bg-red-500/10';
                else if (line.startsWith('@@')) cls = 'text-[rgb(var(--accent))]';
                return <div key={i} className={cls}>{line || ' '}</div>;
              })}
            </pre>
          )}
        </div>
      </Modal>
    </div>
  );
}
