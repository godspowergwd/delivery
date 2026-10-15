import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
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
 * address) the premium sign-in sheet slides up, and the attempted action is
 * remembered so it runs automatically after authentication.
 *
 * Serializable actions also survive a full page navigation (the Create
 * Account path), so "sign in then the item is added" works either way.
 */
export type SerializedAction =
  | { type: 'ADD_TO_CART'; line: CartLine }
  | { type: 'ADD_TO_CART_BUNDLE'; lines: CartLine[] }
  | { type: 'NAVIGATE'; to: string };

const PENDING_KEY = 'ds_pending_action_v1';

interface PendingAction {
  /** In-memory continuation used by the inline sign-in sheet. */
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
): void {
  const product: ProductDTO = {
    id: line.productId,
    productType: 'STANDARD',
    isBaseIngredient: false,
    name: line.name,
    description: '',
    imageUrl: line.imageUrl,
    price: line.unitPrice,
    ingredients: [],
    customizationOptions: [],
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
  add(product, line.quantity, line.notes ?? null, line.customizationChoices);
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
  else if (action.type === 'ADD_TO_CART_BUNDLE') action.lines.forEach(runCartAdd);
  else navigate(action.to);
}

interface GuestGateValue {
  /** Always false: the modal sheet is removed, login is a dedicated page. */
  sheetOpen: boolean;
  /** Navigates to /login (kept for compatibility with existing call sites). */
  openSheet: () => void;
  closeSheet: () => void;
  /**
   * Runs `action` immediately for signed-in visitors; otherwise stashes it
   * and navigates to /login. Returns true when it ran.
   */
  requireAuth: (action: () => void, serialized?: SerializedAction) => boolean;
  /**
   * Runs the remembered action (called right after any sign-in flow).
   * Returns what happened so full-page auth screens can route sensibly.
   */
  flushPending: () => 'none' | 'ran' | 'nav' | 'cart';
  /** Closes the sheet but keeps the stashed action, then opens registration. */
  goRegister: () => void;
}

const GuestGateContext = createContext<GuestGateValue | null>(null);

export function GuestGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { add } = useCart();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);

  const flushPending = useCallback((): 'none' | 'ran' | 'nav' | 'cart' => {
    setSheetOpen(false);
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
    if (stored.type === 'ADD_TO_CART') {
      applyCartLine(stored.line, add);
      toast(`Added ${stored.line.quantity} × ${stored.line.name}`, 'success');
      return 'cart';
    }
    stored.lines.forEach((line) => applyCartLine(line, add));
    toast('Customized waakye added to your cart', 'success');
    return 'cart';
  }, [add, navigate]);

  const requireAuth = useCallback(
    (action: () => void, serialized?: SerializedAction): boolean => {
      if (user) {
        action();
        return true;
      }
      // No modal login: stash the action and navigate to the dedicated page.
      pendingRef.current = { run: action };
      storeAction(serialized ?? null);
      setSheetOpen(false);
      navigate('/login', { state: { from: window.location.pathname } });
      return false;
    },
    [user, navigate],
  );

  const openSheet = useCallback(() => {
    pendingRef.current = null;
    navigate('/login', { state: { from: window.location.pathname } });
  }, [navigate]);

  const closeSheet = useCallback(() => {
    pendingRef.current = null;
    storeAction(null);
    setSheetOpen(false);
  }, []);

  const goRegister = useCallback(() => {
    // Keep the stashed action so the item/destination resumes after sign-up.
    pendingRef.current = null;
    setSheetOpen(false);
    navigate('/register');
  }, [navigate]);

  const value = useMemo<GuestGateValue>(
    () => ({ sheetOpen, openSheet, closeSheet, requireAuth, flushPending, goRegister }),
    [sheetOpen, openSheet, closeSheet, requireAuth, flushPending, goRegister],
  );

  return <GuestGateContext.Provider value={value}>{children}</GuestGateContext.Provider>;
}

export function useGuestGate(): GuestGateValue {
  const ctx = useContext(GuestGateContext);
  if (!ctx) throw new Error('useGuestGate must be used inside <GuestGateProvider>');
  return ctx;
}
