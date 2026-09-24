import { clsx } from 'clsx';
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from 'react';
import { ORDER_STATUS_TONE, type OrderStatus } from '@delivery/shared';
import type { ToastTone } from '../lib/realtime';
import { useRipple } from './motion';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  FlameIcon,
  InfoIcon,
  StoreIcon,
  StarIcon,
  TruckIcon,
  XCircleIcon,
  XIcon,
} from './icons';

/* ===========================================================================
   ONYX UI kit — one design language for every screen.

   Rules: white surfaces, soft shadows, large radii, 44px+ touch targets, red
   primary actions, green confirmations, glossy highlights, ripple + lift
   feedback, no glassmorphism and no emoji anywhere.
   =========================================================================== */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'success' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'brand-gradient text-white shadow-brand hover:brightness-105 active:brightness-95',
  secondary:
    'border border-red-200 bg-white text-red-700 shadow-soft hover:border-red-400 hover:bg-red-50 active:bg-red-100',
  success: 'success-gradient text-white shadow-green hover:brightness-105 active:brightness-95',
  outline: 'border border-red-600/25 bg-white text-red-700 hover:border-red-600/50 hover:bg-red-50 active:bg-red-100',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200',
};

/** Rounded, rippling, lift-on-hover button used for every action in the app. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  block,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const ripple = useRipple<HTMLButtonElement>();
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      ref={ripple.ref}
      onPointerDown={(event) => {
        if (!isDisabled) ripple.onPointerDown(event);
        rest.onPointerDown?.(event);
      }}
      disabled={isDisabled}
      className={clsx(
        'btn-ripple inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold',
        'transition-[transform,background-color,box-shadow,border-color,filter] duration-200 ease-out',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        size === 'sm' && 'min-h-10 px-3.5 py-2 text-sm',
        size === 'md' && 'min-h-11 px-4 py-2.5 text-[15px]',
        size === 'lg' && 'min-h-13 px-6 py-3.5 text-base',
        block && 'w-full',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="h-5 w-5 !border-white/40 !border-t-current" />}
      {children}
    </button>
  );
}

/** Round, 44px icon-only button (map controls, favourite toggles, close). */
export function IconButton({
  label,
  className,
  children,
  tone = 'neutral',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'neutral' | 'brand' | 'success';
}) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-11 w-11 items-center justify-center rounded-full border transition active:scale-95',
        tone === 'neutral' && 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        tone === 'brand' && 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
        tone === 'success' && 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-red-100 border-t-green-600',
        className ?? 'h-5 w-5',
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ------------------------------- surfaces -------------------------------- */

export function Card({
  className,
  children,
  padded = true,
  interactive,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-3xl glossy-card border border-slate-200 bg-white shadow-card',
        padded && 'p-5',
        interactive && 'lift cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Section heading with an optional action slot ("See all", filter chip…). */
export function SurfaceSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------- feedback -------------------------------- */

const BADGE_VARIANTS = {
  neutral: 'bg-slate-100 text-slate-600',
  brand: 'bg-red-50 text-red-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  dark: 'bg-slate-900 text-white',
  default: 'bg-slate-100 text-slate-600',
  outline: 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200',
  destructive: 'bg-red-100 text-red-700',
} as const;

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode;
  variant?: keyof typeof BADGE_VARIANTS;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide',
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Dual-tone status styles. Every pill pairs red and green AND includes an
 * icon + label, so colour is never the only signal (colour-vision safe).
 * The inset shadows are the second brand colour as a crisp edge accent.
 */
const STATUS_TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  // Order placed — balanced white pill with a red edge and a green edge.
  placed:
    'bg-white text-red-800 ring-1 ring-inset ring-red-200 shadow-[inset_5px_0_0_0_#e30613,inset_-5px_0_0_0_#0a8058]',
  // Order accepted — green active-service surface with a red supporting edge.
  accepted: 'bg-green-600 text-white ring-1 ring-inset ring-green-700 shadow-[inset_5px_0_0_0_#e30613]',
  // Serving — red food-preparation surface with a green freshness edge.
  prep: 'bg-red-600 text-white ring-1 ring-inset ring-red-700 shadow-[inset_-5px_0_0_0_#0a8058]',
  // Out for delivery — red delivery-action surface with a green route edge.
  route: 'bg-red-700 text-white ring-1 ring-inset ring-red-800 shadow-[inset_5px_0_0_0_#0a8058]',
  // Delivered — green completion surface with a red confirmation edge.
  delivered:
    'bg-green-700 text-white ring-1 ring-inset ring-green-800 shadow-[inset_5px_0_0_0_#e30613]',
  danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-300',
  warning: 'bg-red-50 text-red-700',
  info: 'bg-slate-100 text-slate-700',
  // Legacy keys kept so older call sites keep working.
  brand: 'bg-white text-red-800 ring-1 ring-inset ring-red-200',
  'brand-deep': 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-200',
  success: 'bg-green-50 text-green-800',
  'success-deep': 'bg-green-100 text-green-900 ring-1 ring-inset ring-green-200',
};

/** Status-specific icons: shape + text accompany every colour. */
const STATUS_ICONS: Record<OrderStatus, ReactNode> = {
  RECEIVED: <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  ACCEPTED: <StoreIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  PREPARING: <FlameIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  READY: <FlameIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  OUT_FOR_DELIVERY: <TruckIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  DELIVERED: <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />,
  CANCELLED: <XCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />,
};

export function StatusPill({
  status,
  label,
  className,
}: {
  status: OrderStatus;
  label?: string;
  className?: string;
}) {
  const tone = STATUS_TONE_CLASSES[ORDER_STATUS_TONE[status] ?? 'neutral'] ?? STATUS_TONE_CLASSES.neutral;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-300',
        tone,
        className,
      )}
      role="status"
    >
      {STATUS_ICONS[status] ?? null}
      {label ?? status}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      {icon ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-red-600 shadow-soft">
          {icon}
        </span>
      ) : null}
      <p className="text-base font-bold text-slate-900">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="animate-fade-in rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

