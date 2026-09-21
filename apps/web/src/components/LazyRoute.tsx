import { Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Spinner } from './ui';
import { PageTransition } from './motion';

/** Route-level code splitting: each surface loads on demand. */
export function LazyRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-label="Loading page">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <PageTransition routeKey={location.pathname}>{children}</PageTransition>
    </Suspense>
  );
}
