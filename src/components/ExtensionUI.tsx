import { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { extensionUIRegistry } from '../extensions/extensionUIRegistry';
import type { ExtAlert, ExtConfirm, ExtPrompt, ExtModal, ExtToast, AlertType } from '../extensions/extensionUIRegistry';

function useExtUI() {
  const [, tick] = useState(0);
  useEffect(() => {
    const handler = () => tick(n => n + 1);
    window.addEventListener('ext-ui-update', handler);
    return () => window.removeEventListener('ext-ui-update', handler);
  }, []);
}

// ── Icon helper ──────────────────────────────────────────────────────────────

function TypeIcon({ type, size = 20 }: { type: AlertType; size?: number }) {
  const cls: Record<AlertType, string> = {
    info: 'text-blue-500',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500',
  };
  const icons: Record<AlertType, React.ReactNode> = {
    info: <Info size={size} />,
    success: <CheckCircle size={size} />,
    warning: <AlertTriangle size={size} />,
    error: <AlertCircle size={size} />,
  };
  return <span className={cls[type]}>{icons[type]}</span>;
}

// ── Sanitize HTML for modal bodies ───────────────────────────────────────────

function sanitizeHTML(html: string): string {
  // Strip script/style tags and event attributes
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

// ── Dialog backdrop ──────────────────────────────────────────────────────────

function Backdrop({ onClick }: { onClick?: () => void }) {
  return <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]" onClick={onClick} />;
}

function DialogBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto animate-scale-in">
        {children}
      </div>
    </div>
  );
}

// ── Alert ────────────────────────────────────────────────────────────────────

function AlertDialog({ item }: { item: ExtAlert }) {
  return (
    <>
      <Backdrop onClick={item.resolve} />
      <DialogBox>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <TypeIcon type={item.type} />
            <div className="flex-1 min-w-0">
              {item.title && <h3 className="font-semibold text-[rgb(var(--text))] mb-1">{item.title}</h3>}
              <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">{item.message}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={item.resolve} className="btn-primary px-5 py-2 rounded-full text-sm">
              {item.confirmLabel}
            </button>
          </div>
        </div>
      </DialogBox>
    </>
  );
}

// ── Confirm ──────────────────────────────────────────────────────────────────

function ConfirmDialog({ item }: { item: ExtConfirm }) {
  return (
    <>
      <Backdrop onClick={() => item.resolve(false)} />
      <DialogBox>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            {item.type && <TypeIcon type={item.type} />}
            <div className="flex-1 min-w-0">
              {item.title && <h3 className="font-semibold text-[rgb(var(--text))] mb-1">{item.title}</h3>}
              <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">{item.message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => item.resolve(false)} className="btn-secondary px-4 py-2 rounded-full text-sm">
              {item.cancelLabel}
            </button>
            <button onClick={() => item.resolve(true)} className="btn-primary px-5 py-2 rounded-full text-sm">
              {item.confirmLabel}
            </button>
          </div>
        </div>
      </DialogBox>
    </>
  );
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function PromptDialog({ item }: { item: ExtPrompt }) {
  const [value, setValue] = useState(item.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <>
      <Backdrop onClick={() => item.resolve(null)} />
      <DialogBox>
        <div className="p-5 space-y-4">
          {item.title && <h3 className="font-semibold text-[rgb(var(--text))]">{item.title}</h3>}
          <p className="text-sm text-[rgb(var(--muted))]">{item.message}</p>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={item.placeholder}
            className="input w-full"
            onKeyDown={e => {
              if (e.key === 'Enter') item.resolve(value);
              if (e.key === 'Escape') item.resolve(null);
            }}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => item.resolve(null)} className="btn-secondary px-4 py-2 rounded-full text-sm">Cancel</button>
            <button onClick={() => item.resolve(value)} className="btn-primary px-5 py-2 rounded-full text-sm">OK</button>
          </div>
        </div>
      </DialogBox>
    </>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

function ModalDialog({ item, onClose }: { item: ExtModal; onClose: () => void }) {
  const widthClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }[item.width ?? 'md'];

  return (
    <>
      <Backdrop onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className={`bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl shadow-2xl w-full ${widthClass} pointer-events-auto animate-scale-in max-h-[80vh] flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--border))] shrink-0">
            <h3 className="font-semibold text-[rgb(var(--text))]">{item.title}</h3>
            <button onClick={onClose} className="btn-icon"><X size={16} /></button>
          </div>
          {/* Body */}
          <div
            className="flex-1 overflow-y-auto px-5 py-4 text-sm text-[rgb(var(--text))] leading-relaxed prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHTML(item.body) }}
          />
          {/* Footer */}
          {item.buttons && item.buttons.length > 0 && (
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[rgb(var(--border))] shrink-0">
              {item.buttons.map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.onClick}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    btn.danger
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : btn.primary
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────

function ToastStack() {
  useExtUI();
  const toasts = extensionUIRegistry.toasts;
  if (toasts.length === 0) return null;

  const bg: Record<string, string> = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className="fixed bottom-4 right-4 z-[210] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${bg[t.type]} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 pointer-events-auto animate-slide-in-up max-w-xs text-sm`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => extensionUIRegistry.dismissToast(t.id)}
            className="opacity-70 hover:opacity-100 transition-opacity shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Root renderer ─────────────────────────────────────────────────────────────

export default function ExtensionUI() {
  useExtUI();

  const alerts = extensionUIRegistry.alerts;
  const confirms = extensionUIRegistry.confirms;
  const prompts = extensionUIRegistry.prompts;
  const modals = extensionUIRegistry.modals;

  const topAlert = alerts[0];
  const topConfirm = confirms[0];
  const topPrompt = prompts[0];
  const topModal = modals[modals.length - 1];

  return (
    <>
      <ToastStack />
      {topAlert && <AlertDialog key={topAlert.id} item={topAlert} />}
      {!topAlert && topConfirm && <ConfirmDialog key={topConfirm.id} item={topConfirm} />}
      {!topAlert && !topConfirm && topPrompt && <PromptDialog key={topPrompt.id} item={topPrompt} />}
      {topModal && (
        <ModalDialog
          key={topModal.id}
          item={topModal}
          onClose={() => {
            extensionUIRegistry.modals = extensionUIRegistry.modals.filter(m => m.id !== topModal.id);
            topModal.onClose?.();
            window.dispatchEvent(new CustomEvent('ext-ui-update'));
          }}
        />
      )}
    </>
  );
}
