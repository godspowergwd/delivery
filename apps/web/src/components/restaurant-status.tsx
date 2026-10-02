import type { RestaurantStatusDTO } from '@delivery/shared';
import {
  RESTAURANT_CLOSED_BODY,
  RESTAURANT_CLOSED_HINT,
  RESTAURANT_CLOSED_LABEL,
  RESTAURANT_CLOSED_TITLE,
  RESTAURANT_OPEN_LABEL,
  describeRestaurantClosedAt,
  describeRestaurantStatusChange,
} from '@delivery/shared';
import { clsx } from 'clsx';
import { Button, Spinner } from './ui';
import { CheckCircleIcon, StoreIcon, XCircleIcon } from './icons';

/**
 * Restaurant open/closed surfaces.
 *
 * One status, one meaning, everywhere: green means the kitchen is taking
 * orders, red means it is not. The Kitchen owns the switch; customers and
 * drivers only read it.
 */

/** Compact status pill for headers and banners. */
export function RestaurantStatusPill({
  status,
  className,
}: {
  status: RestaurantStatusDTO | null;
  className?: string;
}) {
  const open = status?.open ?? true;
  const label = open ? RESTAURANT_OPEN_LABEL : RESTAURANT_CLOSED_LABEL;

  return (
    <span
      role="status"
      className={clsx(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide',
        open
          ? 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200'
          : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx('h-2 w-2 rounded-full', open ? 'bg-green-600' : 'bg-red-600')}
      />
      {label}
    </span>
  );
}

/**
 * Full-width card shown to customers while the kitchen is closed. There are no
 * pre-orders yet: the checkout action is simply replaced by this message.
 */
export function RestaurantClosedNotice({
  status,
  className,
  compact,
}: {
  status: RestaurantStatusDTO | null;
  className?: string;
  compact?: boolean;
}) {
  const closedAt = status ? describeRestaurantClosedAt(status) : null;

  return (
    <section
      aria-live="polite"
      className={clsx(
        'rg-corners overflow-hidden rounded-card border border-red-200 bg-white shadow-card',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-4 py-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-red-600 text-white">
          <XCircleIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-tight text-red-800">
            {RESTAURANT_CLOSED_TITLE}
          </p>
          <p className="truncate text-[13px] font-semibold text-red-700">{RESTAURANT_CLOSED_BODY}</p>
        </div>
        <RestaurantStatusPill status={status} className="ml-auto flex-none" />
      </div>

      {!compact && (
        <div className="space-y-2 px-4 py-3">
          {closedAt && (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
              <StoreIcon className="h-4 w-4 flex-none text-slate-400" aria-hidden="true" />
              {closedAt}
            </p>
          )}
          <p className="rounded-xl bg-green-50 px-3 py-2 text-[13px] font-semibold text-green-800">
            {RESTAURANT_CLOSED_HINT}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The Kitchen's control: one large tap target that opens or closes the
 * restaurant, plus when and by whom the state was last changed.
 */
export function RestaurantStatusCard({
  status,
  pending,
  onToggle,
  className,
}: {
  status: RestaurantStatusDTO | null;
  pending?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
}) {
  const open = status?.open ?? true;
  const changed = status ? describeRestaurantStatusChange(status) : null;
  const interactive = Boolean(onToggle);

  return (
    <section
      className={clsx(
        'overflow-hidden rounded-3xl border bg-white shadow-card',
        open ? 'border-green-200' : 'border-red-200',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold tracking-tight text-slate-900">Restaurant Status</h2>
          <p className="text-[13px] text-slate-500">
            Customers can order only while the kitchen is open.
          </p>
        </div>
        <RestaurantStatusPill status={status} className="flex-none" />
      </div>

      <button
        type="button"
        disabled={!interactive || pending}
        onClick={() => onToggle?.(!open)}
        aria-pressed={open}
        aria-label={open ? 'Close the restaurant' : 'Open the restaurant'}
        className={clsx(
          'mx-5 mt-4 flex min-h-16 w-[calc(100%-2.5rem)] items-center justify-center gap-3 rounded-2xl text-lg font-extrabold uppercase tracking-wide text-white transition active:scale-[0.98] disabled:cursor-default',
          open
            ? 'bg-green-600 shadow-green hover:bg-green-700'
            : 'bg-red-600 shadow-brand-soft hover:bg-red-700',
        )}
      >
        {pending ? (
          <Spinner className="h-6 w-6 !border-white/40 !border-t-white" />
        ) : open ? (
          <CheckCircleIcon className="h-6 w-6" aria-hidden="true" />
        ) : (
          <XCircleIcon className="h-6 w-6" aria-hidden="true" />
        )}
        {open ? RESTAURANT_OPEN_LABEL : RESTAURANT_CLOSED_LABEL}
      </button>

      <p className="px-5 py-3 text-center text-[13px] font-semibold text-slate-500">
        {changed ?? 'Tap the button to open or close the kitchen.'}
      </p>

      {interactive && (
        <p className="border-t border-slate-100 px-5 py-3 text-center text-[12px] font-medium text-slate-400">
          {open
            ? 'Tap to close - new orders stop immediately.'
            : 'Tap to open - customers can order again straight away.'}
        </p>
      )}
    </section>
  );
}

/** Compact strip used inside the kitchen header (status + quick open/close). */
export function RestaurantStatusStrip({
  status,
  pending,
  onToggle,
}: {
  status: RestaurantStatusDTO | null;
  pending?: boolean;
  onToggle: (open: boolean) => void;
}) {
  const open = status?.open ?? true;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
        open ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
      )}
    >
      <RestaurantStatusPill status={status} />
      <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-600">
        {status
          ? describeRestaurantStatusChange(status) ?? 'Status not recorded yet'
          : 'Loading status…'}
      </p>
      <Button
        size="sm"
        variant={open ? 'danger' : 'success'}
        loading={pending}
        onClick={() => onToggle(!open)}
        className="flex-none"
      >
        {open ? 'Close' : 'Open'}
      </Button>
    </div>
  );
}
