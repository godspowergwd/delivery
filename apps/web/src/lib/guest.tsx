import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ProductDTO } from '@delivery/shared';
import { useAuth } from './auth';
import { useCart, type CartLine } from './cart';
import { toast } from './realtime';

/**
 * Guest mode (Bolt Food style).
 *
 * Visitors browse the entire storefront — home, categories, food cards,
 * details, search, map preview, promotions and settings — without an account.
 * The moment a guest attempts a protected action (add to cart, order now,
 * checkout, favorite, track orders, order history, contact driver, save
 * address) the in-app login route opens, and the attempted action is
 * remembered so it runs automatically after authentication.
 *
 * Serializable actions also survive a full page navigation (the Create
 * Account path), so "sign in then the item is added" works either way.
 */
export type SerializedAction =
  | { type: 'ADD_TO_CART'; line: CartLine }
  | { type: 'NAVIGATE'; to: string };

const PENDING_KEY = 'ds_pending_action_v1';

interface PendingAction {
  /** In-memory continuation used by the in-app login route. */
  run?: () => void;
}

function readStoredAction(): SerializedAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as SerializedAction) : null;
  } catch {
    return null;
  }
}

function storeAction(action: SerializedAction | null): void {
  try {
    if (action) sessionStorage.setItem(PENDING_KEY, JSON.stringify(action));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private mode: the in-memory path still works.
  }
}

/** Stash a serializable action so a full-page registration can replay it. */
export function stashPendingAction(action: SerializedAction | null): void {
  storeAction(action);
}

/** Applies a remembered cart line, merging with existing quantities. */
export function applyCartLine(
  line: CartLine,
  add: ReturnType<typeof useCart>['add'],
  current: CartLine[],
  setQuantity: ReturnType<typeof useCart>['setQuantity'],
): void {
  const existing = current.find((entry) => entry.productId === line.productId);
  if (existing) {
    setQuantity(line.productId, existing.quantity + line.quantity);
    return;
  }
  const product: ProductDTO = {
    id: line.productId,
    name: line.name,
    description: '',
    imageUrl: line.imageUrl,
    price: line.unitPrice,
    ingredients: [],
    prepTimeMinutes: 15,
    isAvailable: true,
    stock: 999,
    isArchived: false,
    isPopular: false,
    isNew: false,
    categoryId: '',
    categoryName: '',
    categorySlug: '',
    createdAt: '',
    updatedAt: '',
  };
  add(product, line.quantity, line.notes ?? null);
}

/** Replays a stashed action after an account has been created. No-op otherwise. */
export function replayStashedAction(
  runCartAdd: (line: CartLine) => void,
  navigate: (to: string) => void,
): void {
  const action = readStoredAction();
  if (!action) return;
  storeAction(null);
  if (action.type === 'ADD_TO_CART') runCartAdd(action.line);
  else navigate(action.to);
}

interface GuestGateValue {
  /** Opens the authoritative in-app login route. */
  openLogin: () => void;
  /**
  * Runs `action` immediately for signed-in visitors; otherwise opens login
  * and remembers the action. Returns true when it ran.
   */
  requireAuth: (action: () => void, serialized?: SerializedAction) => boolean;
  /**
   * Runs the remembered action (called right after any sign-in flow).
   * Returns what happened so full-page auth screens can route sensibly.
   */
  flushPending: () => 'none' | 'ran' | 'nav' | 'cart';
}

const GuestGateContext = createContext<GuestGateValue | null>(null);

export function GuestGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { lines, add, setQuantity } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingRef = useRef<PendingAction | null>(null);

  const openLogin = useCallback(() => {
    navigate('/login', { state: { from: location.pathname } });
  }, [location.pathname, navigate]);

  const flushPending = useCallback((): 'none' | 'ran' | 'nav' | 'cart' => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending?.run) {
      pending.run();
      return 'ran';
    }
    // A stashed action may have been placed by the Create Account flow.
    const stored = readStoredAction();
    if (!stored) return 'none';
    storeAction(null);
    if (stored.type === 'NAVIGATE') {
      navigate(stored.to);
      return 'nav';
    }
    applyCartLine(stored.line, add, lines, setQuantity);
    toast(`Added ${stored.line.quantity} × ${stored.line.name}`, 'success');
    return 'cart';
  }, [add, lines, navigate, setQuantity]);

  const requireAuth = useCallback(
    (action: () => void, serialized?: SerializedAction): boolean => {
      if (user) {
        action();
        return true;
      }
      pendingRef.current = { run: action };
      storeAction(serialized ?? null);
      openLogin();
      return false;
    },
    [user, openLogin],
  );

  const value = useMemo<GuestGateValue>(
    () => ({ openLogin, requireAuth, flushPending }),
    [openLogin, requireAuth, flushPending],
  );

  return <GuestGateContext.Provider value={value}>{children}</GuestGateContext.Provider>;
}

export function useGuestGate(): GuestGateValue {
  const ctx = useContext(GuestGateContext);
  if (!ctx) throw new Error('useGuestGate must be used inside <GuestGateProvider>');
  return ctx;
}
