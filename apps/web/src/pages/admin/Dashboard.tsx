import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AnalyticsCharts, AnalyticsOverview, OrderDTO, Paginated, SettingsDTO } from '@delivery/shared';
import { ORDER_STATUS_LABELS, formatMoney, formatRelativeTime } from '@delivery/shared';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, Card, EmptyState, Spinner, StatusPill } from '../../components/ui';
import {
  WalletIcon,
  ReceiptIcon,
  ChartIcon,
  FlameIcon,
  ClockIcon,
  CheckCircleIcon,
  UsersIcon,
  StoreIcon,
  AlertTriangleIcon,
  type IconProps,
} from '../../components/icons';

const ACTIVE_STATUSES = 'RECEIVED,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY';

export function AdminDashboard() {
  useRealtimeSync();

  const { data: ordersPage, isLoading: ordersLoading } = useQuery({
    queryKey: ['admin-recent-orders'],
    queryFn: () => api.get<Paginated<OrderDTO>>(`/orders?pageSize=8&status=${ACTIVE_STATUSES}`),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['admin-analytics-overview'],
    queryFn: () => api.get<{ overview: AnalyticsOverview }>('/analytics/overview'),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: chartsData } = useQuery({
    queryKey: ['admin-analytics-charts'],
    queryFn: () => api.get<{ charts: AnalyticsCharts }>('/analytics/charts?period=weekly'),
    staleTime: 60_000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<{ settings: SettingsDTO }>('/settings'),
    staleTime: 60_000,
  });

  const overview = analyticsData?.overview;
  const orders = ordersPage?.items ?? [];
  const settings = settingsData?.settings;

  if (ordersLoading || analyticsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  interface StatCard {
    label: string;
    value: string;
    icon: (props: IconProps) => ReactNode;
    tile: string;
    iconColor: string;
  }

    const statCards: StatCard[] = [
    { label: 'Revenue today', value: formatMoney(overview?.revenueToday ?? 0), icon: WalletIcon, tile: 'bg-red-50', iconColor: 'text-red-600' },
    { label: 'Orders today', value: String(overview?.ordersToday ?? 0), icon: ReceiptIcon, tile: 'bg-slate-100', iconColor: 'text-slate-600' },
    { label: 'Avg. order', value: formatMoney(overview?.averageOrderValue ?? 0), icon: ChartIcon, tile: 'bg-slate-100', iconColor: 'text-slate-600' },
    { label: 'Active orders', value: String(overview?.activeOrders ?? 0), icon: FlameIcon, tile: 'bg-red-50', iconColor: 'text-red-600' },
    { label: 'Pending', value: String(overview?.pendingOrders ?? 0), icon: ClockIcon, tile: 'bg-red-50', iconColor: 'text-red-600' },
    { label: 'Completion', value: `${overview?.completionRate ?? 0}%`, icon: CheckCircleIcon, tile: 'bg-red-50', iconColor: 'text-red-600' },
    { label: 'Customers', value: String(overview?.customersTotal ?? 0), icon: UsersIcon, tile: 'bg-slate-100', iconColor: 'text-slate-600' },
    { label: 'Business', value: settings?.businessName ?? '—', icon: StoreIcon, tile: 'bg-slate-100', iconColor: 'text-slate-600' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Today's overview and active orders.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="flex items-center gap-3 !p-4">
            <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${card.tile} ${card.iconColor}`}>
              <card.icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="truncate text-lg font-extrabold text-slate-900">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {chartsData?.charts.series && chartsData.charts.series.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <p className="mb-3 text-sm font-bold text-slate-600">Revenue trend</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartsData.charts.series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="onyxRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e30613" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#e30613" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ef" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6a7383' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6a7383' }} width={44} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, border: '1px solid #e5e9ef', boxShadow: '0 12px 32px -16px rgba(19,26,38,0.14)' }}
                    formatter={(value: unknown) => formatMoney(Number(value))}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#e30613" strokeWidth={2.5} fill="url(#onyxRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-bold text-slate-600">Orders per day</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartsData.charts.series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ef" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6a7383' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6a7383' }} width={30} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, border: '1px solid #e5e9ef', boxShadow: '0 12px 32px -16px rgba(19,26,38,0.14)' }}
                  />
                  <Bar dataKey="orders" fill="#0b9663" radius={[8, 8, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {(overview?.lowStockProducts.length ?? 0) > 0 && (
        <Card className="border-red-200 bg-red-50">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-red-800">
            <AlertTriangleIcon className="h-5 w-5" />
            Low stock
          </h2>
          <div className="flex flex-wrap gap-2">
            {overview?.lowStockProducts.map((product) => (
              <Badge key={product.id} variant="warning">
                {product.name} · {product.stock} left
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-bold text-slate-600">Active orders</h2>
        <div className="divide-y divide-slate-100">
          {orders.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No active orders right now.</p>
          ) : (
            orders.map((order) => (
              <Link key={order.id} to={`/admin/orders?focus=${order.id}`} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-slate-700">{order.orderNumber}</p>
                  <p className="truncate text-sm text-slate-500">
                    {order.customerName} · {formatRelativeTime(order.createdAt)}
                  </p>
                </div>
                <div className="flex-none text-right">
                  <StatusPill status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                  <p className="mt-0.5 text-sm font-bold text-slate-800">{formatMoney(order.total)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
        <Link to="/admin/orders" className="mt-3 block text-center text-sm text-red-600">
          View all orders →
        </Link>
      </Card>

      {(chartsData?.charts.topProducts.length ?? 0) > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-bold text-slate-600">Top products this week</h2>
          <div className="space-y-1.5">
            {chartsData?.charts.topProducts.slice(0, 5).map((product) => (
              <div key={product.productId} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-slate-700">{product.name}</span>
                <Badge variant="outline">
                  {product.quantity} sold · {formatMoney(product.revenue)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {orders.length === 0 && !ordersLoading && (
        <EmptyState title="Quiet for now" hint="New orders will appear here the moment customers check out." />
      )}
    </div>
  );
}
