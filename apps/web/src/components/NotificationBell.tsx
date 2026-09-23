import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { NotificationDTO } from '@delivery/shared';
import { formatRelativeTime } from '@delivery/shared';
import { api } from '../lib/api';
import { toast } from '../lib/realtime';
import {
  BellIcon,
  ChartIcon,
  AlertTriangleIcon,
  TagIcon,
  ReceiptIcon,
} from './icons';

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: page } = useQuery<{
    items: NotificationDTO[];
    unread: number;
  }>({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: NotificationDTO[]; unread: number }>('/notifications'),
    staleTime: 30_000,
  });

  const notifications = page?.items ?? [];
  const unread = Math.max(0, page?.unread ?? 0);

  useEffect(() => {
    function onOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) { setOpen(false); }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  async function markRead(id: string) {
    try {
      await api.post(`/notifications/${id}/read`);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark as read', 'error');
    }
  }

  async function markAllRead() {
    try {
      await api.post('/notifications/read-all');
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast(`Marked ${unread} as read`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark all as read', 'error');
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-800"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-700 px-1 text-sm font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-0 z-[60] mt-2 w-80 max-w-[calc(100vw-1rem)] space-y-1 rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-600">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-sm font-semibold text-green-700 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onMarkRead={markRead} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification, onMarkRead }: {
  notification: NotificationDTO;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div
      onClick={() => {
        if (!notification.isRead) void onMarkRead(notification.id);
        if (notification.orderId) window.location.assign(`/app/orders/${notification.orderId}`);
      }}
      className="cursor-pointer px-3 py-2 text-left transition hover:bg-slate-100"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <NotificationIcon type={notification.type} />
        </span>
        <div className="flex-1 space-y-0.5">
          <p className={`text-sm ${notification.isRead ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>
            {notification.title}
          </p>
          <p className="line-clamp-2 text-sm text-slate-500">{notification.body}</p>
          <p className="text-sm text-slate-600">{formatRelativeTime(notification.createdAt)}</p>
        </div>
        {!notification.isRead && (
          <button onClick={(e) => { e.stopPropagation(); void onMarkRead(notification.id); }}
            className="rounded-full bg-red-50 px-1.5 py-0.5 text-sm font-bold text-red-600" aria-label="Mark as read">
            Read
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationIcon({ type }: { type: NotificationDTO['type'] }) {
  switch (type) {
    case 'ORDER_UPDATE': return <ReceiptIcon className="h-5 w-5" />;
    case 'LOW_STOCK': return <AlertTriangleIcon className="h-5 w-5" />;
    case 'PROMOTION': return <TagIcon className="h-5 w-5" />;
    case 'BUSINESS_ALERT': return <ChartIcon className="h-5 w-5" />;
    case 'SYSTEM':
    default: return <BellIcon className="h-5 w-5" />;
  }
}