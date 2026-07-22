import { useState, useRef, useCallback, useEffect } from 'react';
import { AlertTriangle, Check, X, Code2, FolderOpen, FolderPlus, GitCommit, FileText, Loader2, Sparkles, Github, ListChecks, Play, Trash2, RotateCcw, Copy, Eye, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { CodeSession, PlanItem } from '../utils/codeSessionDB';
import type { Message } from '../types';
import { useAppStore } from '../hooks/useAppStore';
import { universalFetch } from '../utils/tauriFetch';
import { isTauri, openUrl } from '../utils/tauri';
import { authorizeGitHub } from '../integrations/githubOAuth';
import { notify, isNotificationPermissionGranted, requestNotificationPermission, wasNotificationBannerDismissed, dismissNotificationBanner } from '../utils/notify';
import { resolveFormat, getByPath } from './ProvidersPanel';
import ChatArea from './ChatArea';
import Modal from './Modal';
import { DiffLines, computeDiff, type DiffLine } from './MessageBubble';

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

// GUI apps launched from a dock/launcher (not a terminal) inherit a minimal PATH that omits
// Homebrew/Linuxbrew and other common install locations. Without this, `git`, `node`, `pnpm`,
// etc. silently fail as "command not found" and callers just see an empty/failed result with
// no clear cause. Unix-only — Windows child processes already inherit the full user PATH from
// the registry regardless of how the app was launched, so this never applies there.
const PATH_FIX = 'export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.local/bin:$HOME/bin:$PATH";';

function detectPlatform(): 'windows' | 'macos' | 'linux' {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'windows';
  if (ua.includes('Mac OS') || ua.includes('Macintosh')) return 'macos';
  return 'linux';
}
const PLATFORM = detectPlatform();

// Discard-stderr-and-don't-fail-the-pipeline suffix, in the target shell's own syntax
// (sh/bash on Unix, PowerShell on Windows) — used for commands that are allowed to fail.
const SUPPRESS_STDERR = PLATFORM === 'windows' ? '2>$null' : '2>/dev/null; true';

// The hardcoded fallback above only covers common install locations — it misses anything the
// user only set up in their shell rc file (nvm, pnpm's own bin dir, volta, custom PATH exports,
// etc.). To pick those up too (macOS/Linux only), resolve the user's *actual* PATH once by
// asking their login shell ($SHELL — bash/zsh/fish/whatever) to source its rc file (`-i` =
// interactive) and report $PATH, then cache it and prepend it ahead of PATH_FIX for every
// command afterward. Runs nested inside the already-permitted `sh -c` call, so no extra Tauri
// shell capability is needed for spawning the user's shell directly.
// The same call also reports the shell's own name (bash/zsh/fish/…), cached alongside the PATH,
// so the AI can be told which shell syntax to write commands in.
let cachedUserPath: string | null = null;
let cachedShellName: string | null = null;
const PATH_MARKER = '__LUMINA_PATH__';
const SHELL_MARKER = '__LUMINA_SHELL__';

async function resolvePlatformInfo(): Promise<{ path: string; shellName: string }> {
  if (PLATFORM === 'windows') return { path: '', shellName: 'powershell' };
  if (cachedUserPath !== null && cachedShellName !== null) return { path: cachedUserPath, shellName: cachedShellName };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const res = await invoke<{ stdout: string; stderr: string; code: number }>('plugin:shell|execute', {
      program: 'sh',
      // ${PATH} must be braced — a bare $PATH immediately followed by the marker text gets
      // parsed by the shell as one long variable name ("PATH__LUMINA_PATH__"), which doesn't
      // exist and silently expands to nothing, making PATH resolution appear to return empty.
      args: ['-c', `SH="\${SHELL:-/bin/bash}"; echo ${SHELL_MARKER}$(basename "$SH")${SHELL_MARKER}; "$SH" -ilc 'echo ${PATH_MARKER}\${PATH}${PATH_MARKER}' 2>/dev/null`],
      options: {},
    });
    const pathMatch = res.stdout.match(new RegExp(`${PATH_MARKER}(.*?)${PATH_MARKER}`));
    const shellMatch = res.stdout.match(new RegExp(`${SHELL_MARKER}(.*?)${SHELL_MARKER}`));
    cachedUserPath = pathMatch ? pathMatch[1].trim() : '';
    cachedShellName = shellMatch?.[1]?.trim() || 'bash';
  } catch {
    cachedUserPath = '';
    cachedShellName = 'bash';
  }
  return { path: cachedUserPath, shellName: cachedShellName };
}

async function executeShellCommand(command: string, cwd: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  if (PLATFORM === 'windows') {
    // PowerShell (not cmd.exe) — it has built-in aliases for the Unix-style commands
    // (ls, cp, mv, rm, cat, pwd, …) that AI-generated commands tend to assume.
    const safeCwd = cwd.replace(/'/g, "''");
    return invoke<{ stdout: string; stderr: string; code: number }>('plugin:shell|execute', {
      program: 'powershell',
      args: ['-NoProfile', '-Command', `Set-Location -LiteralPath '${safeCwd}'; ${command}`],
      options: {},
    });
  }

  const { path: userPath } = await resolvePlatformInfo();
  const pathExport = userPath ? `export PATH="${userPath}:$PATH"; ${PATH_FIX}` : PATH_FIX;
  return invoke<{ stdout: string; stderr: string; code: number }>('plugin:shell|execute', {
    program: 'sh',
    args: ['-c', `${pathExport} cd "${cwd}" && ${command}`],
    options: {},
  });
}

// Tool definitions sent to the LLM
const WORKSPACE_PARAM = { type: 'string', description: 'Absolute path of which workspace to use — must be one of the workspace paths listed in your instructions. Omit to use the primary workspace.' };
const CODE_TOOLS = [
  { name: 'read_file', description: 'Read the content of a file in the workspace.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, workspace: WORKSPACE_PARAM }, required: ['path'] } },
  { name: 'write_file', description: 'Create or overwrite a file in the workspace.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, content: { type: 'string', description: 'Content to write' }, workspace: WORKSPACE_PARAM }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Edit a file by replacing a specific string. Prefer this over write_file for existing files — use targeted replacements instead of rewriting the whole file. Fails if old_string is not found or not unique.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, old_string: { type: 'string', description: 'Exact string to find and replace. Keep it short but unique within the file.' }, new_string: { type: 'string', description: 'Replacement string' }, workspace: WORKSPACE_PARAM }, required: ['path', 'old_string', 'new_string'] } },
  { name: 'delete_file', description: 'Delete a file or directory.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace root' }, workspace: WORKSPACE_PARAM }, required: ['path'] } },
  { name: 'create_directory', description: 'Create a directory (and any missing parents).', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path relative to workspace root' }, workspace: WORKSPACE_PARAM }, required: ['path'] } },
  { name: 'list_directory', description: 'List files and directories at a path.', input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path relative to workspace root (use "." for root)' }, workspace: WORKSPACE_PARAM }, required: ['path'] } },
  { name: 'execute_command', description: 'Execute a shell command. Requires user approval before running.', input_schema: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute' }, working_dir: { type: 'string', description: 'Working directory relative to workspace root' }, workspace: WORKSPACE_PARAM }, required: ['command'] } },
  { name: 'create_workflow', description: 'Save a reusable workflow — a named sequence of shell commands — that appears in the Workflows menu so the user can run it later with one click, without going through you again. Use this when the user asks you to set up a repeatable task, e.g. "create a workflow to build my app".', input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Short name, e.g. "Build App"' }, description: { type: 'string', description: 'Optional one-line description of what this workflow does' }, commands: { type: 'array', items: { type: 'string' }, description: 'Shell commands to run in order, each from the workspace root. Stops at the first command that fails.' } }, required: ['name', 'commands'] } },
  { name: 'create_plan', description: 'Create or replace the task plan shown to the user as a checklist just above the input box. Calling this again replaces the whole plan, so include every item (not just new ones) if you want to add more steps later.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' }, description: 'Ordered list of plan step descriptions' } }, required: ['items'] } },
  { name: 'check_plan_item', description: 'Mark a plan checklist item done or not done, by its 0-based index in the current plan.', input_schema: { type: 'object', properties: { index: { type: 'number', description: '0-based index of the plan item' }, completed: { type: 'boolean', description: 'true to mark done, false to mark not done (defaults to true)' } }, required: ['index'] } },
];

