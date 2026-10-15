import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ProductDTO } from '@delivery/shared';

export interface CartLine {
  lineId?: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  notes?: string | null;
  customizationChoices?: Record<string, string[]>;
}

const CART_KEY = 'ds_cart_v1';

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((line) => line.productId && line.quantity > 0)
          .map((line, index) => ({ ...line, lineId: line.lineId ?? `${line.productId}-${index}` }))
      : [];
  } catch {
    return [];
  }
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  add: (
    product: ProductDTO,
    quantity?: number,
    notes?: string | null,
    customizationChoices?: Record<string, string[]>,
  ) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  setNotes: (lineId: string, notes: string) => void;
  remove: (lineId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      // Storage failures (private mode / quota) must never blank the UI.
    }
  }, [lines]);

  const add = useCallback((
    product: ProductDTO,
    quantity = 1,
    notes?: string | null,
    customizationChoices?: Record<string, string[]>,
  ) => {
    setLines((current) => {
      const choicesKey = JSON.stringify(Object.entries(customizationChoices ?? {}).sort(([a], [b]) => a.localeCompare(b)));
      const existing = current.find(
        (line) =>
          line.productId === product.id &&
          (line.notes ?? null) === (notes ?? null) &&
          JSON.stringify(Object.entries(line.customizationChoices ?? {}).sort(([a], [b]) => a.localeCompare(b))) === choicesKey,
      );
      if (existing) {
        return current.map((line) =>
          line.lineId === existing.lineId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [
        ...current,
        {
          lineId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          productId: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          unitPrice: product.price,
          quantity,
          notes: notes ?? null,
          customizationChoices,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.lineId !== lineId)
        : current.map((line) => (line.lineId === lineId ? { ...line, quantity } : line)),
    );
  }, []);

  const setNotes = useCallback((lineId: string, notes: string) => {
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, notes } : line)),
    );
  }, []);

  const remove = useCallback((lineId: string) => {
    setLines((current) => current.filter((line) => line.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    return { lines, itemCount, subtotal, add, setQuantity, setNotes, remove, clear };
  }, [lines, add, setQuantity, setNotes, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
