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
import { api, clearAuthStorage, getCsrfToken, getToken, hasRefreshCookie, refreshSession, setTokens } from './api';
import { createAppSocket, type AppSocket } from './socket';

const USER_KEY = 'ds_user';

/**
 * Sessions are INDEFINITE: a signed-in visitor stays signed in until they press
 * Sign out (or an administrator revokes the session / disables the account).
 *
 * The bootstrap only ends in `loading: false` — it always resolves. A slow or
 * temporarily unreachable API is treated as *transient*: the cached identity is
 * kept and the restore is retried in the background. A network hiccup must
 * never sign a user out.
 */
const BOOTSTRAP_TIMEOUT_MS = 20_000;
/** Background restore attempts after a transient failure (then visibility/online events take over). */
const MAX_RESTORE_ATTEMPTS = 6;
/** How often the session is slid forward while the app is in use. */
const SLIDE_INTERVAL_MS = 6 * 60 * 60_000;
const LAST_SLIDE_KEY = 'ds_last_slide';

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

/**
 * True when this browser might still hold a refresh session (the CSRF companion
 * cookie/token is readable; the refresh cookie itself is httpOnly by design,
 * so on cross-origin deployments we also sniff document.cookie — when it is
 * visible — and always attempt a refresh if a cached token exists).
 */
function hasRefreshHint(): boolean {
  try {
    if (getCsrfToken()) return true;
    if (getToken()) return true;
    if (hasRefreshCookie()) return true;
    return document.cookie.includes('ds_refresh') || document.cookie.includes('ds_csrf');
  } catch {
    return Boolean(getCsrfToken() || getToken());
  }
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
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Private-mode / quota failures must never break auth.
  }
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
    let retryTimer = 0;
    const cached = loadCachedUser();

    const finish = () => {
      if (!cancelled) setLoading(false);
    };

    const retryLater = (attempt: number) => {
      if (cancelled || attempt >= MAX_RESTORE_ATTEMPTS) return;
      retryTimer = window.setTimeout(
        () => void restore(attempt + 1),
        Math.min(60_000, 2_000 * 2 ** attempt),
      );
    };

    /**
     * Restores the session without ever punishing a valid user for a slow or
     * offline API: only an explicit "refresh refused" signs them out.
     */
    const restore = async (attempt = 0): Promise<void> => {
      const token = getToken();
      const hint = hasRefreshHint();
      if (!token && !hint) {
        finish();
        return;
      }
      try {
        if (token) {
          try {
            const { user: me } = await withTimeout(
              api.get<{ user: AuthUser }>('/auth/me'),
              'Session check',
            );
            if (!cancelled) setUser(me);
            finish();
            return;
          } catch (meError) {
            // The access token is expired but the httpOnly refresh session may
            // still be alive: fall through to the refresh below instead of
            // signing anyone out.
            const status = (meError as { status?: number })?.status;
            const code = (meError as { code?: string })?.code;
            const refreshable =
              status === 401 || code === 'SESSION_EXPIRED' || code === 'UNAUTHORIZED';
            if (!refreshable) throw meError;
          }
        }
        const refreshed = await withTimeout(refreshSession(), 'Session refresh');
        if (refreshed) {
          const { user: me } = await withTimeout(
            api.get<{ user: AuthUser }>('/auth/me'),
            'Session check',
          );
          if (!cancelled) setUser(me);
          finish();
          return;
        }
        // The server actively refused a renewal: the session really is gone
        // (signed out elsewhere, revoked, or the account was disabled).
        if (!cancelled) {
          clearAuthStorage();
          setUser(null);
        }
        finish();
      } catch {
        // Transient: cold API, offline, flaky network. Keep the cached user and
        // retry quietly — never sign anyone out because of a timeout.
        if (!cancelled && cached) setUser(cached);
        finish();
        retryLater(attempt);
      }
    };

    void restore();

    // Coming back to the app (or back online) is the natural moment to finish a
    // restore that failed while offline.
    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      if (getToken()) return;
      if (!hasRefreshHint()) return;
      void restore(MAX_RESTORE_ATTEMPTS);
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [setUser]);

  /**
   * Slides the refresh session forward while the app is in use, so the login
   * never reaches an expiry window in the first place. Runs at most every
   * `SLIDE_INTERVAL_MS` (persisted, so reloads do not spam the endpoint) and
   * also whenever a backgrounded tab becomes visible again.
   */
  useEffect(() => {
    if (!user) return;
    const slide = () => {
      if (document.visibilityState !== 'visible') return;
      let last = 0;
      try {
        last = Number(localStorage.getItem(LAST_SLIDE_KEY) ?? 0);
      } catch {
        last = 0;
      }
      if (Date.now() - last < SLIDE_INTERVAL_MS) return;
      try {
        localStorage.setItem(LAST_SLIDE_KEY, String(Date.now()));
      } catch {
        // Storage unavailable: sliding still works in-memory via the interval.
      }
      void refreshSession().catch(() => undefined);
    };
    const timer = window.setInterval(slide, SLIDE_INTERVAL_MS);
    document.addEventListener('visibilitychange', slide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', slide);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The server rejected the session (revoked, password changed, account
   * disabled). Show the real sign-in screen — respecting the app's base path so
   * a deployment under a sub-path can never land on a 404.
   */
  useEffect(() => {
    const handler = () => {
      setUser(null);
      try {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
        const here = window.location.pathname;
        if (here.endsWith('/login') || here.includes('/login?') || here.endsWith('/register')) return;
        window.location.assign(`${base}/login?expired=1`);
      } catch {
        // Never let a redirect failure blank the app.
      }
    };
    window.addEventListener('ds:session-expired', handler);
    return () => window.removeEventListener('ds:session-expired', handler);
  }, [setUser]);

  // Keep one live socket while signed in; rebuild it when the token changes
  // (including silent refreshes) so realtime never runs on an expired token.
  const [socketToken, setSocketToken] = useState<string | null>(null);
  useEffect(() => {
    const syncToken = () => setSocketToken(getToken());
    syncToken();
    window.addEventListener('ds:token-refreshed', syncToken);
    return () => window.removeEventListener('ds:token-refreshed', syncToken);
  }, [user?.id]);
  useEffect(() => {
    const token = socketToken ?? getToken();
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
  }, [user?.id, socketToken]);

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
    clearAuthStorage();
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