/* ------------------------------ placeholders ----------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <span className={clsx('skeleton block', className)} aria-hidden="true" />;
}

/** Food-card placeholder used while the catalogue loads. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={clsx('overflow-hidden rounded-3xl border border-slate-200 bg-white', className)}>
      <Skeleton className="aspect-[4/3] w-full !rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-10 w-10 !rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2.5', className)}>
      {Array.from({ length: rows }).map((_value, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

/* ------------------------- quantity + rating chips ----------------------- */

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  size = 'md',
  unitLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  unitLabel?: string;
}) {
  const buttonClass = size === 'sm' ? 'h-9 w-9 rounded-xl text-base' : 'h-11 w-11 rounded-2xl text-lg';

  return (
    <div
      className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-soft"
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={clsx(
          buttonClass,
          'flex items-center justify-center font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95 disabled:opacity-40',
        )}
      >
        &minus;
      </button>
      <span className="min-w-9 text-center text-base font-extrabold tabular-nums text-slate-900">
        {value}
        {unitLabel ? <span className="ml-1 text-xs font-semibold text-slate-500">{unitLabel}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={clsx(
          buttonClass,
          'flex items-center justify-center bg-red-600 font-bold text-white shadow-brand-soft transition hover:bg-red-700 active:scale-95 disabled:opacity-40',
        )}
      >
        +
      </button>
    </div>
  );
}

export function RatingChip({
  value,
  count,
  className,
}: {
  value: number;
  count?: number | null;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full bg-slate-900/90 px-2 py-1 text-[11px] font-extrabold text-white',
        className,
      )}
    >
      <StarIcon className="h-3.5 w-3.5 text-amber-300" filled />
      {value.toFixed(1)}
      {count ? <span className="font-semibold text-white/70">({count})</span> : null}
    </span>
  );
}

/* ------------------------------ form controls ---------------------------- */

const FIELD =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-soft outline-none transition focus:border-red-600 focus:ring-4 focus:ring-red-600/10 disabled:bg-slate-50 disabled:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={clsx(FIELD, className)} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx(FIELD, 'min-h-24 resize-y', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...rest} className={clsx(FIELD, 'appearance-none pr-11', className)}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-sm text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * Floating-label wrapper: the label lifts on focus or when a value is present,
 * the focus ring is brand red and a validated field turns green.
 *   <FloatingField label="Phone" value={phone} valid={phone.length > 6}>
 *     <input value={phone} onChange={...} />
 *   </FloatingField>
 */
export function FloatingField({
  label,
  value,
  valid,
  invalid,
  hint,
  className,
  children,
}: {
  label: string;
  value: string | number | null | undefined;
  valid?: boolean;
  invalid?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const filled = value !== null && value !== undefined && String(value).length > 0;
  return (
    <div className={className}>
      <div
        className={clsx(
          'field-float',
          filled && 'is-filled',
          valid && filled && 'is-valid',
          invalid && 'is-invalid',
        )}
      >
        {children}
        <label htmlFor={undefined}>{label}</label>
      </div>
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/* --------------------------- modal + bottom sheet ------------------------ */

/**
 * Dialog that behaves like a native bottom sheet on phones and a centred card on
 * desktop. Escape closes it, the background never scrolls behind it and focus is
 * moved into the dialog for keyboard and screen-reader users.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-close])',
      )?.focus();
    }, 80);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={clsx(
          'animate-slide-up max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lift sm:animate-rise sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 active:scale-95"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 border-t border-slate-200 pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Bottom sheet: the mobile-native way to present short forms and choices. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {children}
    </Modal>
  );
}

/* ------------------------------- feedback -------------------------------- */

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_STYLES: Record<ToastTone, { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: 'border-green-200 bg-white text-green-900',
    icon: <CheckCircleIcon className="h-5 w-5 text-green-600" />,
  },
  error: { wrap: 'border-red-200 bg-white text-red-900', icon: <XCircleIcon className="h-5 w-5 text-red-600" /> },
  warning: {
    wrap: 'border-red-200 bg-white text-red-900',
    icon: <AlertTriangleIcon className="h-5 w-5 text-red-600" />,
  },
  info: { wrap: 'border-slate-200 bg-white text-slate-900', icon: <InfoIcon className="h-5 w-5 text-slate-500" /> },
};

/** Premium toast stack: brand colours, sliding in from the top, never a browser alert. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastItem>).detail;
      setItems((current) => [...current.slice(-3), detail]);
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== detail.id)), 4200);
    };
    window.addEventListener('ds:toast', handler);
    return () => window.removeEventListener('ds:toast', handler);
  }, []);

  return (
    <div
      className="pt-safe pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={clsx(
            'animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lift',
            TOAST_STYLES[item.tone].wrap,
          )}
        >
          <span className="mt-0.5 flex-none">{TOAST_STYLES[item.tone].icon}</span>
          <p className="text-sm font-semibold leading-snug">{item.message}</p>
        </div>
      ))}
    </div>
  );
}

/** Pill switcher with a sliding brand indicator (kitchen tabs, admin filters). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1',
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'flex flex-none items-center gap-2 rounded-xl font-bold transition',
              size === 'sm' ? 'min-h-9 px-3 text-[13px]' : 'min-h-10 px-3.5 text-sm',
              active ? 'brand-gradient text-white shadow-brand-soft' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[11px] font-extrabold',
                  active ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-600',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
