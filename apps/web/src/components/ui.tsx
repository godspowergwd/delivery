import { clsx } from 'clsx';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ORDER_STATUS_TONE, type OrderStatus } from '@delivery/shared';
import type { ToastTone } from '../lib/realtime';
import { XIcon } from './icons';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-600/20',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200',
  success: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-600/20',
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'min-h-10 px-3.5 py-2 text-sm',
        size === 'md' && 'min-h-11 px-4 py-2.5 text-[15px]',
        size === 'lg' && 'min-h-12 px-6 py-3.5 text-base',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner className="h-5 w-5 !border-white/40 !border-t-white" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-block animate-spin rounded-full border-2 border-slate-200 border-t-red-600', className ?? 'h-5 w-5')}
      role="status"
      aria-label="Loading"
    />
  );
}

const FIELD =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/15 disabled:bg-slate-50 disabled:text-slate-500';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx(FIELD, className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx(FIELD, 'min-h-24', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(FIELD, 'appearance-none', className)}>
      {children}
    </select>
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

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

/** Statuses use red shades so the platform keeps one clear brand language. */
const TONES: Record<string, string> = {
  amber: 'bg-red-50 text-red-700 border-red-200',
  sky: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-red-100 text-red-800 border-red-300',
  teal: 'bg-red-50 text-red-700 border-red-200',
  indigo: 'bg-red-100 text-red-800 border-red-300',
  emerald: 'bg-red-50 text-red-700 border-red-200',
  rose: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_TONES: Record<OrderStatus, keyof typeof TONES> = {
  RECEIVED: 'amber',
  ACCEPTED: 'sky',
  PREPARING: 'violet',
  READY: 'teal',
  OUT_FOR_DELIVERY: 'sky',
  DELIVERED: 'emerald',
  CANCELLED: 'rose',
};

export function StatusPill({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-bold', TONES[STATUS_TONES[status] ?? ORDER_STATUS_TONE[status] ?? 'sky'])}>
      {label}
    </span>
  );
}

type BadgeVariant = 'default' | 'outline' | 'destructive' | 'success' | 'warning';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-red-50 text-red-700 border-red-200',
  outline: 'bg-white text-slate-600 border-slate-300',
  destructive: 'bg-red-600 text-white border-red-600',
  success: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-red-50 text-red-700 border-red-200',
};

export function Badge({ variant = 'default', children, className }: { variant?: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide',
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="text-base font-bold text-slate-800">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{message}</p>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={clsx(
          'animate-fade-up max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ToastItem { id: number; message: string; tone: ToastTone }

const TOAST_TONES: Record<ToastTone, string> = {
  info: 'border-slate-200 bg-white text-slate-800',
  success: 'border-red-200 bg-red-50 text-red-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-red-200 bg-red-50 text-red-800',
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastItem>).detail;
      setItems((current) => [...current.slice(-3), detail]);
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== detail.id)), 4000);
    };
    window.addEventListener('ds:toast', handler);
    return () => window.removeEventListener('ds:toast', handler);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div key={item.id} className={clsx('pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-xl', TOAST_TONES[item.tone])}>
          {item.message}
        </div>
      ))}
    </div>
  );
}
