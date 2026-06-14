// Tracks all DOM side-effects registered by each extension so they can be
// fully cleaned up when an extension is disabled or unloaded.

type Cleanup = () => void;

class ExtensionPatchRegistry {
  private cleanups = new Map<string, Cleanup[]>();

  private get(id: string): Cleanup[] {
    if (!this.cleanups.has(id)) this.cleanups.set(id, []);
    return this.cleanups.get(id)!;
  }

  register(extensionId: string, cleanup: Cleanup): void {
    this.get(extensionId).push(cleanup);
  }

  // ── DOM event listeners ──────────────────────────────────────────────────

  on(
    extensionId: string,
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): Cleanup {
    target.addEventListener(type, handler, options);
    const remove = () => target.removeEventListener(type, handler, options);
    this.register(extensionId, remove);
    return remove;
  }

  // ── Injected <style> tags ────────────────────────────────────────────────

  addStyle(extensionId: string, css: string): Cleanup {
    const el = document.createElement('style');
    el.setAttribute('data-ext', extensionId);
    el.textContent = css;
    document.head.appendChild(el);
    const remove = () => el.remove();
    this.register(extensionId, remove);
    return remove;
  }

  // ── MutationObservers ────────────────────────────────────────────────────

  observe(
    extensionId: string,
    target: Node,
    callback: MutationCallback,
    options: MutationObserverInit,
  ): Cleanup {
    const obs = new MutationObserver(callback);
    obs.observe(target, options);
    const remove = () => obs.disconnect();
    this.register(extensionId, remove);
    return remove;
  }

  // ── Intervals / timeouts ─────────────────────────────────────────────────

  setInterval(extensionId: string, fn: () => void, ms: number): Cleanup {
    const id = window.setInterval(fn, ms);
    const remove = () => window.clearInterval(id);
    this.register(extensionId, remove);
    return remove;
  }

  setTimeout(extensionId: string, fn: () => void, ms: number): Cleanup {
    const id = window.setTimeout(fn, ms);
    const remove = () => window.clearTimeout(id);
    this.register(extensionId, remove);
    return remove;
  }

  // ── Generic registration ─────────────────────────────────────────────────

  onCleanup(extensionId: string, fn: Cleanup): void {
    this.register(extensionId, fn);
  }

  // ── Teardown ─────────────────────────────────────────────────────────────

  cleanup(extensionId: string): void {
    const fns = this.cleanups.get(extensionId) ?? [];
    for (const fn of fns) {
      try { fn(); } catch (e) { console.warn(`[ext:${extensionId}] cleanup error`, e); }
    }
    this.cleanups.delete(extensionId);
  }

  cleanupAll(): void {
    for (const id of [...this.cleanups.keys()]) this.cleanup(id);
  }
}

export const extensionPatchRegistry = new ExtensionPatchRegistry();
