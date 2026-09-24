import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card } from './ui';
import { AlertTriangleIcon, RefreshIcon } from './icons';

/**
 * True when a failure came from loading a code-split chunk. This is the classic
 * cause of a "white screen" after a deploy: an old page references a chunk file
 * that the new release no longer serves. It must be recovered with a *reload*,
 * never with an infinite automatic retry loop.
 */
export function isDynamicImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch|error loading/i.test(
    message,
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this key resets the boundary (e.g. the current route path). */
  resetKey?: string;
  /** Override the default recovery UI. */
  fallback?: (error: Error, retry: () => void, reload: () => void) => ReactNode;
  /** Shown in logs / the toast detail, e.g. "Checkout". */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors of the tree below it so one broken component
 * can never turn the entire application into a blank white page. The user gets
 * a branded recovery card with "Try again" (re-render) and "Reload app".
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.label ?? 'UI';
    // Real error, real console — this is what makes white screens debuggable.
    console.error(`[ONYX] ${label} crashed:`, error, info.componentStack);
    try {
      window.dispatchEvent(
        new CustomEvent('ds:ui-error', {
          detail: { label, message: error.message, at: new Date().toISOString() },
        }),
      );
    } catch {
      // Never let logging throw.
    }
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = (): void => this.setState({ error: null });

  private reload = (): void => window.location.reload();

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.retry, this.reload);

    const chunkIssue = isDynamicImportError(error);
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-10">
        <Card className="duo-top w-full text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-brand">
            <AlertTriangleIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-lg font-extrabold text-slate-900">
            {chunkIssue ? 'A new version is ready' : 'Something went wrong on this screen'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {chunkIssue
              ? 'The app was updated while you were using it. Reload to pick up the newest version — your cart and details are kept.'
              : 'The rest of the app keeps working. Try again, or reload if the problem continues.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {chunkIssue ? (
              <Button onClick={this.reload}>
                <RefreshIcon className="h-4 w-4" aria-hidden="true" />
                Reload app
              </Button>
            ) : (
              <>
                <Button onClick={this.retry}>Try again</Button>
                <Button variant="success" onClick={this.reload}>
                  Reload app
                </Button>
              </>
            )}
          </div>
          <p className="mt-3 break-words text-[11px] font-medium text-slate-400">{error.message}</p>
        </Card>
      </div>
    );
  }
}