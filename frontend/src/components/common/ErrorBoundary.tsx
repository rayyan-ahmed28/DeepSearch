import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** What failed, for the message ("this panel", "the chart"). */
  label?: string;
  /** Compact card for a single panel instead of a full-page message. */
  inline?: boolean;
  /** When this changes (e.g. the route), the boundary tries again. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Catches a rendering crash so one broken component never blanks the app.
 * Wraps every page (in AppShell) and the heavier panels (charts, report body).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`DeepSearch: ${this.props.label ?? "a page"} failed to render`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const what = this.props.label ?? "this page";
    const retry = () => this.setState({ error: null });

    if (this.props.inline) {
      return (
        <div role="alert" className="p-4 rounded-xl border border-error/40 bg-error/5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
          <div className="flex flex-col gap-2 min-w-0">
            <p className="font-body-md text-body-md text-on-surface">Could not display {what}.</p>
            <p className="font-label-code-sm text-label-code-sm text-outline break-words">{error.message}</p>
            <button type="button" onClick={retry} className="self-start flex items-center gap-1.5 font-body-sm text-body-sm text-primary hover:underline">
              <RotateCcw size={13} /> Try again
            </button>
          </div>
        </div>
      );
    }
    return (
      <div role="alert" className="w-full max-w-xl mx-auto px-6 py-24 flex flex-col items-center text-center gap-4">
        <AlertTriangle size={32} className="text-error" />
        <h1 className="font-headline-md text-headline-md text-on-surface">Something went wrong on {what}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          The rest of DeepSearch still works, and your runs are safe. Try again, or go back to the Dashboard.
        </p>
        <p className="font-label-code-sm text-label-code-sm text-outline break-words">{error.message}</p>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={retry} className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-medium font-body-md text-body-md">
            Try again
          </button>
          <a href="/dashboard" className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-md text-body-md">
            Dashboard
          </a>
        </div>
      </div>
    );
  }
}
