import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center min-h-screen bg-[rgb(var(--bg))]">
            <div className="text-center p-8">
              <h2 className="text-lg font-semibold text-red-500 mb-2">Something went wrong</h2>
              <p className="text-[rgb(var(--muted))] mb-4">
                An error occurred while rendering this component.
              </p>
              <details className="text-left">
                <summary className="cursor-pointer text-sm text-[rgb(var(--text))] hover:text-[rgb(var(--accent))]">
                  Error Details
                </summary>
                <pre className="mt-2 p-4 bg-[rgb(var(--panel))] rounded text-xs overflow-auto text-[rgb(var(--muted))]">
                  {this.state.error?.stack}
                </pre>
              </details>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary mt-4"
              >
                Reload Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
