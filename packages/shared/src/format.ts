export const CURRENCY_FALLBACK = { code: 'GHS', symbol: 'GH\u20b5' };

export function formatMoney(
  amount: number | string | null | undefined,
  symbol = CURRENCY_FALLBACK.symbol,
): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const safe = Number.isFinite(value as number) ? (value as number) : 0;
  const sign = safe < 0 ? '-' : '';
  const formatted = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol}${formatted}`;
}

export function formatNumber(value: number | null | undefined): string {
  const safe = Number.isFinite(value as number) ? (value as number) : 0;
  return safe.toLocaleString('en-US');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRelativeTime(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (Math.abs(diffSeconds) < 45) return 'just now';
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(-Math.round(diffSeconds / seconds), unit);
    }
  }
  return formatter.format(-diffSeconds, 'second');
}

export function formatDuration(minutes: number | null | undefined): string {
  const safe = Number.isFinite(minutes as number) ? Math.max(0, Math.round(minutes as number)) : 0;
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}