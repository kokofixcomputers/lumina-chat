import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, Upload, LogIn, LogOut, UserPlus, Store, Clock,
  CheckCircle, XCircle, AlertCircle, Loader2, Check, ShieldCheck, ShieldAlert,
  ArrowLeft, ChevronRight, Package, Eye, EyeOff, LayoutGrid, Shield, RefreshCw,
} from 'lucide-react';
import { extensionStorage } from '../extensions/extensionStorage';
import { extensionLoader } from '../extensions/extensionLoader';

const API = '/api/marketplace';

// ── Types ─────────────────────────────────────────────────────────────────

interface MarketExt {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  submittedBy: string;
  type?: 'sandboxed' | 'unsandboxed';
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: number;
  reviewedAt?: number;
  reviewNote?: string;
  downloads: number;
  code?: string;
}

interface User {
  username: string;
  role: 'user' | 'moderator';
}

type View = 'browse' | 'mine' | 'submit' | 'login' | 'signup' | 'review' | 'review-detail';

// ── API helper ────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...(opts.headers as any) } });
  return res.json();
}

// ── Shared badge helpers ──────────────────────────────────────────────────

function TypeBadge({ type }: { type?: string }) {
  return (type ?? 'sandboxed') === 'unsandboxed' ? (
    <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
      <ShieldAlert size={10} /> Unsandboxed
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
      <ShieldCheck size={10} /> Sandboxed
    </span>
  );
}

function StatusBadge({ status }: { status: MarketExt['status'] }) {
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
      <CheckCircle size={10} /> Approved
    </span>
  );
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      <XCircle size={10} /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
      <Clock size={10} /> Pending review
    </span>
  );
}

// ── Top navigation bar ────────────────────────────────────────────────────

