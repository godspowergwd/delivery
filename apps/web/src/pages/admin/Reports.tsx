import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, ReportFormat, ReportType, TopProduct, KitchenPerformanceRow } from '@delivery/shared';
import { REPORT_FORMAT_LABELS, REPORT_TYPE_LABELS, formatMoney } from '@delivery/shared';
import { api, API_URL, getToken } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Field, Select, Spinner } from '../../components/ui';
import { toast } from '../../lib/realtime';

interface ReportSummary {
  businessName: string;
  currencySymbol: string;
  periodType: ReportType;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  totals: {
    orders: number;
    delivered: number;
    cancelled: number;
    pending: number;
    revenue: number;
    averageOrderValue: number;
    completionRate: number;
    averagePrepMinutes: number;
  };
  payments: Array<{ method: string; orders: number; amount: number }>;
  topProducts: TopProduct[];
  staff: KitchenPerformanceRow[];
  customers: { total: number; newInPeriod: number; repeat: number };
}

interface ReportRow {
  id: string;
  type: ReportType;
  format: ReportFormat;
  fileName: string;
  createdAt: string;
  generatedByName?: string | null;
}

async function downloadReport(type: ReportType, format: ReportFormat) {
  const params = new URLSearchParams({ type, format });
  const res = await fetch(`${API_URL}/reports/export?${params.toString()}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Export failed. Please try again.');
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? `${type.toLowerCase()}-report.${format === 'PDF' ? 'pdf' : 'xlsx'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AdminReports() {
  useRealtimeSync();
  const [type, setType] = useState<ReportType>('DAILY');
  const [exporting, setExporting] = useState<ReportFormat | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-report-preview', type],
    queryFn: () => api.get<{ summary: ReportSummary }>(`/reports/preview?type=${type}`),
    staleTime: 30_000,
  });

  const { data: history } = useQuery({
    queryKey: ['admin-report-history'],
    queryFn: () => api.get<Paginated<ReportRow>>('/reports?page=1&pageSize=10'),
    staleTime: 30_000,
  });

  const summary = data?.summary;

  const exportAs = async (format: ReportFormat) => {
    setExporting(format);
    try {
      await downloadReport(type, format);
      toast(`${REPORT_FORMAT_LABELS[format]} downloaded`, 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Export and analyze performance data.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period">
          <Select value={type} onChange={(event) => setType(event.target.value as ReportType)} className="min-w-40">
            {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((value) => (
              <option key={value} value={value}>
                {REPORT_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="outline" loading={exporting === 'PDF'} onClick={() => void exportAs('PDF')}>
            Export PDF
          </Button>
          <Button variant="outline" loading={exporting === 'EXCEL'} onClick={() => void exportAs('EXCEL')}>
            Export Excel
          </Button>
        </div>
      </div>

      {isLoading || !summary ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          <Card>
            <p className="text-sm text-slate-500">{summary.periodLabel}</p>
            <p className="text-sm text-slate-700">
              {new Date(summary.periodStart).toLocaleDateString()} → {new Date(summary.periodEnd).toLocaleDateString()}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Revenue" value={formatMoney(summary.totals.revenue)} />
              <Metric label="Orders" value={String(summary.totals.orders)} />
              <Metric label="Delivered" value={String(summary.totals.delivered)} />
              <Metric label="Cancelled" value={String(summary.totals.cancelled)} />
              <Metric label="Avg. order" value={formatMoney(summary.totals.averageOrderValue)} />
              <Metric label="Completion" value={`${summary.totals.completionRate}%`} />
              <Metric label="Avg. prep" value={`${summary.totals.averagePrepMinutes} min`} />
              <Metric label="Customers" value={String(summary.customers.total)} />
            </div>
          </Card>

          {summary.payments.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-bold text-slate-600">Payments</h2>
              <div className="space-y-1.5 text-sm">
                {summary.payments.map((payment) => (
                  <div key={payment.method} className="flex items-center justify-between">
                    <span className="text-slate-700">{payment.method.replace('_', ' ')}</span>
                    <span className="font-semibold text-slate-900">
                      {payment.orders} · {formatMoney(payment.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {summary.topProducts.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-bold text-slate-600">Top products</h2>
              <div className="space-y-1.5 text-sm">
                {summary.topProducts.slice(0, 8).map((product) => (
                  <div key={product.productId} className="flex items-center justify-between">
                    <span className="min-w-0 truncate text-slate-700">{product.name}</span>
                    <span className="flex-none text-slate-600">
                      {product.quantity} sold · {formatMoney(product.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {history && history.items.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-bold text-slate-600">Previously generated</h2>
          <div className="space-y-1.5 text-xs">
            {history.items.map((report) => (
              <div key={report.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-slate-700">{report.fileName}</span>
                <span className="flex-none text-slate-500">
                  {REPORT_TYPE_LABELS[report.type] ?? report.type} · {report.format} ·{' '}
                  {new Date(report.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