interface PendingApproval {
  command: string;
  workingDir: string;
  resolve: (approved: boolean) => void;
}

// Commands the user chose "Always Allow" for — persisted across sessions and restarts.
const ALWAYS_ALLOW_KEY = 'lumina_code_always_allowed_commands';
function getAlwaysAllowedCommands(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ALWAYS_ALLOW_KEY) || '[]')); } catch { return new Set(); }
}
function addAlwaysAllowedCommand(cmd: string) {
  const set = getAlwaysAllowedCommands();
  set.add(cmd);
  try { localStorage.setItem(ALWAYS_ALLOW_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

// AI-defined workflows — a named sequence of shell commands the user can re-run with one
// click. Scoped per-workspace (not per chat session) so they stick around across sessions
// on the same project.
interface Workflow {
  id: string;
  name: string;
  description?: string;
  commands: string[];
  createdAt: number;
}
function workflowsKey(workspace: string): string {
  return `lumina_code_workflows_${workspace}`;
}
function getWorkflows(workspace: string): Workflow[] {
  try { return JSON.parse(localStorage.getItem(workflowsKey(workspace)) || '[]'); } catch { return []; }
}
function saveWorkflow(workspace: string, workflow: Workflow) {
  const list = getWorkflows(workspace);
  list.push(workflow);
  try { localStorage.setItem(workflowsKey(workspace), JSON.stringify(list)); } catch { /* ignore */ }
}
function deleteWorkflowById(workspace: string, id: string) {
  const list = getWorkflows(workspace).filter(w => w.id !== id);
  try { localStorage.setItem(workflowsKey(workspace), JSON.stringify(list)); } catch { /* ignore */ }
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

// Single-quote a shell argument so it's treated as a literal string — no $()/`` expansion.
function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
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
  // undefined = not checked yet, null = checked and confirmed no repo, GitStatus = repo found
  const [gitStatus, setGitStatus] = useState<GitStatus | null | undefined>(undefined);
  const [showCommitBox, setShowCommitBox] = useState(false);
  // Paths excluded from this commit — untracked from the commit box, not from disk/git;
  // the file's actual changes stay untouched, it's just left unstaged this round.
  const [excludedFromCommit, setExcludedFromCommit] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [committing, setCommitting] = useState(false);
  const [diffView, setDiffView] = useState<{ path: string; lines: DiffLine[]; loading: boolean; error?: string } | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [showCreateRepoBox, setShowCreateRepoBox] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [createRepoError, setCreateRepoError] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showWorkflowsMenu, setShowWorkflowsMenu] = useState(false);
  const [showWorkspacesMenu, setShowWorkspacesMenu] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [requestingNotifPerm, setRequestingNotifPerm] = useState(false);

  // Ask once, the first time Code Mode is used, whether to enable desktop notifications
  // (command-approval / task-finished alerts) — not every time a session is opened.
  useEffect(() => {
    if (!isTauri || wasNotificationBannerDismissed()) return;
    isNotificationPermissionGranted().then(granted => { if (!granted) setShowNotifBanner(true); });
  }, []);

  const handleAllowNotifications = async () => {
    setRequestingNotifPerm(true);
    try {
      await requestNotificationPermission();
    } finally {
      setRequestingNotifPerm(false);
      dismissNotificationBanner();
      setShowNotifBanner(false);
    }
  };

  const handleDismissNotifBanner = () => {
    dismissNotificationBanner();
    setShowNotifBanner(false);
  };
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [expandedWorkflowIds, setExpandedWorkflowIds] = useState<string[]>([]);
  const toggleExpand = (id: string) => { setExpandedWorkflowIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };
  const [workflowResult, setWorkflowResult] = useState<{ name: string; steps: { command: string; code: number; output: string }[] } | null>(null);
  const streamingContentRef = useRef('');
  const [liveText, setLiveText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  // "Allow all for this session" — in-memory only, resets when switching to a different code session.
  const allowAllSessionRef = useRef(false);
  useEffect(() => { allowAllSessionRef.current = false; }, [session?.id]);

  useEffect(() => {
    setWorkflows(session?.workspace ? getWorkflows(session.workspace) : []);
  }, [session?.workspace]);

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
            // Count lines in JS (via the fs plugin) instead of shelling out to `wc -l` —
            // that's a Unix-only tool and this needs to work on Windows too.
            let lineCount = 0;
            try {
              const fs = await getFs();
              const content = await fs.readTextFile(`${workspace}/${path}`);
              lineCount = content ? content.split('\n').length : 0;
            } catch { /* binary or unreadable — leave at 0 */ }
            files.push({ path, status: statusCode, additions: lineCount, deletions: 0, untracked: true });
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

      // .gitignore only hides untracked files from `git status` — a file that was tracked
      // before it was added to .gitignore (e.g. a stray .env) still shows up as modified.
      // Filter those out here too, so they never appear in the commit list or get staged.
      let visibleFiles = files;
      if (files.length > 0) {
        const quotedPaths = files.map(f => `"${f.path.replace(/"/g, '\\"')}"`).join(' ');
        const ignoreCheck = await executeShellCommand(`git check-ignore ${quotedPaths} ${SUPPRESS_STDERR}`, workspace);
        const ignoredSet = new Set(ignoreCheck.stdout.split('\n').map(l => l.trim()).filter(Boolean));
        if (ignoredSet.size > 0) visibleFiles = files.filter(f => !ignoredSet.has(f.path));
      }

      const additions = visibleFiles.reduce((sum, f) => sum + f.additions, 0);
      const deletions = visibleFiles.reduce((sum, f) => sum + f.deletions, 0);

      setGitStatus({ branch, filesChanged: visibleFiles.length, additions, deletions, files: visibleFiles, remoteUrl });
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
      // Stage exactly the files shown in the commit box (minus any the user excluded) — never
      // `git add -A`, which would also re-stage any already-tracked-but-gitignored file (e.g. a
      // stray .env) that checkGitStatus deliberately filtered out of view.
      const excludedPaths = (gitStatus?.files || [])
        .filter(f => excludedFromCommit.includes(f.path))
        .map(f => quote(f.path)).join(' ');
      // Unstage excluded files in case an earlier attempt in this same commit box already
      // staged them — this only touches the index, never the file's actual on-disk content.
      if (excludedPaths) await executeShellCommand(`git reset HEAD -- ${excludedPaths}`, session.workspace);
      const stagePaths = (gitStatus?.files || [])
        .filter(f => !excludedFromCommit.includes(f.path))
        .map(f => quote(f.path)).join(' ');
      if (stagePaths) await executeShellCommand(`git add -- ${stagePaths}`, session.workspace);
      // Separate -m flags for summary and description matches `git commit`'s own convention
      // for a short subject line followed by a body paragraph.
      const msgArgs = [`-m ${quote(commitMessage.trim())}`];
      if (commitDescription.trim()) msgArgs.push(`-m ${quote(commitDescription.trim())}`);
      msgArgs.push(`-m ${quote('Co-authored-by: Lumina Code by kokodev <lumina-code-by-kokodev@users.noreply.github.com>')}`);
      const commitRes = await executeShellCommand(`git commit ${msgArgs.join(' ')}`, session.workspace);
      if (commitRes.code !== 0) {
        alert(`Commit failed: ${commitRes.stderr || commitRes.stdout}`);
        return;
      }

      // Push — fall back to setting the upstream if this branch has never been pushed before.
      const pushWithUpstreamFallback = async () => {
        let res = await executeShellCommand('git push', session.workspace);
        if (res.code !== 0 && /set-upstream|no upstream branch|has no upstream/i.test(res.stderr)) {
          res = await executeShellCommand('git push -u origin HEAD', session.workspace);
        }
        return res;
      };

      let pushRes = await pushWithUpstreamFallback();

      // If push failed for lack of local git credentials (no SSH key / credential helper
      // configured), fall back to the saved GitHub PAT/OAuth token — same technique the
      // "Create GitHub Repo" flow uses — by embedding it into the remote URL and retrying.
      const isAuthFailure = /authentication failed|could not read username|could not read password|terminal prompts disabled|invalid username or (password|token)|permission denied \(publickey\)|fatal: unable to access/i.test(pushRes.stderr);
      if (pushRes.code !== 0 && isAuthFailure) {
        const token = store.settings.integrations?.github?.patToken;
        const remoteRes = await executeShellCommand('git remote get-url origin', session.workspace);
        const remote = remoteRes.stdout.trim();
        if (token && remoteRes.code === 0 && /^https:\/\/github\.com\//.test(remote)) {
          const authedUrl = remote.replace('https://', `https://${token}@`);
          await executeShellCommand(`git remote set-url origin "${authedUrl}"`, session.workspace);
          pushRes = await pushWithUpstreamFallback();
        }
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

  const openCreateRepoBox = () => {
    if (!session) return;
    const base = session.workspace.replace(/\/+$/, '').split('/').pop() || 'my-repo';
    setNewRepoName(base.replace(/[^a-zA-Z0-9._-]/g, '-'));
    setNewRepoPrivate(true);
    setCreateRepoError('');
    setShowCreateRepoBox(true);
  };

  const handleCreateGitHubRepo = async () => {
    if (!session || creatingRepo) return;
    const name = newRepoName.trim();
    if (!name) { setCreateRepoError('Enter a repository name'); return; }

    setCreatingRepo(true);
    setCreateRepoError('');
    try {
      let token = store.settings.integrations?.github?.patToken;
      let username = store.settings.integrations?.github?.username;

      if (!token) {
        const auth = await authorizeGitHub();
        token = auth.token;
        username = auth.username;
        store.updateSettings({
          integrations: {
            ...store.settings.integrations,
            github: { configured: true, patToken: token, username },
          },
        });
      }

      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, private: newRepoPrivate }),
      });
      const repoData = await createRes.json();
      if (!createRes.ok) throw new Error(repoData?.message || `Failed to create repo (${createRes.status})`);

      const cloneUrl: string = repoData.clone_url;
      // Embed the token in the remote URL so `git push` keeps working even without
      // any local git credential helper configured.
      const authedUrl = cloneUrl.replace('https://', `https://${token}@`);

      const isRepo = await executeShellCommand('git rev-parse --is-inside-work-tree', session.workspace);
      if (isRepo.code !== 0 || isRepo.stdout.trim() !== 'true') {
        const initRes = await executeShellCommand('git init', session.workspace);
        if (initRes.code !== 0) throw new Error(`git init failed: ${initRes.stderr || initRes.stdout}`);
      }

      const branchRes = await executeShellCommand('git checkout -B main', session.workspace);
      if (branchRes.code !== 0) throw new Error(`git checkout -B main failed: ${branchRes.stderr || branchRes.stdout}`);

      await executeShellCommand('git add -A', session.workspace);
      const statusRes = await executeShellCommand('git status --porcelain', session.workspace);
      const coAuthorTrailer = `-m 'Co-authored-by: Lumina Code by kokodev <lumina-code-by-kokodev@users.noreply.github.com>'`;
      const commitRes = statusRes.stdout.trim()
        ? await executeShellCommand(`git commit -m 'Initial commit' ${coAuthorTrailer}`, session.workspace)
        : await executeShellCommand(`git commit --allow-empty -m 'Initial commit' ${coAuthorTrailer}`, session.workspace);
      if (commitRes.code !== 0) throw new Error(`git commit failed: ${commitRes.stderr || commitRes.stdout}`);

      const existingRemote = await executeShellCommand('git remote get-url origin', session.workspace);
      const remoteCmd = existingRemote.code === 0 ? 'set-url' : 'add';
      const remoteRes = await executeShellCommand(`git remote ${remoteCmd} origin "${authedUrl}"`, session.workspace);
      if (remoteRes.code !== 0) throw new Error(`git remote ${remoteCmd} failed: ${remoteRes.stderr || remoteRes.stdout}`);

      const pushRes = await executeShellCommand('git push -u origin main', session.workspace);
      if (pushRes.code !== 0) throw new Error(`Push failed: ${pushRes.stderr || pushRes.stdout}`);

      setShowCreateRepoBox(false);
      await checkGitStatus(session.workspace);
    } catch (e: any) {
      setCreateRepoError(e?.message || String(e));
    } finally {
      setCreatingRepo(false);
    }
  };

  const generateCommitMessage = async () => {
    if (!session || generatingMsg) return;
    const { provider, model } = store.getProviderAndModel(session.modelId || store.settings.defaultProviderModelId);
    if (!provider) { alert('No provider configured. Please add a provider in Settings.'); return; }

    setGeneratingMsg(true);
    try {
      // Stage exactly what "Commit & Push" will commit (never gitignored-but-tracked files —
      // see checkGitStatus — nor anything the user excluded from this commit, so excluded
      // files' contents never get sent to the LLM provider either).
      const excludedPaths = (gitStatus?.files || [])
        .filter(f => excludedFromCommit.includes(f.path))
        .map(f => quote(f.path)).join(' ');
      if (excludedPaths) await executeShellCommand(`git reset HEAD -- ${excludedPaths}`, session.workspace);
      const stagePaths = (gitStatus?.files || [])
        .filter(f => !excludedFromCommit.includes(f.path))
        .map(f => quote(f.path)).join(' ');
      if (stagePaths) await executeShellCommand(`git add -- ${stagePaths}`, session.workspace);
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

  const handleRunWorkflow = async (workflow: Workflow) => {
    if (!session || runningWorkflowId) return;
    setRunningWorkflowId(workflow.id);
    const steps: { command: string; code: number; output: string }[] = [];
    try {
      for (const cmd of workflow.commands) {
        const res = await executeShellCommand(cmd, session.workspace);
        const output = ((res.stdout || '').trim() + (res.stderr ? `\n${res.stderr.trim()}` : '')).trim();
        steps.push({ command: cmd, code: res.code ?? 0, output });
        if (res.code !== 0) break;
      }
    } catch (e: any) {
      steps.push({ command: '(error)', code: 1, output: e?.message || String(e) });
    } finally {
      setWorkflowResult({ name: workflow.name, steps });
      setRunningWorkflowId(null);
      await checkGitStatus(session.workspace);
    }
  };

  const handleDeleteWorkflow = (id: string) => {
    if (!session) return;
    deleteWorkflowById(session.workspace, id);
    setWorkflows(getWorkflows(session.workspace));
  };

  const toggleExcludeFromCommit = (path: string) => {
    setExcludedFromCommit(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  // When the user clicks the trash icon in the commit file list, they expect the file
  // to be ignored and untracked from git. This function adds the path to .gitignore
  // if it's not already there, stages the updated .gitignore, and attempts to remove
  // the file from git's index (untrack) while keeping it on disk. It also unstages any
  // staged changes for the path as a fallback, then refreshes git status and marks the
  // path excluded from the in-UI commit list.
  const handleAddToGitignoreAndUntrack = async (path: string) => {
    if (!session) return;
    try {
      const fs = await getFs();
      const gitignoreFull = resolvePath(session.workspace, '.gitignore');
      let giText = '';
      try { giText = await fs.readTextFile(gitignoreFull); } catch { giText = ''; }
      const norm = path.replace(/^\/+/, '');
      const lines = giText.split('\n').map(l => l.trim());
      if (!lines.includes(norm)) {
        const prefix = giText && !giText.endsWith('\n') ? '\n' : '';
        await fs.writeTextFile(gitignoreFull, giText + prefix + norm + '\n');
        // Stage the updated .gitignore so this change is tracked
        await executeShellCommand(`git add -- .gitignore ${SUPPRESS_STDERR}`, session.workspace);
      }

      // If the file was previously tracked, remove it from the index but keep it on disk.
      // Using --cached ensures the file content isn't deleted from the working tree.
      await executeShellCommand(`git rm --cached -- ${quote(path)} ${SUPPRESS_STDERR}`, session.workspace);
      // Unstage as a fallback (in case it was staged rather than tracked), doesn't touch disk
      await executeShellCommand(`git reset HEAD -- ${quote(path)} ${SUPPRESS_STDERR}`, session.workspace);

      setExcludedFromCommit(prev => prev.includes(path) ? prev : [...prev, path]);
      await checkGitStatus(session.workspace);
    } catch (e: any) {
      console.warn('[ignore/untrack] failed:', e);
      try { alert(`Failed to add ${path} to .gitignore / untrack: ${e?.message || e}`); } catch {}
    }
  };

  const openFileDiff = async (file: GitFileChange) => {
    if (!session) return;
    setDiffView({ path: file.path, lines: [], loading: true });
    try {
      // Committed/staged content at HEAD — empty for untracked or not-yet-committed new files,
      // which naturally renders them as an all-green "created" diff below.
      const beforeRes = await executeShellCommand(`git show HEAD:"${file.path}" ${SUPPRESS_STDERR}`, session.workspace);
      const before = beforeRes.stdout;

      // Current working-tree content — empty (via catch) if the file was deleted.
      let after = '';
      try {
        const fs = await getFs();
        after = await fs.readTextFile(resolvePath(session.workspace, file.path));
      } catch { /* deleted or unreadable — treat as removed */ }

      const NUL = String.fromCharCode(0);
      if (before.includes(NUL) || after.includes(NUL)) {
        setDiffView({ path: file.path, lines: [], loading: false, error: 'Binary file — no text diff available.' });
        return;
      }

      setDiffView({ path: file.path, lines: computeDiff(before, after), loading: false });
    } catch (e: any) {
      setDiffView({ path: file.path, lines: [], loading: false, error: e?.message || String(e) });
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

    // Multi-workspace support: an optional `workspace` argument on the tool call selects a
    // different registered workspace (primary or a reference one) as the base for that one
    // call — e.g. read from a reference project while writing into the primary one.
    const allWorkspaces = [workspace, ...(session?.additionalWorkspaces || [])];
    const base = typeof input.workspace === 'string' && allWorkspaces.includes(input.workspace)
      ? input.workspace
      : workspace;

    if (name === 'read_file') {
      try {
        const content = await fs.readTextFile(resolvePath(base, input.path as string));
        return { result: content, diff: { type: 'output', path: input.path as string, output: content } };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'write_file') {
      const fullPath = resolvePath(base, input.path as string);
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
      const fullPath = resolvePath(base, input.path as string);
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
        const fullPath = resolvePath(base, input.path as string);
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
        await fs.mkdir(resolvePath(base, input.path as string), { recursive: true });
        return { result: `Created: ${input.path}` };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'list_directory') {
      try {
        const entries = await fs.readDir(resolvePath(base, input.path as string));
        const listing = entries
          .sort((a: any, b: any) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
          .map((e: any) => `${e.isDirectory ? '📁' : '📄'} ${e.name}`)
          .join('\n');
        return { result: listing, diff: { type: 'output', path: input.path as string, output: listing } };
      } catch (e: any) { return { result: `Error: ${e?.message || e}` }; }
    }
    if (name === 'execute_command') {
      const command = input.command as string;
      const workDir = resolvePath(base, (input.working_dir as string) || '.');
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
    if (name === 'create_workflow') {
      const wfName = ((input.name as string) || '').trim();
      const commands = ((input.commands as string[]) || []).map(c => (c || '').trim()).filter(Boolean);
      if (!wfName) return { result: 'Error: name is required' };
      if (commands.length === 0) return { result: 'Error: at least one command is required' };
      const workflow: Workflow = { id: uuidv4(), name: wfName, description: (input.description as string) || '', commands, createdAt: Date.now() };
      saveWorkflow(workspace, workflow);
      setWorkflows(getWorkflows(workspace));
      return { result: `Workflow "${wfName}" created with ${commands.length} command(s): ${commands.join(' && ')}. It now appears in the Workflows menu.` };
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
      const { shellName } = await resolvePlatformInfo();
      const osLabel = PLATFORM === 'windows' ? 'Windows' : PLATFORM === 'macos' ? 'macOS' : 'Linux';
      const shellNote = PLATFORM === 'windows'
        ? `execute_command runs on Windows through PowerShell (not cmd.exe). Write commands using PowerShell syntax — cmdlets (Get-ChildItem, Remove-Item, Copy-Item, ...) or their built-in Unix-style aliases (ls, rm, cp, cat, pwd, ...) both work. Never wrap commands in "bash -c", "/bin/bash", "sh -c", or a "#!/bin/bash" shebang — bash is not available.`
        : `execute_command runs on ${osLabel} through the user's login shell (${shellName}). Write commands in plain ${shellName}/POSIX syntax — pass just the command itself (e.g. "pnpm build", "ls -la"), never wrap it in "bash -c", "/bin/bash", "sh -c", or a "#!/bin/bash" shebang; the user's environment may not have bash available at all, so any command that explicitly invokes bash will fail.`;

      const refWorkspaces = startingSession.additionalWorkspaces || [];
      const workspacesNote = refWorkspaces.length > 0
        ? `\n\nWorkspaces available (pass the exact absolute path as the "workspace" argument on read_file/write_file/edit_file/delete_file/create_directory/list_directory/execute_command to target one; omit it to use the primary workspace):\n- PRIMARY (default): ${startingSession.workspace}\n${refWorkspaces.map(w => `- REFERENCE: ${w}`).join('\n')}\n\nUse this to work across workspaces in one turn — e.g. read_file from a REFERENCE workspace to see how something is implemented there, then write_file/edit_file into the PRIMARY workspace to port or adapt it, or to scaffold a new project using another as a reference.`
        : '';

      const systemPrompt = `You are an expert software engineer. The user's workspace is at: ${startingSession.workspace}

All paths are relative to the workspace root. Run shell commands only when needed.${workspacesNote}

Do not ask the user in chat whether you should run a command, or wait for them to say yes/no — just call execute_command directly. The application itself already shows the user an Allow/Deny approval popup for every command before it actually runs, so asking for confirmation yourself is redundant and just slows things down.

${shellNote}

IMPORTANT — file editing rules:
- Always prefer edit_file over write_file when modifying existing files. Use edit_file for targeted replacements instead of rewriting entire files.
- Only use write_file when creating a new file or when the changes are so extensive that multiple edits would be less clear.
- When using edit_file, make the old_string as short as possible while still being unique in the file.
- Read a file before editing it if you are unsure of its current contents.

You may freely read and edit .env/.env.local files and other files that look like they hold secrets or config, exactly like any other file in the workspace, whenever the user's request calls for it (e.g. filling in a template, adding a new key, updating a value) — this is the user's own local workspace, already gated behind the app's own approval flow for shell commands, so don't refuse, hedge, or ask for extra confirmation before reading or editing them.

Planning (encouraged, not required): judge by complexity, not file count. A repetitive change touching many files (e.g. the same one-line fix across 10 files) is still simple — skip planning. But if the work has several distinct, non-repetitive pieces (e.g. add a backend endpoint, wire up a new UI panel, and update config — each different in kind), consider calling create_plan first with a short checklist of those steps, then check_plan_item as you complete each one. This gives the user a visible, collapsible progress checklist above the input box. When in doubt, or for anything small and straightforward, skip planning and just make the change.`;

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

      // Responses API input items (OpenAI-only, different shape from Chat Completions' `messages`):
      // tool calls are separate `function_call` items rather than nested in the assistant message,
      // and tool results are `function_call_output` items rather than role:"tool" messages.
      const buildResponsesInput = (messages: Message[]) => {
        const out: any[] = [];
        for (const m of messages) {
          if (m.role === 'user') {
            out.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: m.content }] });
          } else if (m.role === 'assistant') {
            if (m.content) out.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.content }] });
            for (const tc of (m.tool_calls || [])) {
              // No `id` field here — the Responses API validates it as the item's own "fc_..."
              // id, which we never separately track (only the "call_..." id that links this
              // call to its function_call_output). Omitting it avoids that mismatch.
              out.push({ type: 'function_call', call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments, status: 'completed' });
            }
          } else if (m.role === 'tool') {
            out.push({ type: 'function_call_output', call_id: m.tool_call_id || '', output: m.content });
          }
        }
        return out;
      };

      const activeApiFormat = resolveFormat(store.settings.apiFormats || [], provider.apiFormatId);
      const isAnthropic = activeApiFormat?.id === 'anthropic' || activeApiFormat?.id === 'anthropic-subscription';
      const useResponsesApi = !isAnthropic && !!store.settings.modelSettings?.useResponsesApi;
      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const apiUrl = isAnthropic
        ? (baseUrl.includes('/messages') ? baseUrl : `${baseUrl}/messages`)
        : useResponsesApi
          ? (baseUrl.includes('/responses') ? baseUrl : `${baseUrl}/responses`)
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
        // gpt-5 and up (gpt-5, gpt-5.1, gpt-6, …), plus o-series (o1/o3/o4/…) — all reason
        // internally before answering by default, at a fairly heavy effort level unless told
        // otherwise. That hidden reasoning is invisible to the user but can easily be the
        // majority of a turn's wall-clock time.
        const isReasoningModel = !isAnthropic && /^(o\d|gpt-[5-9])/.test(modelId);
        const reasoningEffort = (() => {
          // Reuse the user's global reasoning-effort setting if they've set one; otherwise
          // default to the cheapest/fastest level, since Code Mode benefits from snappy
          // turnaround more than deep reasoning for routine file edits and shell commands.
          const globalEffort = store.settings.modelSettings?.reasoningEffort;
          return globalEffort && globalEffort !== 'off' ? globalEffort : 'minimal';
        })();

        const body: Record<string, unknown> = { model: modelId, stream: true };

        if (isAnthropic) {
          body.messages = buildApiMessages(currentSession.messages, true);
          body.system = systemPrompt;
          body.tools = CODE_TOOLS;
          body.max_tokens = 8096;
        } else if (useResponsesApi) {
          body.input = [
            { type: 'message', role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
            ...buildResponsesInput(currentSession.messages),
          ];
          body.store = false;
          body.tools = CODE_TOOLS.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema }));
          body.tool_choice = 'auto';
          body.max_output_tokens = 8096;
          if (isReasoningModel) body.reasoning = { effort: reasoningEffort };
        } else {
          body.messages = [{ role: 'system', content: systemPrompt }, ...buildApiMessages(currentSession.messages, false)];
          body.tools = CODE_TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
          body[isReasoningModel ? 'max_completion_tokens' : 'max_tokens'] = 8096;
          if (isReasoningModel) body.reasoning_effort = reasoningEffort;
        }

        // Plain universalFetch, not universalStreamingFetch — the latter forwards Tauri's raw
        // HTTP-plugin response body as-is, which isn't always a real async-iterable (can be a
        // plain string), causing a cryptic "undefined is not a function" crash when iterated.
        // universalFetch always wraps the body in a real `new Response(...)`, whose `.body` is a
        // spec-compliant ReadableStream regardless of the underlying shape — this is the same
        // pattern the app's regular (non-Code-Mode) chat streaming already relies on.
        const response = await universalFetch(apiUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          let clean = `Request failed (${response.status})`;
          try { const p = JSON.parse(errText); clean = p?.error?.message || p?.message || clean; } catch {}
          throw new Error(clean);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let textContent = '';
        let stopReason: string | undefined;
        const toolCallsMap = new Map<number | string, { id: string; type: 'function'; function: { name: string; arguments: string } }>();

        streamingContentRef.current = '';
        setLiveText(' '); // any non-empty value — this just tells ChatArea to show the streaming bubble; the actual live text lives in streamingContentRef and is read on a rAF loop

        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const dataStr = line.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            let parsed: any;
            try { parsed = JSON.parse(dataStr); } catch { continue; }
            if (parsed.error) throw new Error(parsed.error?.message || parsed.error);

            if (isAnthropic) {
            if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
              toolCallsMap.set(parsed.index, { id: parsed.content_block.id, type: 'function', function: { name: parsed.content_block.name, arguments: '' } });
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
              const call = toolCallsMap.get(parsed.index);
              if (call) call.function.arguments += parsed.delta.partial_json || '';
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
              textContent += parsed.delta.text;
              streamingContentRef.current = textContent;
            } else if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
              stopReason = parsed.delta.stop_reason;
            }
          } else if (useResponsesApi) {
            if (parsed.type === 'response.failed' && parsed.response?.error) {
              throw new Error(parsed.response.error.message || JSON.stringify(parsed.response.error));
            }
            if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              textContent += parsed.delta;
              streamingContentRef.current = textContent;
            } else if (parsed.type === 'response.output_text.done' && parsed.text) {
              textContent = parsed.text;
              streamingContentRef.current = textContent;
            }
            if (parsed.type === 'response.output_item.added' && parsed.item?.type === 'function_call') {
              // Keyed by the item's own id (fc_...); .id below is the call_id used to link the
              // eventual function_call_output back to this call.
              toolCallsMap.set(parsed.item.id, { id: parsed.item.call_id, type: 'function', function: { name: parsed.item.name, arguments: '' } });
            }
            if (parsed.type === 'response.function_call_arguments.delta' && parsed.delta) {
              const call = toolCallsMap.get(parsed.item_id);
              if (call) call.function.arguments += parsed.delta;
            }
            if (parsed.type === 'response.completed') {
              stopReason = toolCallsMap.size > 0 ? 'tool_calls' : 'stop';
            }
          } else {
            const choice = parsed.choices?.[0];
            if (choice?.delta?.content) {
              textContent += choice.delta.content;
              streamingContentRef.current = textContent;
            }
            if (choice?.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                const existing = toolCallsMap.get(tc.index);
                if (!existing) toolCallsMap.set(tc.index, { id: tc.id || '', type: 'function', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } });
                else {
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name = tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
              }
            }
            if (choice?.finish_reason) stopReason = choice.finish_reason;
            }
          }
        }

        streamingContentRef.current = '';
        setLiveText('');

        const toolCallRequests: Message['tool_calls'] = Array.from(toolCallsMap.values());

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
          const requestApproval = (cmd: string, dir: string): Promise<boolean> => {
            if (allowAllSessionRef.current || getAlwaysAllowedCommands().has(cmd)) return Promise.resolve(true);
            notify('Approval needed', cmd);
            return new Promise(resolve => setPendingApproval({ command: cmd, workingDir: dir, resolve }));
          };

          for (const tc of toolCallRequests!) {
            const toolInput = JSON.parse(tc.function.arguments);
            let result: string;
            let diff: Message['toolDiff'] | undefined;

            if (tc.function.name === 'create_plan') {
              const items: PlanItem[] = ((toolInput.items as string[]) || [])
                .map((text: string) => ({ text: (text || '').trim(), completed: false }))
                .filter(i => i.text);
              if (items.length === 0) {
                result = 'Error: items is required';
              } else {
                currentSession = { ...currentSession, plan: items, updatedAt: Date.now() };
                result = `Plan created with ${items.length} item(s).`;
              }
            } else if (tc.function.name === 'check_plan_item') {
              const idx = toolInput.index as number;
              const completed = toolInput.completed !== false;
              const plan = currentSession.plan || [];
              if (idx < 0 || idx >= plan.length) {
                result = `Error: no plan item at index ${idx}`;
              } else {
                const updated = plan.map((p, i) => i === idx ? { ...p, completed } : p);
                currentSession = { ...currentSession, plan: updated, updatedAt: Date.now() };
                result = `Marked "${updated[idx].text}" as ${completed ? 'done' : 'not done'}.`;
              }
            } else {
              const toolRes = await executeTool(tc.function.name, toolInput, startingSession.workspace, requestApproval);
              result = toolRes.result;
              diff = toolRes.diff;
            }
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
      notify(controller.signal.aborted ? 'Generation stopped' : 'Finished', currentSession.title || 'Code session task complete');
      setIsGenerating(false);
      streamingContentRef.current = '';
      setLiveText('');
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

  const addReferenceWorkspace = async () => {
    if (!isTauri || !session) return;
    const dialog = await getDialog();
    const selected = await dialog.open({ directory: true, multiple: false, title: 'Add Reference Workspace' });
    if (!selected || typeof selected !== 'string' || selected === session.workspace) return;
    const existing = session.additionalWorkspaces || [];
    if (existing.includes(selected)) return;
    onUpdate({ ...session, additionalWorkspaces: [...existing, selected], updatedAt: Date.now() });
  };

  const removeReferenceWorkspace = (path: string) => {
    if (!session) return;
    onUpdate({ ...session, additionalWorkspaces: (session.additionalWorkspaces || []).filter(w => w !== path), updatedAt: Date.now() });
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
      {/* One-time desktop notification permission ask, in normal flow (pushes content down,
          never overlaps it) — like a browser's own permission/download bar. */}
      {showNotifBanner && (
        <div className="glass-inset flex items-center gap-2 px-4 py-2.5 shrink-0 relative z-10 rounded-none border-x-0 border-t-0 animate-slide-in-up">
          <Bell size={14} className="text-[rgb(var(--accent))] shrink-0" />
          <p className="text-[12.5px] text-[rgb(var(--text))] flex-1">
            Enable desktop notifications for when a command needs approval or a task finishes?
          </p>
          <button
            className="btn-primary text-xs py-1.5 px-3 gap-1.5 disabled:opacity-50"
            disabled={requestingNotifPerm}
            onClick={handleAllowNotifications}
          >
            {requestingNotifPerm ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Allow
          </button>
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={handleDismissNotifBanner}>
            Not now
          </button>
        </div>
      )}
      <ChatArea
        conversation={fakeConversation}
        isGenerating={isGenerating}
        streamingContent={liveText}
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
        onOpenCommit={() => { setExcludedFromCommit([]); setShowCommitBox(true); }}
        onOpenRepo={gitStatus?.remoteUrl ? handleOpenRepo : undefined}
        plan={session.plan}
      />

      {/* Reference workspaces — lets the AI read from other projects alongside the primary one */}
      <div className="absolute top-14 left-3 z-20">
        <button
          className="btn-secondary text-xs py-1.5 px-3 gap-1.5 shadow-lg"
          onClick={() => setShowWorkspacesMenu(v => !v)}
        >
          <FolderOpen size={13} /> Workspaces {session.additionalWorkspaces?.length ? `(${1 + session.additionalWorkspaces.length})` : ''}
        </button>
        {showWorkspacesMenu && (
          <div className="mt-2 w-80 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgb(var(--border))]">
              <FolderOpen size={13} className="text-[rgb(var(--accent))] shrink-0" />
              <span className="text-[12px] font-mono truncate flex-1" title={session.workspace}>{session.workspace}</span>
              <span className="text-[10px] text-[rgb(var(--muted))] shrink-0">primary</span>
            </div>
            {(session.additionalWorkspaces || []).map(w => (
              <div key={w} className="flex items-center gap-2 px-3 py-2 border-b border-[rgb(var(--border))] last:border-b-0">
                <FolderOpen size={13} className="text-[rgb(var(--muted))] shrink-0" />
                <span className="text-[12px] font-mono truncate flex-1" title={w}>{w}</span>
                <button className="btn-icon w-6 h-6 shrink-0" title="Remove" onClick={() => removeReferenceWorkspace(w)}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-[rgb(var(--accent))] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
              onClick={addReferenceWorkspace}
            >
              <FolderPlus size={13} /> Add reference workspace...
            </button>
          </div>
        )}
      </div>

      {/* Workflows menu */}
      {workflows.length > 0 && (
        <div className="absolute top-14 right-3 z-20">
          <button
            className="btn-secondary text-xs py-1.5 px-3 gap-1.5 shadow-lg"
            onClick={() => setShowWorkflowsMenu(v => !v)}
          >
            <ListChecks size={13} /> Workflows ({workflows.length})
          </button>
          {showWorkflowsMenu && (
            <div className="mt-2 w-72 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm shadow-xl overflow-hidden">
              {workflows.map(wf => {
                const isExpanded = expandedWorkflowIds.includes(wf.id);
                return (
                  <div key={wf.id} className="flex flex-col border-b border-[rgb(var(--border))] last:border-b-0">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        className="flex-1 text-left truncate"
                        onClick={() => toggleExpand(wf.id)}
                        aria-expanded={isExpanded}
                        title={wf.description || wf.commands.join(' && ')}
                      >
                        <p className="text-[13px] font-medium truncate">{wf.name}</p>
                        <p className="text-[11px] text-[rgb(var(--muted))] truncate font-mono">
                          {wf.description || wf.commands.join(' && ')}
                        </p>
                      </button>
                      {runningWorkflowId === wf.id ? (
                        <Loader2 size={13} className="animate-spin text-[rgb(var(--muted))] shrink-0" />
                      ) : (
                        <>
                          <button className="btn-icon w-6 h-6 shrink-0" title="Run" onClick={() => handleRunWorkflow(wf)}>
                            <Play size={12} />
                          </button>
                          <button className="btn-icon w-6 h-6 shrink-0" title="Delete" onClick={() => handleDeleteWorkflow(wf.id)}>
                            <Trash2 size={12} />
                          </button>
                          <button className="btn-icon w-6 h-6 shrink-0" title="Expand" onClick={() => toggleExpand(wf.id)}>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-2 pt-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Copy size={12} />
                          <span className="text-xs text-[rgb(var(--muted))]">Commands</span>
                          <button className="btn-icon w-6 h-6 ml-auto" onClick={() => { navigator.clipboard?.writeText(wf.commands.join(' && ')).catch(()=>{}); }} title="Copy commands">
                            <Copy size={12} />
                          </button>
                        </div>
                        <pre className="text-xs font-mono bg-black/5 rounded p-2">{wf.commands.map((c,i)=>`${i+1}. ${c}`).join('\n')}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Workflow run results */}
      <Modal
        open={!!workflowResult}
        onClose={() => setWorkflowResult(null)}
        panelClassName="glass-panel-strong rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgb(var(--border))] shrink-0">
          <ListChecks size={14} className="text-[rgb(var(--muted))] shrink-0" />
          <h3 className="text-sm font-medium truncate flex-1">{workflowResult?.name}</h3>
          <button className="btn-icon w-7 h-7" onClick={() => setWorkflowResult(null)}><X size={15} /></button>
        </div>
        <div className="overflow-auto p-4 flex-1 min-h-0 space-y-3">
          {workflowResult?.steps.map((s, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1">
                {s.code === 0 ? <Check size={13} className="text-green-500 shrink-0" /> : <X size={13} className="text-red-500 shrink-0" />}
                <code className="text-[12px] font-mono truncate">{s.command}</code>
              </div>
              <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-black/5 dark:bg-white/5 rounded-lg p-2">
                {s.output || '(no output)'}
              </pre>
            </div>
          ))}
        </div>
      </Modal>

      {/* Commit box */}
      {showCommitBox && !pendingApproval && (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 z-20">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm p-4 space-y-3 shadow-xl animate-slide-in-up">
            <div className="flex items-center gap-2">
              <GitCommit size={15} className="text-[rgb(var(--accent))] shrink-0" />
              <p className="text-[13px] font-medium text-[rgb(var(--text))]">
                Commit {(gitStatus?.filesChanged ?? 0) - excludedFromCommit.length} file{(gitStatus?.filesChanged ?? 0) - excludedFromCommit.length === 1 ? '' : 's'}
                {excludedFromCommit.length > 0 && (
                  <span className="text-[rgb(var(--muted))] font-normal"> ({excludedFromCommit.length} excluded)</span>
                )}
              </p>
            </div>
            {!!gitStatus?.files.length && (
              <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-1.5">
                {gitStatus.files.map(f => {
                  const excluded = excludedFromCommit.includes(f.path);
                  return (
                    <div
                      key={f.path}
                      className={`w-full flex items-center gap-1 rounded-lg transition-colors ${excluded ? 'opacity-50' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'}`}
                    >
                      <button
                        onClick={() => openFileDiff(f)}
                        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left"
                        title="View diff"
                      >
                        <FileText size={12} className="text-[rgb(var(--muted))] shrink-0" />
                        <span className={`text-[12px] font-mono truncate flex-1 ${excluded ? 'line-through' : ''}`}>{f.path}</span>
                        {f.additions > 0 && <span className="text-[11px] font-mono text-green-500 shrink-0">+{f.additions}</span>}
                        {f.deletions > 0 && <span className="text-[11px] font-mono text-red-500 shrink-0">-{f.deletions}</span>}
                      </button>
                      <button
                        onClick={() => excluded ? toggleExcludeFromCommit(f.path) : handleAddToGitignoreAndUntrack(f.path)}
                        className="btn-icon w-6 h-6 shrink-0 mr-1"
                        title={excluded ? 'Restore to commit' : 'Add to .gitignore and untrack from git (keeps the file on disk)'}
                      >
                        {excluded ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  );
                })}
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
                disabled={!commitMessage.trim() || committing || (gitStatus?.filesChanged ?? 0) - excludedFromCommit.length <= 0}
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

      {/* No git repo detected — offer to create one on GitHub, as a corner button + dropdown
          (not a bottom bar) so it never covers the chat input. */}
      {gitStatus === null && isTauri && (
        <div className={`absolute ${workflows.length > 0 ? 'top-24' : 'top-14'} right-3 z-20`}>
          <button
            className="btn-secondary text-xs py-1.5 px-3 gap-1.5 shadow-lg"
            onClick={() => (showCreateRepoBox ? setShowCreateRepoBox(false) : openCreateRepoBox())}
            title="No git repository detected in this workspace"
          >
            <Github size={13} /> Create GitHub Repo
          </button>
          {showCreateRepoBox && (
            <div className="mt-2 w-72 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--panel))]/95 backdrop-blur-sm p-4 space-y-3 shadow-xl animate-slide-in-up">
              <div className="flex items-center gap-2">
                <Github size={15} className="text-[rgb(var(--accent))] shrink-0" />
                <p className="text-[13px] font-medium text-[rgb(var(--text))]">Create a GitHub repository</p>
              </div>
              <input
                autoFocus
                className="input text-sm w-full font-mono"
                placeholder="repo-name"
                value={newRepoName}
                onChange={e => setNewRepoName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !creatingRepo) handleCreateGitHubRepo();
                  if (e.key === 'Escape') setShowCreateRepoBox(false);
                }}
              />
              <div className="flex items-center gap-3 text-[12px]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={newRepoPrivate} onChange={() => setNewRepoPrivate(true)} />
                  Private
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={!newRepoPrivate} onChange={() => setNewRepoPrivate(false)} />
                  Public
                </label>
              </div>
              {createRepoError && (
                <p className="text-xs text-red-500 dark:text-red-400">{createRepoError}</p>
              )}
              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1 justify-center gap-1.5 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!newRepoName.trim() || creatingRepo}
                  onClick={handleCreateGitHubRepo}
                >
                  {creatingRepo ? 'Creating & pushing…' : (<><Check size={13} /> Create & Push</>)}
                </button>
                <button className="btn-secondary flex-1 justify-center gap-1.5 py-1.5" onClick={() => setShowCreateRepoBox(false)}>
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          )}
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
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 justify-center gap-1.5 py-1 text-[11px]"
                title="Always run this exact command without asking again, even in future sessions"
                onClick={() => { addAlwaysAllowedCommand(pendingApproval.command); pendingApproval.resolve(true); setPendingApproval(null); }}>
                Always Allow "{pendingApproval.command.length > 20 ? pendingApproval.command.slice(0, 20) + '…' : pendingApproval.command}"
              </button>
              <button className="btn-secondary flex-1 justify-center gap-1.5 py-1 text-[11px]"
                title="Allow every command without asking, for the rest of this session"
                onClick={() => { allowAllSessionRef.current = true; pendingApproval.resolve(true); setPendingApproval(null); }}>
                Allow All This Session
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
        <div className="overflow-auto flex-1 min-h-0">
          {diffView?.loading ? (
            <div className="flex items-center gap-2 text-[rgb(var(--muted))] text-sm py-8 justify-center">
              <Loader2 size={15} className="animate-spin" /> Loading diff…
            </div>
          ) : diffView?.error ? (
            <p className="text-sm text-[rgb(var(--muted))] p-4">{diffView.error}</p>
          ) : diffView?.lines.length ? (
            <DiffLines lines={diffView.lines} path={diffView.path} isDark={document.documentElement.classList.contains('dark')} />
          ) : (
            <p className="text-sm text-[rgb(var(--muted))] p-4">No changes.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