function Navbar({ view, setView, user, onLogout, navigate }: {
  view: View;
  setView: (v: View) => void;
  user: User | null;
  onLogout: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const navLinks: { id: View; label: string; modOnly?: boolean }[] = [
    { id: 'browse', label: 'Browse' },
    ...(user ? [
      { id: 'mine' as View, label: 'My Extensions' },
      { id: 'submit' as View, label: 'Submit' },
    ] : []),
    ...(user?.role === 'moderator' ? [{ id: 'review' as View, label: 'Review Queue', modOnly: true }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-[rgb(var(--bg))]/90 backdrop-blur border-b border-[rgb(var(--border))]">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        {/* Back + brand */}
        <button
          onClick={() => navigate(-1)}
          className="btn-icon shrink-0"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={() => setView('browse')}
          className="flex items-center gap-2 font-semibold text-[rgb(var(--text))] hover:opacity-80 transition-opacity shrink-0"
        >
          <Store size={18} />
          Marketplace
        </button>

        {/* Nav links */}
        <nav className="flex items-center gap-1 ml-2 flex-1 min-w-0 overflow-x-auto">
          {navLinks.map(link => (
            <button
              key={link.id}
              onClick={() => setView(link.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === link.id || (link.id === 'review' && view === 'review-detail')
                  ? 'bg-[rgb(var(--panel))] text-[rgb(var(--text))]'
                  : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'
              } ${link.modOnly ? 'text-purple-500 dark:text-purple-400' : ''}`}
            >
              {link.modOnly && <Shield size={12} className="inline mr-1 -mt-0.5" />}
              {link.label}
            </button>
          ))}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 text-sm text-[rgb(var(--muted))]">
                <span>{user.username}</span>
                {user.role === 'moderator' && (
                  <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-[10px] font-medium">MOD</span>
                )}
              </div>
              <button onClick={onLogout} className="btn-icon" title="Sign out">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setView('login')} className="btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-1.5">
                <LogIn size={14} /> Sign in
              </button>
              <button onClick={() => setView('signup')} className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-1.5">
                <UserPlus size={14} /> Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Auth pages ────────────────────────────────────────────────────────────

function AuthPage({ mode, setView, onSuccess }: {
  mode: 'login' | 'signup';
  setView: (v: View) => void;
  onSuccess: (token: string, user: User) => void;
}) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth', { method: 'POST', body: JSON.stringify({ action: mode, ...form }) });
      if (data.error) { setError(data.error); return; }
      localStorage.setItem('market-token', data.token);
      onSuccess(data.token, { username: data.username, role: data.role });
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  const isLogin = mode === 'login';

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 min-h-[calc(100vh-56px)]">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--text))] flex items-center justify-center mb-6 mx-auto">
          {isLogin ? <LogIn size={24} className="text-[rgb(var(--bg))]" /> : <UserPlus size={24} className="text-[rgb(var(--bg))]" />}
        </div>

        <h1 className="text-2xl font-bold text-center mb-1">{isLogin ? 'Welcome back' : 'Create account'}</h1>
        <p className="text-sm text-[rgb(var(--muted))] text-center mb-8">
          {isLogin ? 'Sign in to submit and manage your extensions.' : 'Join to publish extensions to the marketplace.'}
        </p>

        <div className="space-y-3">
          <div>
            <label className="form-label">Username</label>
            <input
              type="text"
              placeholder="yourname"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="input w-full"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="input w-full pr-10"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || !form.username || !form.password}
            className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {isLogin ? 'Sign in' : 'Create account'}
          </button>
        </div>

        <p className="text-sm text-center text-[rgb(var(--muted))] mt-6">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            className="text-[rgb(var(--accent))] hover:underline font-medium"
            onClick={() => { setView(isLogin ? 'signup' : 'login'); }}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Browse / Mine extension list ──────────────────────────────────────────

function ExtensionCard({ ext, tab, installing, installed, onInstall, reviewNote, reviewLoading, onReview, onSetNote, onViewDetail, onUpdate }: {
  ext: MarketExt;
  tab: View;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  reviewNote: string;
  reviewLoading: boolean;
  onReview?: (action: 'approve' | 'reject') => void;
  onSetNote?: (note: string) => void;
  onViewDetail?: () => void;
  onUpdate?: () => void;
}) {
  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl p-5 hover:border-[rgb(var(--accent))]/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="font-semibold text-[rgb(var(--text))]">{ext.name}</h3>
            <span className="text-xs text-[rgb(var(--muted))] bg-[rgb(var(--bg))] px-2 py-0.5 rounded-full border border-[rgb(var(--border))]">
              v{ext.version}
            </span>
            <TypeBadge type={ext.type} />
            {tab === 'mine' && <StatusBadge status={ext.status} />}
          </div>

          {/* Description */}
          <p className="text-sm text-[rgb(var(--muted))] mb-2 line-clamp-2">{ext.description}</p>

          {/* Unsandboxed warning */}
          {(ext.type ?? 'sandboxed') === 'unsandboxed' && tab === 'browse' && (
            <p className="text-[10px] text-orange-500 flex items-center gap-1 mb-2">
              <ShieldAlert size={10} /> Full DOM access — only install from trusted authors.
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-[rgb(var(--muted))]">
            <span>by {ext.author}</span>
            {tab === 'browse' && (
              <span className="flex items-center gap-1"><Download size={11} />{ext.downloads} installs</span>
            )}
            {tab === 'mine' && ext.reviewNote && (
              <span className="flex items-center gap-1 text-orange-500">
                <AlertCircle size={11} /> {ext.reviewNote}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {tab === 'browse' && (
            <button
              onClick={onInstall}
              disabled={installing || installed}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                installed ? 'btn-secondary opacity-70 cursor-default' : 'btn-primary'
              }`}
            >
              {installing ? <Loader2 size={13} className="animate-spin" /> :
               installed ? <><Check size={13} /> Installed</> :
               <><Download size={13} /> Install</>}
            </button>
          )}

          {tab === 'mine' && onUpdate && ext.status !== 'pending' && (
            <button
              onClick={onUpdate}
              className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm"
            >
              <RefreshCw size={13} /> Publish update
            </button>
          )}
          {tab === 'mine' && ext.status === 'pending' && (
            <span className="text-xs text-[rgb(var(--muted))] italic">Under review</span>
          )}

          {tab === 'review' && onViewDetail && (
            <button
              onClick={onViewDetail}
              className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm"
            >
              <Eye size={13} /> Review
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Moderator review detail page ──────────────────────────────────────────

function ReviewDetail({ ext, token, onDone, onBack }: {
  ext: MarketExt;
  token: string;
  onDone: (id: string) => void;
  onBack: () => void;
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState('');

  const submit = async (action: 'approve' | 'reject') => {
    setLoading(action);
    setError('');
    try {
      const data = await apiFetch('/review', {
        method: 'POST',
        body: JSON.stringify({ id: ext.id, action, note }),
      }, token);
      if (data.error) { setError(data.error); return; }
      onDone(ext.id);
    } catch { setError('Network error'); }
    finally { setLoading(null); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors mb-6 text-sm">
        <ArrowLeft size={16} /> Back to queue
      </button>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Main info */}
        <div className="space-y-5">
          <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl p-6">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <h2 className="text-xl font-bold">{ext.name}</h2>
              <span className="text-sm text-[rgb(var(--muted))] bg-[rgb(var(--bg))] px-2 py-0.5 rounded-full border border-[rgb(var(--border))]">v{ext.version}</span>
              <TypeBadge type={ext.type} />
              <StatusBadge status={ext.status} />
            </div>
            <p className="text-[rgb(var(--muted))] mb-4">{ext.description}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-[rgb(var(--muted))] mb-0.5">Author</p>
                <p className="font-medium">{ext.author}</p>
              </div>
              <div>
                <p className="text-xs text-[rgb(var(--muted))] mb-0.5">Submitted by</p>
                <p className="font-medium">{ext.submittedBy}</p>
              </div>
              <div>
                <p className="text-xs text-[rgb(var(--muted))] mb-0.5">Extension ID</p>
                <code className="text-xs bg-[rgb(var(--bg))] px-2 py-0.5 rounded border border-[rgb(var(--border))]">{ext.id}</code>
              </div>
              <div>
                <p className="text-xs text-[rgb(var(--muted))] mb-0.5">Submitted</p>
                <p className="font-medium">{new Date(ext.submittedAt).toLocaleDateString()}</p>
              </div>
            </div>

            {(ext.type ?? 'sandboxed') === 'unsandboxed' && (
              <div className="mt-4 flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
                <ShieldAlert size={16} className="text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-400">Unsandboxed extension</p>
                  <p className="text-xs text-orange-400/80 mt-0.5">This extension requests full DOM and window access. Review the code carefully before approving.</p>
                </div>
              </div>
            )}
          </div>

          {/* Code viewer */}
          <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowCode(s => !s)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-[rgb(var(--bg))] transition-colors"
            >
              <span className="flex items-center gap-2">
                {showCode ? <EyeOff size={15} /> : <Eye size={15} />}
                Extension Code
              </span>
              <span className="text-xs text-[rgb(var(--muted))]">
                {ext.code ? `${ext.code.split('\n').length} lines` : 'unavailable'}
              </span>
            </button>
            {showCode && ext.code && (
              <pre className="overflow-x-auto p-5 text-[11px] font-mono text-[rgb(var(--muted))] bg-[rgb(var(--bg))] border-t border-[rgb(var(--border))] leading-relaxed max-h-[60vh] overflow-y-auto whitespace-pre">
                {ext.code}
              </pre>
            )}
          </div>
        </div>

        {/* Decision panel */}
        <div className="space-y-4">
          <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl p-5 sticky top-20">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Shield size={16} className="text-purple-400" />
              Moderator Decision
            </h3>

            <div className="mb-4">
              <label className="form-label">Note to author (optional)</label>
              <textarea
                placeholder="Explain your decision, request changes, or leave feedback..."
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={4}
                className="input w-full resize-none text-sm"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                <AlertCircle size={14} className="shrink-0" /> {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => submit('approve')}
                disabled={!!loading}
                className="btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Approve & publish
              </button>
              <button
                onClick={() => submit('reject')}
                disabled={!!loading}
                className="py-2.5 flex items-center justify-center gap-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {loading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject
              </button>
            </div>

            <p className="text-[10px] text-[rgb(var(--muted))] mt-3 text-center">
              Approved extensions are immediately visible in the Browse tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Submit page ───────────────────────────────────────────────────────────

function SubmitPage({ token, user, setView, prefill }: { token: string; user: User | null; setView: (v: View) => void; prefill?: Partial<MarketExt> }) {
  const isUpdate = !!prefill?.id;
  const [form, setForm] = useState({
    id: prefill?.id ?? '',
    name: prefill?.name ?? '',
    version: prefill?.version ?? '1.0.0',
    description: prefill?.description ?? '',
    author: prefill?.author ?? '',
    code: '',
    type: (prefill?.type ?? 'sandboxed') as 'sandboxed' | 'unsandboxed',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--panel))] border border-[rgb(var(--border))] flex items-center justify-center mb-5">
          <Upload size={24} className="text-[rgb(var(--muted))]" />
        </div>
        <h2 className="text-xl font-bold mb-2">Sign in to submit</h2>
        <p className="text-[rgb(var(--muted))] mb-6">You need an account to publish extensions to the marketplace.</p>
        <div className="flex gap-3">
          <button onClick={() => setView('login')} className="btn-secondary px-5 py-2.5 inline-flex items-center gap-2">
            <LogIn size={15} /> Sign in
          </button>
          <button onClick={() => setView('signup')} className="btn-primary px-5 py-2.5 inline-flex items-center gap-2">
            <UserPlus size={15} /> Sign up
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/extensions', { method: 'POST', body: JSON.stringify(form) }, token);
      if (data.error) { setError(data.error); return; }
      setDone(true);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-5">
          <CheckCircle size={28} className="text-[rgb(var(--bg))]" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{isUpdate ? 'Update submitted!' : 'Extension submitted!'}</h2>
        <p className="text-[rgb(var(--muted))] mb-8">A moderator will review it before {isUpdate ? 'the update goes live' : 'it appears in the marketplace'}.</p>
        <div className="flex gap-3">
          {!isUpdate && (
            <button onClick={() => { setDone(false); setForm({ id: '', name: '', version: '1.0.0', description: '', author: '', code: '', type: 'sandboxed' }); }} className="btn-secondary px-5 py-2.5">
              Submit another
            </button>
          )}
          <button onClick={() => setView('mine')} className="btn-primary px-5 py-2.5 inline-flex items-center gap-2">
            <Package size={15} /> My Extensions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        {isUpdate && (
          <button onClick={() => setView('mine')} className="inline-flex items-center gap-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors mb-4 text-sm">
            <ArrowLeft size={15} /> My Extensions
          </button>
        )}
        <h1 className="text-2xl font-bold mb-1">{isUpdate ? `Update ${prefill!.name}` : 'Submit an extension'}</h1>
        <p className="text-[rgb(var(--muted))]">
          {isUpdate
            ? `Publishing a new version of ${prefill!.id}. The current published version is v${prefill!.version}. Mod approval required before the update goes live.`
            : 'All extensions are reviewed by a moderator before going live.'}
        </p>
      </div>

      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Extension ID <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="yourname.weather"
              value={form.id}
              onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
              className="input w-full"
              readOnly={isUpdate}
              title={isUpdate ? 'Extension ID cannot be changed when updating' : undefined}
            />
            {!isUpdate && <p className="text-xs text-[rgb(var(--muted))] mt-1">Letters, numbers, dots, dashes. Must be unique.</p>}
          </div>
          <div>
            <label className="form-label">Display Name <span className="text-red-500">*</span></label>
            <input type="text" placeholder="Weather Tool" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input w-full" />
          </div>
          <div>
            <label className="form-label">Version <span className="text-red-500">*</span></label>
            <input type="text" placeholder="1.0.0" value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))} className="input w-full" />
          </div>
          <div>
            <label className="form-label">Author name <span className="text-red-500">*</span></label>
            <input type="text" placeholder="Your Name" value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} className="input w-full" />
          </div>
        </div>

        <div>
          <label className="form-label">Description <span className="text-red-500">*</span></label>
          <textarea placeholder="What does this extension do?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input w-full min-h-[80px] resize-y" />
        </div>

        {/* Type selector */}
        <div>
          <label className="form-label mb-2">Extension Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(['sandboxed', 'unsandboxed'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setForm(p => ({ ...p, type: t }))}
                className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-colors ${
                  form.type === t
                    ? t === 'unsandboxed' ? 'border-orange-400 bg-orange-500/10' : 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10'
                    : 'border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/40'
                }`}
              >
                {t === 'sandboxed'
                  ? <ShieldCheck size={15} className="text-green-500 mt-0.5 shrink-0" />
                  : <ShieldAlert size={15} className="text-orange-400 mt-0.5 shrink-0" />}
                <div>
                  <p className="text-xs font-semibold capitalize">{t}</p>
                  <p className="text-[10px] text-[rgb(var(--muted))] mt-0.5">
                    {t === 'sandboxed' ? 'Tools + UI only. No DOM access.' : 'Full DOM, window, api.dom/app.'}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {form.type === 'unsandboxed' && (
            <p className="text-[10px] text-orange-400 mt-2 flex items-center gap-1">
              <ShieldAlert size={10} /> Unsandboxed extensions face stricter moderation scrutiny.
            </p>
          )}
        </div>

        <div>
          <label className="form-label">Extension Code <span className="text-red-500">*</span></label>
          <textarea
            placeholder="// Paste your extension code here..."
            value={form.code}
            onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
            className="input w-full font-mono text-xs min-h-[320px] resize-y"
            spellCheck={false}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !form.id || !form.name || !form.description || !form.code}
          className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-full disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Submit for Review
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('browse');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem('market-token') || '');

  const [extensions, setExtensions] = useState<MarketExt[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>({});
  const [detailExt, setDetailExt] = useState<MarketExt | null>(null);
  const [submitPrefill, setSubmitPrefill] = useState<Partial<MarketExt> | undefined>();

  // Restore session
  useEffect(() => {
    if (!token) return;
    apiFetch('/auth', {}, token).then(data => {
      if (data.username) setUser({ username: data.username, role: data.role });
      else { setToken(''); localStorage.removeItem('market-token'); }
    });
  }, []);

  // Mark installed
  useEffect(() => {
    const local = extensionStorage.getAllExtensions();
    const map: Record<string, boolean> = {};
    Object.keys(local).forEach(id => { map[id] = true; });
    setInstalled(map);
  }, []);

  const loadExtensions = useCallback(async (v: View) => {
    if (v === 'submit' || v === 'login' || v === 'signup' || v === 'review-detail') return;
    setListLoading(true);
    try {
      let url = '/extensions?status=approved';
      if (v === 'mine') url = '/extensions?mine=1';
      if (v === 'review') url = '/extensions?status=pending';
      const data = await apiFetch(url, {}, token);
      setExtensions(data.extensions || []);
    } catch { setExtensions([]); }
    finally { setListLoading(false); }
  }, [token]);

  useEffect(() => { loadExtensions(view); }, [view, loadExtensions]);

  const handleLogout = async () => {
    await apiFetch('/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }, token);
    setToken(''); setUser(null);
    localStorage.removeItem('market-token');
    setView('browse');
  };

  const handleAuthSuccess = (t: string, u: User) => {
    setToken(t); setUser(u);
    setView('browse');
  };

  const handleInstall = async (id: string) => {
    setInstalling(p => ({ ...p, [id]: true }));
    try {
      const data = await apiFetch('/install', { method: 'POST', body: JSON.stringify({ id }) });
      if (data.error) { alert(data.error); return; }
      const ext = data.extension;
      extensionStorage.saveExtension({
        id: ext.id, name: ext.name, version: ext.version,
        description: ext.description, author: ext.author,
        code: ext.code, enabled: true, tools: [],
        type: ext.type ?? 'sandboxed',
      });
      await extensionLoader.loadExtension(extensionStorage.getExtension(ext.id)!);
      setInstalled(p => ({ ...p, [id]: true }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'lumina_extensions', newValue: localStorage.getItem('lumina_extensions') }));
    } catch { alert('Installation failed'); }
    finally { setInstalling(p => ({ ...p, [id]: false })); }
  };

  const handleReviewDone = (id: string) => {
    setExtensions(prev => prev.filter(e => e.id !== id));
    setDetailExt(null);
    setView('review');
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))] flex flex-col">
      <Navbar view={view} setView={setView} user={user} onLogout={handleLogout} navigate={navigate} />

      {/* Auth pages */}
      {(view === 'login' || view === 'signup') && (
        <AuthPage
          mode={view}
          setView={setView}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Submit */}
      {view === 'submit' && (
        <SubmitPage token={token} user={user} setView={setView} prefill={submitPrefill} />
      )}

      {/* Review detail */}
      {view === 'review-detail' && detailExt && (
        <ReviewDetail
          ext={detailExt}
          token={token}
          onDone={handleReviewDone}
          onBack={() => setView('review')}
        />
      )}

      {/* Browse / Mine / Review list */}
      {(view === 'browse' || view === 'mine' || view === 'review') && (
        <div className="flex-1">
          {/* Page hero — browse only */}
          {view === 'browse' && (
            <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))]/40">
              <div className="max-w-6xl mx-auto px-4 py-10">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-[rgb(var(--text))] flex items-center justify-center shrink-0">
                    <LayoutGrid size={22} className="text-[rgb(var(--bg))]" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Browse Extensions</h1>
                    <p className="text-[rgb(var(--muted))] text-sm">Community-built tools and UI enhancements for Lumina Chat.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mine hero */}
          {view === 'mine' && (
            <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--panel))]/40">
              <div className="max-w-6xl mx-auto px-4 py-10">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[rgb(var(--text))] flex items-center justify-center shrink-0">
                      <Package size={22} className="text-[rgb(var(--bg))]" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">My Extensions</h1>
                      <p className="text-[rgb(var(--muted))] text-sm">Extensions you've submitted to the marketplace.</p>
                    </div>
                  </div>
                  <button onClick={() => setView('submit')} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 shrink-0">
                    <Upload size={15} /> Submit new
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Review queue hero */}
          {view === 'review' && (
            <div className="border-b border-[rgb(var(--border))] bg-purple-500/5">
              <div className="max-w-6xl mx-auto px-4 py-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500 flex items-center justify-center shrink-0">
                    <Shield size={22} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h1 className="text-2xl font-bold">Review Queue</h1>
                      {extensions.length > 0 && (
                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold">
                          {extensions.length} pending
                        </span>
                      )}
                    </div>
                    <p className="text-[rgb(var(--muted))] text-sm">Review and approve or reject community-submitted extensions.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="max-w-6xl mx-auto px-4 py-6">
            {listLoading && (
              <div className="flex items-center justify-center py-24">
                <Loader2 size={28} className="animate-spin text-[rgb(var(--muted))]" />
              </div>
            )}

            {!listLoading && extensions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--panel))] border border-[rgb(var(--border))] flex items-center justify-center mb-4">
                  {view === 'review' ? <Shield size={24} className="text-purple-400" /> : <Package size={24} className="text-[rgb(var(--muted))]" />}
                </div>
                <p className="text-[rgb(var(--muted))]">
                  {view === 'browse' && 'No extensions published yet.'}
                  {view === 'mine' && "You haven't submitted any extensions yet."}
                  {view === 'review' && 'The queue is empty — all caught up! 🎉'}
                </p>
                {view === 'mine' && (
                  <button onClick={() => setView('submit')} className="btn-primary mt-5 px-5 py-2.5 inline-flex items-center gap-2">
                    <Upload size={15} /> Submit your first extension
                  </button>
                )}
              </div>
            )}

            {!listLoading && extensions.length > 0 && (
              <div className="space-y-3">
                {extensions.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    tab={view}
                    installing={installing[ext.id]}
                    installed={installed[ext.id]}
                    onInstall={() => handleInstall(ext.id)}
                    reviewNote={reviewNote[ext.id] || ''}
                    reviewLoading={reviewLoading[ext.id]}
                    onSetNote={n => setReviewNote(p => ({ ...p, [ext.id]: n }))}
                    onViewDetail={() => { setDetailExt(ext); setView('review-detail'); }}
                    onUpdate={() => { setSubmitPrefill(ext); setView('submit'); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
