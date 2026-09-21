import { useEffect, useState } from 'react';
import { formatDuration } from '@delivery/shared';
import { ClockIcon, FlameIcon } from './icons';

/**
 * Live preparation timer for kitchen cards. Counts up from the moment the
 * order entered PREPARING (or was created), turning red past the target time.
 */
export function PrepTimer({
  startedAt,
  targetMinutes,
}: {
  startedAt: string | null;
  targetMinutes: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!startedAt) return null;
  const elapsedMs = Math.max(0, now - new Date(startedAt).getTime());
  const elapsed = Math.round(elapsedMs / 60_000);
  const late = elapsed > targetMinutes;
  const remaining = Math.max(0, targetMinutes - elapsed);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
        late ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
      }`}
      role="timer"
      aria-label={late ? `Late by ${formatDuration(elapsed - targetMinutes)}` : `${formatDuration(remaining)} left`}
    >
      {late ? <FlameIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      {late ? `+${formatDuration(elapsed - targetMinutes)}` : formatDuration(remaining)}
    </span>
  );
}
