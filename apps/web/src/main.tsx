import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider, useAuth } from './lib/auth';
import { CartProvider } from './lib/cart';
import { GuestGateProvider } from './lib/guest';
import { useRealtimeSync } from './lib/realtime';
import { setupPwa } from './lib/pwa';
import { installBootSplashSafetyNet, removeBootSplash } from './lib/boot-splash';
import { Toaster } from './components/ui';
import { AuthSheet } from './components/AuthSheet';
import './styles.css';

setupPwa();
installBootSplashSafetyNet();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/** Bridges the realtime socket into the query cache once the app mounts. */
function RealtimeBridge() {
  useRealtimeSync();
  return null;
}

/** Toaster + realtime need the auth context, so they mount inside it. */
function Chrome() {
  useRealtimeSync();
  const { loading } = useAuth();

  // Hand the screen over from the static boot splash in index.html as soon as
  // React mounts (Chrome shows its own spinner while auth initializes).
  useEffect(() => {
    removeBootSplash();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-red-100 border-t-green-600" />
      </div>
    );
  }
  return (
    <>
      <RealtimeBridge />
      <App />
      <AuthSheet />
      <Toaster />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <GuestGateProvider>
              <Chrome />
            </GuestGateProvider>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
