import { Component, ErrorInfo, ReactNode } from 'react';

const DISABLE_EXT_KEY = 'lumina-disable-extensions-once';

export function shouldSkipExtensions(): boolean {
  if (localStorage.getItem(DISABLE_EXT_KEY) === '1') {
    localStorage.removeItem(DISABLE_EXT_KEY);
    return true;
  }
  return false;
}

function reloadWithoutExtensions() {
  localStorage.setItem(DISABLE_EXT_KEY, '1');
  window.location.reload();
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface Props {
  children: ReactNode;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { error, errorInfo } = this.state;

    return (
      <div className="fixed inset-0 bg-[rgb(var(--bg))] flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-red-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-[rgb(var(--text))] mb-2 text-center">Something went wrong</h1>
        <p className="text-[rgb(var(--muted))] text-center max-w-md mb-2">
          An unexpected error crashed the app. This can sometimes be caused by an unsandboxed extension modifying the page.
        </p>

        {/* Error message */}
        <div className="w-full max-w-lg bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm font-mono text-red-400 break-all">{error.message || String(error)}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 w-full max-w-sm">
          <button
            onClick={() => window.location.reload()}
            className="btn-primary flex-1 py-2.5 px-5 text-sm font-medium"
          >
            Reload
          </button>
          <button
            onClick={reloadWithoutExtensions}
            className="flex-1 py-2.5 px-5 text-sm font-medium rounded-lg border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-colors"
          >
            Reload without extensions
          </button>
        </div>

        {/* Stack trace */}
        <div className="w-full max-w-2xl">
          <details className="group">
            <summary className="cursor-pointer text-xs text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors list-none flex items-center gap-1.5 select-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 transition-transform group-open:rotate-90">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
              </svg>
              Stack trace
            </summary>
            <pre className="mt-3 p-4 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl text-[10px] font-mono text-[rgb(var(--muted))] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {error.stack}
              {errorInfo?.componentStack && `\n\nReact component stack:${errorInfo.componentStack}`}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
