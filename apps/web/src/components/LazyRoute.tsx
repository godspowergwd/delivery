import { Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Spinner } from './ui';
import { PageTransition } from './motion';

/**
 * Route-level code splitting: each surface loads on demand and renders inside
 * its own error boundary, so a failed chunk or a crashing page shows a
 * recovery card instead of a blank white screen — while the shell, navigation
 * and every other page keep working.
 */
export function LazyRoute({ children, label }: { children: ReactNode; label?: string }) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname} label={label ?? `Route ${location.pathname}`}>
      <Suspense
        fallback={
          <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-label="Loading page">
            <Spinner className="h-8 w-8" />
          </div>
        }
      >
        <PageTransition routeKey={location.pathname}>{children}</PageTransition>
      </Suspense>
    </ErrorBoundary>
  );
}
