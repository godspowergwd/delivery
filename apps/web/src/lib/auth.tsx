import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from '@delivery/shared';
import { api, getCsrfToken, getToken, refreshSession, setTokens } from './api';
import { createAppSocket, type AppSocket } from './socket';

const USER_KEY = 'ds_user';

/**
 * Startup must never hang: if a session call does not settle within the
 * timeout, it rejects and the bootstrap's catch/finally clears the loading
 * state so the app always reaches the login screen (or dashboard).
 */
const BOOTSTRAP_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${BOOTSTRAP_TIMEOUT_MS}ms`)),
      BOOTSTRAP_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function loadCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function cacheUser(user: AuthUser | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  socket: AppSocket | null;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(loadCachedUser);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const socketRef = useRef<AppSocket | null>(null);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    cacheUser(next);
  }, []);

  const applySession = useCallback(
    (payload: { user: AuthUser; accessToken: string; csrfToken?: string }) => {
      setTokens(payload.accessToken, payload.csrfToken ?? null);
      setUser(payload.user);
    },
    [setUser],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        if (getToken()) {
          const { user: me } = await withTimeout(
            api.get<{ user: AuthUser }>('/auth/me'),
            'Session check',
          );
          if (!cancelled) setUser(me);
        } else if (getCsrfToken() || document.cookie.includes('ds_refresh')) {
          const refreshed = await withTimeout(refreshSession(), 'Session refresh');
          if (refreshed && !cancelled) {
            const { user: me } = await withTimeout(
              api.get<{ user: AuthUser }>('/auth/me'),
              'Session check',
            );
            if (!cancelled) setUser(me);
          }
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  // Keep one live socket while signed in; rebuild it when the token changes.
  useEffect(() => {
    const token = getToken();
    if (!user || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }
    const next = createAppSocket(token);
    socketRef.current = next;
    setSocket(next);
    return () => {
      next.disconnect();
      if (socketRef.current === next) {
        socketRef.current = null;
        setSocket(null);
      }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global session expiry -> force a fresh sign in.
  useEffect(() => {
    const handler = () => {
      setUser(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1');
      }
    };
    window.addEventListener('ds:session-expired', handler);
    return () => window.removeEventListener('ds:session-expired', handler);
  }, [setUser]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const data = await api.post<{ user: AuthUser; accessToken: string; csrfToken: string }>(
        '/auth/login',
        payload,
      );
      applySession(data);
      return data.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const data = await api.post<{ user: AuthUser; accessToken: string; csrfToken: string }>(
        '/auth/register',
        payload,
      );
      applySession(data);
      return data.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Sign out must always succeed locally.
    }
    setTokens(null, null);
    setUser(null);
  }, [setUser]);

  const value = useMemo(
    () => ({ user, loading, socket, login, register, logout, setUser }),
    [user, loading, socket, login, register, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
