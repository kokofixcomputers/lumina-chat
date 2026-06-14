import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, Upload, LogIn, LogOut, UserPlus, Store, Clock,
  CheckCircle, XCircle, ChevronLeft, AlertCircle, Loader2, Check, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { extensionStorage } from '../extensions/extensionStorage';
import { extensionLoader } from '../extensions/extensionLoader';

const API = '/api/marketplace';

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
}

interface User {
  username: string;
  role: 'user' | 'moderator';
}

type Tab = 'browse' | 'mine' | 'submit' | 'review';

async function apiFetch(path: string, opts: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...(opts.headers as any) } });
  return res.json();
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('browse');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem('market-token') || '');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [extensions, setExtensions] = useState<MarketExt[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [submitForm, setSubmitForm] = useState({ id: '', name: '', version: '1.0.0', description: '', author: '', code: '', type: 'sandboxed' as 'sandboxed' | 'unsandboxed' });
  const [submitError, setSubmitError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [installed, setInstalled] = useState<Record<string, boolean>>({});

  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>({});

  // Check existing token
  useEffect(() => {
    if (!token) return;
    apiFetch('/auth', {}, token).then(data => {
      if (data.username) setUser({ username: data.username, role: data.role });
      else { setToken(''); localStorage.removeItem('market-token'); }
    });
  }, []);

  // Mark already-installed extensions
  useEffect(() => {
    const local = extensionStorage.getAllExtensions();
    const map: Record<string, boolean> = {};
    Object.keys(local).forEach(id => { map[id] = true; });
    setInstalled(map);
  }, []);

  const loadExtensions = useCallback(async (t: Tab) => {
    setListLoading(true);
    try {
      let url = '/extensions?status=approved';
      if (t === 'mine') url = '/extensions?mine=1';
      if (t === 'review') url = '/extensions?status=pending';
      const data = await apiFetch(url, {}, token);
      setExtensions(data.extensions || []);
    } catch {
      setExtensions([]);
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'submit') return;
    loadExtensions(tab);
  }, [tab, loadExtensions]);

  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const data = await apiFetch('/auth', {
        method: 'POST',
        body: JSON.stringify({ action: authMode, ...authForm }),
      });
      if (data.error) { setAuthError(data.error); return; }
      const t = data.token;
      setToken(t);
      localStorage.setItem('market-token', t);
      setUser({ username: data.username, role: data.role });
      setAuthMode(null);
      setAuthForm({ username: '', password: '' });
    } catch {
      setAuthError('Network error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }, token);
    setToken('');
    setUser(null);
    localStorage.removeItem('market-token');
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

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitLoading(true);
    try {
      const data = await apiFetch('/extensions', { method: 'POST', body: JSON.stringify(submitForm) }, token);
      if (data.error) { setSubmitError(data.error); return; }
      setSubmitDone(true);
      setSubmitForm({ id: '', name: '', version: '1.0.0', description: '', author: '', code: '', type: 'sandboxed' });
    } catch { setSubmitError('Network error'); }
    finally { setSubmitLoading(false); }
  };

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    setReviewLoading(p => ({ ...p, [id]: true }));
    try {
      const data = await apiFetch('/review', {
        method: 'POST',
        body: JSON.stringify({ id, action, note: reviewNote[id] || '' }),
      }, token);
      if (data.error) { alert(data.error); return; }
      setExtensions(prev => prev.filter(e => e.id !== id));
    } catch { alert('Review failed'); }
    finally { setReviewLoading(p => ({ ...p, [id]: false })); }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'browse', label: 'Browse' },
    ...(user ? [{ id: 'mine' as Tab, label: 'My Extensions' }, { id: 'submit' as Tab, label: 'Submit' }] : []),
    ...(user?.role === 'moderator' ? [{ id: 'review' as Tab, label: 'Review' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))]">
      <div className="max-w-4xl mx-auto px-4 py-12 pb-16">

        {/* Auth overlay */}
        {authMode && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-scale-in">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => { setAuthMode(null); setAuthError(''); }} className="btn-icon">
                  <ChevronLeft size={16} />
                </button>
                <h3 className="font-semibold">{authMode === 'login' ? 'Sign in' : 'Create account'}</h3>
              </div>
              <input
                type="text"
                placeholder="Username"
                value={authForm.username}
                onChange={e => setAuthForm(p => ({ ...p, username: e.target.value }))}
                className="input w-full"
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))}
                className="input w-full"
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
              />
              {authError && <p className="text-sm text-red-500">{authError}</p>}
              <button onClick={handleAuth} disabled={authLoading} className="btn-primary w-full py-2.5 rounded-full flex items-center justify-center gap-2">
                {authLoading && <Loader2 size={15} className="animate-spin" />}
                {authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>
              <p className="text-xs text-center text-[rgb(var(--muted))]">
                {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button className="underline" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}>
                  {authMode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Page header */}
        <div className="mb-10">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors mb-6"
          >
            <ChevronLeft size={20} />
            Back
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgb(var(--text))] mb-5">
                <Store size={28} className="text-[rgb(var(--bg))]" />
              </div>
              <h1 className="text-4xl font-bold text-[rgb(var(--text))] mb-2">Extension Marketplace</h1>
              <p className="text-lg text-[rgb(var(--muted))]">Discover, install, and share Lumina Chat extensions.</p>
            </div>

            {/* Auth controls */}
            <div className="flex items-center gap-2 pt-1">
              {user ? (
                <>
                  <div className="text-sm text-[rgb(var(--muted))]">
                    {user.username}
                    {user.role === 'moderator' && (
                      <span className="ml-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs">moderator</span>
                    )}
                  </div>
                  <button onClick={handleLogout} className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm">
                    <LogOut size={14} /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setAuthMode('login')} className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm">
                    <LogIn size={14} /> Sign in
                  </button>
                  <button onClick={() => setAuthMode('signup')} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm">
                    <UserPlus size={14} /> Sign up
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[rgb(var(--border))] mb-8">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-[rgb(var(--text))] text-[rgb(var(--text))]'
                  : 'border-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Browse / Mine / Review */}
        {(tab === 'browse' || tab === 'mine' || tab === 'review') && (
          <div className="space-y-3">
            {listLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-[rgb(var(--muted))]" />
              </div>
            )}

            {!listLoading && extensions.length === 0 && (
              <div className="text-center py-20 text-[rgb(var(--muted))]">
                {tab === 'browse' && 'No extensions published yet.'}
                {tab === 'mine' && "You haven't submitted any extensions yet."}
                {tab === 'review' && 'No extensions pending review. 🎉'}
              </div>
            )}

            {extensions.map(ext => (
              <div key={ext.id} className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="font-semibold text-[rgb(var(--text))]">{ext.name}</h3>
                      <span className="text-xs text-[rgb(var(--muted))] bg-[rgb(var(--bg))] px-2 py-0.5 rounded-full border border-[rgb(var(--border))]">v{ext.version}</span>
                      {(ext.type ?? 'sandboxed') === 'unsandboxed' ? (
                        <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          <ShieldAlert size={10} /> Unsandboxed
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          <ShieldCheck size={10} /> Sandboxed
                        </span>
                      )}
                      {tab === 'mine' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ext.status === 'approved' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          ext.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                          'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}>
                          {ext.status === 'approved' && <><CheckCircle size={10} className="inline mr-1" />Approved</>}
                          {ext.status === 'rejected' && <><XCircle size={10} className="inline mr-1" />Rejected</>}
                          {ext.status === 'pending' && <><Clock size={10} className="inline mr-1" />Pending review</>}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[rgb(var(--muted))] mb-2">{ext.description}</p>
                    {(ext.type ?? 'sandboxed') === 'unsandboxed' && (
                      <p className="text-[10px] text-orange-500 flex items-center gap-1 mb-2">
                        <ShieldAlert size={10} /> This extension has full DOM access. Only install if you trust the author.
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-[rgb(var(--muted))]">
                      <span>by {ext.author}</span>
                      {tab === 'browse' && (
                        <span className="flex items-center gap-1"><Download size={11} />{ext.downloads} installs</span>
                      )}
                      {tab === 'mine' && ext.reviewNote && (
                        <span className="flex items-center gap-1 text-orange-500"><AlertCircle size={11} />Reviewer note: {ext.reviewNote}</span>
                      )}
                    </div>
                  </div>

                  {/* Install button */}
                  {tab === 'browse' && (
                    <button
                      onClick={() => handleInstall(ext.id)}
                      disabled={installing[ext.id] || installed[ext.id]}
                      className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                        installed[ext.id] ? 'btn-secondary opacity-70 cursor-default' : 'btn-primary'
                      }`}
                    >
                      {installing[ext.id] ? <Loader2 size={14} className="animate-spin" /> :
                       installed[ext.id] ? <><Check size={14} /> Installed</> :
                       <><Download size={14} /> Install</>}
                    </button>
                  )}

                  {/* Review buttons */}
                  {tab === 'review' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleReview(ext.id, 'approve')}
                        disabled={reviewLoading[ext.id]}
                        className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm"
                      >
                        {reviewLoading[ext.id] ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(ext.id, 'reject')}
                        disabled={reviewLoading[ext.id]}
                        className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm text-red-500"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  )}
                </div>

                {/* Per-extension review note */}
                {tab === 'review' && (
                  <input
                    type="text"
                    placeholder="Optional note to the author..."
                    value={reviewNote[ext.id] || ''}
                    onChange={e => setReviewNote(p => ({ ...p, [ext.id]: e.target.value }))}
                    className="input w-full mt-3 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submit */}
        {tab === 'submit' && (
          <div className="max-w-2xl space-y-5">
            {submitDone ? (
              <div className="text-center py-20 space-y-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgb(var(--text))]">
                  <CheckCircle size={28} className="text-[rgb(var(--bg))]" />
                </div>
                <h2 className="text-2xl font-bold text-[rgb(var(--text))]">Extension submitted!</h2>
                <p className="text-[rgb(var(--muted))]">A moderator will review it before it appears in the marketplace.</p>
                <button onClick={() => setSubmitDone(false)} className="btn-primary px-6 py-2.5 rounded-full">Submit another</button>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Extension ID <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="e.g., yourname.weather" value={submitForm.id} onChange={e => setSubmitForm(p => ({ ...p, id: e.target.value }))} className="input w-full" />
                    <p className="text-xs text-[rgb(var(--muted))] mt-1">Letters, numbers, dots, underscores, dashes. Must be unique.</p>
                  </div>
                  <div>
                    <label className="form-label">Name <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="Weather Tool" value={submitForm.name} onChange={e => setSubmitForm(p => ({ ...p, name: e.target.value }))} className="input w-full" />
                  </div>
                  <div>
                    <label className="form-label">Version <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="1.0.0" value={submitForm.version} onChange={e => setSubmitForm(p => ({ ...p, version: e.target.value }))} className="input w-full" />
                  </div>
                  <div>
                    <label className="form-label">Author display name <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="Your Name" value={submitForm.author} onChange={e => setSubmitForm(p => ({ ...p, author: e.target.value }))} className="input w-full" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Description <span className="text-red-500">*</span></label>
                  <textarea placeholder="What does this extension do?" value={submitForm.description} onChange={e => setSubmitForm(p => ({ ...p, description: e.target.value }))} className="input w-full min-h-[80px] resize-y" />
                </div>
                <div>
                  <label className="form-label mb-2">Extension Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSubmitForm(p => ({ ...p, type: 'sandboxed' }))}
                      className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-colors ${
                        submitForm.type === 'sandboxed'
                          ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10'
                          : 'border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/50'
                      }`}
                    >
                      <ShieldCheck size={15} className="text-green-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">Sandboxed</p>
                        <p className="text-[10px] text-[rgb(var(--muted))] mt-0.5">Tools + UI only. No DOM access.</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubmitForm(p => ({ ...p, type: 'unsandboxed' }))}
                      className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-colors ${
                        submitForm.type === 'unsandboxed'
                          ? 'border-orange-400 bg-orange-500/10'
                          : 'border-[rgb(var(--border))] hover:border-orange-400/50'
                      }`}
                    >
                      <ShieldAlert size={15} className="text-orange-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">Unsandboxed</p>
                        <p className="text-[10px] text-[rgb(var(--muted))] mt-0.5">Full DOM, script injection, api.dom/app.</p>
                      </div>
                    </button>
                  </div>
                  {submitForm.type === 'unsandboxed' && (
                    <p className="text-[10px] text-orange-400 mt-2 flex items-center gap-1">
                      <ShieldAlert size={10} /> Unsandboxed extensions will be reviewed more carefully by moderators.
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Extension Code <span className="text-red-500">*</span></label>
                  <textarea
                    placeholder="// Paste your extension code here..."
                    value={submitForm.code}
                    onChange={e => setSubmitForm(p => ({ ...p, code: e.target.value }))}
                    className="input w-full font-mono text-xs min-h-[320px] resize-y"
                    spellCheck={false}
                  />
                </div>
                {submitError && <p className="text-sm text-red-500">{submitError}</p>}
                <button
                  onClick={handleSubmit}
                  disabled={submitLoading || !submitForm.id || !submitForm.name || !submitForm.description || !submitForm.code}
                  className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-full disabled:opacity-50"
                >
                  {submitLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  Submit for Review
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
