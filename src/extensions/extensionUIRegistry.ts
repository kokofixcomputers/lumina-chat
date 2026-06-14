// Central registry for all extension-registered UI elements and active dialogs.
// React components subscribe to 'ext-ui-update' events and re-read the registry.

export type ToastType = 'info' | 'success' | 'warning' | 'error';
export type AlertType = 'info' | 'success' | 'warning' | 'error';
export type ButtonLocation = 'chat-toolbar' | 'sidebar';

export interface ExtButton {
  id: string;
  extensionId: string;
  label: string;
  icon?: string;           // emoji or short text
  tooltip?: string;
  location: ButtonLocation;
  onClick: () => void;
}

export interface ExtSidebarSection {
  id: string;
  extensionId: string;
  title?: string;
  items: Array<{ id: string; label: string; icon?: string; onClick: () => void }>;
}

export interface ExtToast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;        // ms; 0 = sticky
}

export interface ExtAlert {
  id: string;
  title?: string;
  message: string;
  type: AlertType;
  confirmLabel?: string;
  resolve: () => void;
}

export interface ExtConfirm {
  id: string;
  title?: string;
  message: string;
  type?: AlertType;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (result: boolean) => void;
}

export interface ExtPrompt {
  id: string;
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
}

export interface ExtModalButton {
  label: string;
  primary?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export interface ExtModal {
  id: string;
  title: string;
  body: string;            // HTML string — rendered sanitized
  width?: 'sm' | 'md' | 'lg';
  buttons?: ExtModalButton[];
  onClose?: () => void;
}

function uid() { return Math.random().toString(36).slice(2); }
function emit() { window.dispatchEvent(new CustomEvent('ext-ui-update')); }

class ExtensionUIRegistry {
  buttons: Map<string, ExtButton> = new Map();
  sidebarSections: Map<string, ExtSidebarSection> = new Map();
  toasts: ExtToast[] = [];
  alerts: ExtAlert[] = [];
  confirms: ExtConfirm[] = [];
  prompts: ExtPrompt[] = [];
  modals: ExtModal[] = [];

  // ── Buttons ──────────────────────────────────────────────────────────────

  addButton(opts: Omit<ExtButton, 'id'> & { id?: string }): () => void {
    const id = opts.id ?? uid();
    this.buttons.set(id, { ...opts, id });
    emit();
    return () => { this.buttons.delete(id); emit(); };
  }

  removeButtonsByExtension(extensionId: string) {
    for (const [id, btn] of this.buttons) {
      if (btn.extensionId === extensionId) this.buttons.delete(id);
    }
    emit();
  }

  getButtons(location: ButtonLocation): ExtButton[] {
    return Array.from(this.buttons.values()).filter(b => b.location === location);
  }

  // ── Sidebar sections ─────────────────────────────────────────────────────

  addSidebarSection(opts: Omit<ExtSidebarSection, 'id'> & { id?: string }): () => void {
    const id = opts.id ?? uid();
    this.sidebarSections.set(id, { ...opts, id });
    emit();
    return () => { this.sidebarSections.delete(id); emit(); };
  }

  removeSidebarSectionsByExtension(extensionId: string) {
    for (const [id, sec] of this.sidebarSections) {
      if (sec.extensionId === extensionId) this.sidebarSections.delete(id);
    }
    emit();
  }

  getSidebarSections(): ExtSidebarSection[] {
    return Array.from(this.sidebarSections.values());
  }

  // ── Toasts ───────────────────────────────────────────────────────────────

  toast(message: string, opts: { type?: ToastType; duration?: number } = {}): void {
    const t: ExtToast = {
      id: uid(), message,
      type: opts.type ?? 'info',
      duration: opts.duration ?? 3500,
    };
    this.toasts = [...this.toasts, t];
    emit();
    if (t.duration > 0) {
      setTimeout(() => { this.dismissToast(t.id); }, t.duration);
    }
  }

  dismissToast(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    emit();
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  alert(message: string, opts: { title?: string; type?: AlertType; confirmLabel?: string } = {}): Promise<void> {
    return new Promise(resolve => {
      const item: ExtAlert = {
        id: uid(), message,
        title: opts.title,
        type: opts.type ?? 'info',
        confirmLabel: opts.confirmLabel ?? 'OK',
        resolve: () => { this.alerts = this.alerts.filter(a => a.id !== item.id); emit(); resolve(); },
      };
      this.alerts = [...this.alerts, item];
      emit();
    });
  }

  // ── Confirms ─────────────────────────────────────────────────────────────

  confirm(message: string, opts: { title?: string; type?: AlertType; confirmLabel?: string; cancelLabel?: string } = {}): Promise<boolean> {
    return new Promise(resolve => {
      const item: ExtConfirm = {
        id: uid(), message,
        title: opts.title,
        type: opts.type ?? 'info',
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        resolve: (result) => { this.confirms = this.confirms.filter(c => c.id !== item.id); emit(); resolve(result); },
      };
      this.confirms = [...this.confirms, item];
      emit();
    });
  }

  // ── Prompts ──────────────────────────────────────────────────────────────

  prompt(message: string, opts: { title?: string; placeholder?: string; defaultValue?: string } = {}): Promise<string | null> {
    return new Promise(resolve => {
      const item: ExtPrompt = {
        id: uid(), message,
        title: opts.title,
        placeholder: opts.placeholder,
        defaultValue: opts.defaultValue ?? '',
        resolve: (value) => { this.prompts = this.prompts.filter(p => p.id !== item.id); emit(); resolve(value); },
      };
      this.prompts = [...this.prompts, item];
      emit();
    });
  }

  // ── Modals ───────────────────────────────────────────────────────────────

  openModal(opts: Omit<ExtModal, 'id'>): () => void {
    const id = uid();
    const modal: ExtModal = { ...opts, id };
    this.modals = [...this.modals, modal];
    emit();
    const close = () => {
      this.modals = this.modals.filter(m => m.id !== id);
      opts.onClose?.();
      emit();
    };
    // Patch buttons so they can close the modal implicitly
    if (modal.buttons) {
      modal.buttons = modal.buttons.map(btn => ({
        ...btn,
        onClick: () => { btn.onClick(); close(); },
      }));
    }
    return close;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  removeAllByExtension(extensionId: string) {
    this.removeButtonsByExtension(extensionId);
    this.removeSidebarSectionsByExtension(extensionId);
  }
}

export const extensionUIRegistry = new ExtensionUIRegistry();
