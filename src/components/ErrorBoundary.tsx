import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  // When true, renders a compact inline fallback instead of a full-page one —
  // used around <Routes> so a page-level crash doesn't take the Header with it.
  inline?: boolean;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const content = (
      <div className="card p-8 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-950/40 border border-red-900/50 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h1 className="font-display text-xl text-white tracking-wide">Something went wrong</h1>
          <p className="text-sm text-turf-500 mt-1">
            An unexpected error occurred. Reloading usually fixes it.
          </p>
        </div>
        <button onClick={() => window.location.reload()} className="btn-primary w-full">
          Reload
        </button>
      </div>
    );

    if (this.props.inline) {
      return <div className="flex items-center justify-center py-16 px-4">{content}</div>;
    }

    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        {content}
      </div>
    );
  }
}
