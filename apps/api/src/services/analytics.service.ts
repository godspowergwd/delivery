import {
  completionRate,
  type AnalyticsCharts,
  type AnalyticsOverview,
  type ChartPoint,
  type KitchenPerformanceRow,
  type PeakHour,
  type TopProduct,
} from '@delivery/shared';
import { prisma, decimalToNumber } from '../lib/prisma';
import { getSettings } from './settings.service';

export type ChartPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface PeriodWindow {
  unit: 'hour' | 'day' | 'month';
  from: Date;
  to: Date;
}

function startOfHour(date: Date): Date {
  const copy = new Date(date);
  copy.setMinutes(0, 0, 0);
  return copy;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function resolvePeriod(period: ChartPeriod): PeriodWindow {
  const now = new Date();
  switch (period) {
    case 'daily':
      return { unit: 'hour', from: startOfHour(new Date(now.getTime() - 23 * 3_600_000)), to: now };
    case 'weekly':
      return { unit: 'day', from: startOfDay(new Date(now.getTime() - 6 * 86_400_000)), to: now };
    case 'yearly':
      return {
        unit: 'month',
        from: startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
        to: now,
      };
    case 'monthly':
    default:
      return { unit: 'day', from: startOfDay(new Date(now.getTime() - 29 * 86_400_000)), to: now };
  }
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Buckets and labels are computed in UTC so the analytics series is identical no
 * matter which timezone the API server or the POS terminal runs in.
 */
function bucketLabel(unit: PeriodWindow['unit'], date: Date): string {
  if (unit === 'hour') return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  if (unit === 'day') {
    return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS_SHORT[date.getUTCMonth()]}`;
  }
  return `${MONTHS_SHORT[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
}

/** Builds a continuous, gap-free bucket list so charts never show holes. */
function buildBuckets(window: PeriodWindow): ChartPoint[] {
  const points: ChartPoint[] = [];
  const stepMs =
    window.unit === 'hour' ? 3_600_000 : window.unit === 'day' ? 86_400_000 : undefined;

  if (stepMs) {
    let cursor = new Date(window.from);
    while (cursor <= window.to) {
      points.push({
        label: bucketLabel(window.unit, cursor),
        revenue: 0,
        orders: 0,
        delivered: 0,
        cancelled: 0,
        customers: 0,
        averagePrepMinutes: 0,
      });
      cursor = new Date(cursor.getTime() + stepMs);
    }
    return points;
  }

  // Monthly buckets are aligned to UTC months so the SQL buckets always line up.
  let cursor = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), 1));
  while (cursor <= window.to) {
    points.push({
      label: bucketLabel('month', cursor),
      revenue: 0,
      orders: 0,
      delivered: 0,
      cancelled: 0,
      customers: 0,
      averagePrepMinutes: 0,
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return points;
}

/** KPI snapshot used by the admin dashboard header cards. */
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const settings = await getSettings();

  const [
    revenueToday,
    revenueMonth,
    ordersToday,
    ordersMonth,
    completedOrders,
    cancelledOrders,
    pendingOrders,
    activeOrders,
    customersTotal,
    customersNewToday,
    activeKitchenStaff,
    lowStockProducts,
    prepSample,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: todayStart }, status: { not: 'CANCELLED' } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } },
    }),
    prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.order.count({ where: { status: 'DELIVERED', createdAt: { gte: todayStart } } }),
    prisma.order.count({ where: { status: 'CANCELLED', createdAt: { gte: todayStart } } }),
    prisma.order.count({ where: { status: 'RECEIVED' } }),
    prisma.order.count({
      where: { status: { in: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] } },
    }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { role: 'KITCHEN', isActive: true } }),
    prisma.product.findMany({
      where: { isArchived: false, stock: { lte: settings.lowStockThreshold } },
      select: { id: true, name: true, stock: true },
      orderBy: { stock: 'asc' },
      take: 8,
    }),
    prisma.order.findMany({
      where: { acceptedAt: { not: null }, readyAt: { not: null } },
      select: { acceptedAt: true, readyAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  const prepMinutes = prepSample
    .map((order) =>
      order.acceptedAt && order.readyAt
        ? (order.readyAt.getTime() - order.acceptedAt.getTime()) / 60_000
        : null,
    )
    .filter((value): value is number => value !== null && value >= 0);

  const averagePrepMinutes =
    prepMinutes.length > 0
      ? Math.round((prepMinutes.reduce((sum, value) => sum + value, 0) / prepMinutes.length) * 10) / 10
      : 0;

  const revenueTodayValue = decimalToNumber(revenueToday._sum.total);
  const billableToday = Math.max(0, ordersToday - cancelledOrders);

  return {
    date: now.toISOString(),
    revenueToday: revenueTodayValue,
    revenueMonth: decimalToNumber(revenueMonth._sum.total),
    ordersToday,
    ordersMonth,
    completedOrders,
    cancelledOrders,
    pendingOrders,
    activeOrders,
    averageOrderValue:
      billableToday > 0 ? Math.round((revenueTodayValue / billableToday) * 100) / 100 : 0,
    completionRate: completionRate(ordersToday, completedOrders),
    averagePrepMinutes,
    customersTotal,
    customersNewToday,
    activeKitchenStaff,
    lowStockProducts,
  };
}
interface OrderSeriesRow {
  bucket: string;
  revenue: unknown;
  orders: unknown;
  delivered: unknown;
  cancelled: unknown;
  prep: unknown;
}

interface CustomerSeriesRow {
  bucket: string;
  customers: unknown;
}

interface TopProductRow {
  productId: string | null;
  name: string;
  quantity: unknown;
  revenue: unknown;
}

interface PeakHourRow {
  hour: unknown;
  orders: unknown;
}

interface KitchenPerformanceRawRow {
  kitchenUserId: string | null;
  name: string | null;
  accepted: unknown;
  completed: unknown;
  cancelled: unknown;
  prep: unknown;
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Real aggregated analytics for the admin dashboard - every series is computed with
 * SQL over the orders/items/users tables. No placeholder data is used anywhere.
 */
export async function getAnalyticsCharts(
  period: ChartPeriod,
  customFrom?: Date,
  customTo?: Date,
): Promise<AnalyticsCharts> {
  const periodWindow = resolvePeriod(period);
  const from = customFrom ?? periodWindow.from;
  const to = customTo ?? periodWindow.to;
  const unit = periodWindow.unit;

  const [orderRows, customerRows, topProductRows, peakHourRows, kitchenRows] = await Promise.all([
    prisma.$queryRaw<OrderSeriesRow[]>`
      SELECT date_trunc(${unit}, "createdAt" AT TIME ZONE 'UTC')::text AS bucket,
             COALESCE(SUM(CASE WHEN "status" <> 'CANCELLED' THEN "total" ELSE 0 END), 0) AS revenue,
             COUNT(*) AS orders,
             COUNT(*) FILTER (WHERE "status" = 'DELIVERED') AS delivered,
             COUNT(*) FILTER (WHERE "status" = 'CANCELLED') AS cancelled,
             AVG(CASE WHEN "readyAt" IS NOT NULL AND "acceptedAt" IS NOT NULL
                      THEN EXTRACT(EPOCH FROM ("readyAt" - "acceptedAt")) / 60 END) AS prep
      FROM "Order"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    prisma.$queryRaw<CustomerSeriesRow[]>`
      SELECT date_trunc(${unit}, "createdAt" AT TIME ZONE 'UTC')::text AS bucket, COUNT(*) AS customers
      FROM "User"
      WHERE "role" = 'CUSTOMER' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    prisma.$queryRaw<TopProductRow[]>`
      SELECT item."productId" AS "productId",
             item."name" AS name,
             SUM(item."quantity") AS quantity,
             SUM(item."lineTotal") AS revenue
      FROM "OrderItem" item
      JOIN "Order" ord ON ord."id" = item."orderId"
      WHERE ord."createdAt" >= ${from} AND ord."createdAt" <= ${to} AND ord."status" <> 'CANCELLED'
      GROUP BY item."productId", item."name"
      ORDER BY quantity DESC
      LIMIT 8
    `,
    prisma.$queryRaw<PeakHourRow[]>`
      SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*) AS orders
      FROM "Order"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY hour
      ORDER BY orders DESC
      LIMIT 8
    `,
    prisma.$queryRaw<KitchenPerformanceRawRow[]>`
      SELECT ord."acceptedById" AS "kitchenUserId",
             usr."name" AS name,
             COUNT(*) AS accepted,
             COUNT(*) FILTER (WHERE ord."status" = 'DELIVERED') AS completed,
             COUNT(*) FILTER (WHERE ord."status" = 'CANCELLED') AS cancelled,
             AVG(CASE WHEN ord."readyAt" IS NOT NULL AND ord."acceptedAt" IS NOT NULL
                      THEN EXTRACT(EPOCH FROM (ord."readyAt" - ord."acceptedAt")) / 60 END) AS prep
      FROM "Order" ord
      LEFT JOIN "User" usr ON usr."id" = ord."acceptedById"
      WHERE ord."createdAt" >= ${from} AND ord."createdAt" <= ${to} AND ord."acceptedById" IS NOT NULL
      GROUP BY ord."acceptedById", usr."name"
      ORDER BY completed DESC
      LIMIT 10
    `,
  ]);

  return assembleCharts({
    period,
    unit,
    from,
    to,
    orderRows,
    customerRows,
    topProductRows,
    peakHourRows,
    kitchenRows,
  });
}
interface AssembleInput {
  period: ChartPeriod;
  unit: PeriodWindow['unit'];
  from: Date;
  to: Date;
  orderRows: OrderSeriesRow[];
  customerRows: CustomerSeriesRow[];
  topProductRows: TopProductRow[];
  peakHourRows: PeakHourRow[];
  kitchenRows: KitchenPerformanceRawRow[];
}

/** Key for a truncated bucket coming from SQL, e.g. "2026-09-15 13:00:00". */
function sqlBucketKey(unit: PeriodWindow['unit'], value: string): string {
  const normalized = value.replace(' ', 'T');
  if (unit === 'hour') return normalized.slice(0, 13);
  if (unit === 'day') return normalized.slice(0, 10);
  return normalized.slice(0, 7);
}

function jsBucketKey(unit: PeriodWindow['unit'], date: Date): string {
  const iso = date.toISOString();
  if (unit === 'hour') return iso.slice(0, 13);
  if (unit === 'day') return iso.slice(0, 10);
  return iso.slice(0, 7);
}

function assembleCharts(input: AssembleInput): AnalyticsCharts {
  const { unit, from, to } = input;
  const series = buildBuckets({ unit, from, to });
  const stepMs = unit === 'hour' ? 3_600_000 : unit === 'day' ? 86_400_000 : 0;

  const indexByKey = new Map<string, number>();
  series.forEach((_point, index) => {
    const bucketDate =
      stepMs > 0
        ? new Date(from.getTime() + index * stepMs)
        : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1));
    indexByKey.set(jsBucketKey(unit, bucketDate), index);
  });

  for (const row of input.orderRows) {
    const index = indexByKey.get(sqlBucketKey(unit, row.bucket));
    if (index === undefined) continue;
    const point = series[index];
    point.revenue = Math.round(toNumber(row.revenue) * 100) / 100;
    point.orders = toNumber(row.orders);
    point.delivered = toNumber(row.delivered);
    point.cancelled = toNumber(row.cancelled);
    point.averagePrepMinutes = Math.round(toNumber(row.prep) * 10) / 10;
  }

  for (const row of input.customerRows) {
    const index = indexByKey.get(sqlBucketKey(unit, row.bucket));
    if (index === undefined) continue;
    series[index].customers = toNumber(row.customers);
  }

  const totals = series.reduce(
    (accumulator, point) => ({
      revenue: accumulator.revenue + point.revenue,
      orders: accumulator.orders + point.orders,
      delivered: accumulator.delivered + point.delivered,
      cancelled: accumulator.cancelled + point.cancelled,
      prepWeighted: accumulator.prepWeighted + point.averagePrepMinutes * point.delivered,
      prepWeight: accumulator.prepWeight + point.delivered,
    }),
    { revenue: 0, orders: 0, delivered: 0, cancelled: 0, prepWeighted: 0, prepWeight: 0 },
  );

  const billable = Math.max(0, totals.orders - totals.cancelled);

  const topProducts: TopProduct[] = input.topProductRows.map((row) => ({
    productId: row.productId ?? 'deleted',
    name: row.name,
    quantity: toNumber(row.quantity),
    revenue: Math.round(toNumber(row.revenue) * 100) / 100,
  }));

  const peakHours: PeakHour[] = [...input.peakHourRows]
    .map((row) => {
      const hour = toNumber(row.hour);
      return { hour, label: `${String(hour).padStart(2, '0')}:00`, orders: toNumber(row.orders) };
    })
    .sort((a, b) => a.hour - b.hour);

  const kitchenPerformance: KitchenPerformanceRow[] = input.kitchenRows.map((row) => {
    const accepted = toNumber(row.accepted);
    const cancelled = toNumber(row.cancelled);
    return {
      kitchenUserId: row.kitchenUserId,
      name: row.name ?? 'Unassigned',
      accepted,
      completed: toNumber(row.completed),
      averagePrepMinutes: Math.round(toNumber(row.prep) * 10) / 10,
      cancellationRate: accepted > 0 ? Math.round((cancelled / accepted) * 1000) / 10 : 0,
    };
  });

  return {
    period: input.period,
    from: from.toISOString(),
    to: to.toISOString(),
    series,
    topProducts,
    peakHours,
    kitchenPerformance,
    totals: {
      revenue: Math.round(totals.revenue * 100) / 100,
      orders: totals.orders,
      delivered: totals.delivered,
      cancelled: totals.cancelled,
      averageOrderValue: billable > 0 ? Math.round((totals.revenue / billable) * 100) / 100 : 0,
      completionRate: completionRate(totals.orders, totals.delivered),
      averagePrepMinutes:
        totals.prepWeight > 0 ? Math.round((totals.prepWeighted / totals.prepWeight) * 10) / 10 : 0,
    },
  };
}