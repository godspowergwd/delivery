import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { ReportFormat, ReportType, KitchenPerformanceRow, TopProduct } from '@delivery/shared';
import { completionRate } from '@delivery/shared';
import { Prisma } from '@prisma/client';
import { prisma, decimalToNumber } from '../lib/prisma';
import { REPORT_DIR } from '../config/env';
import { getSettings } from './settings.service';
import { getAnalyticsCharts, getAnalyticsOverview, type ChartPeriod } from './analytics.service';
import { logActivity } from './activity-log.service';

export interface ReportRange {
  from: Date;
  to: Date;
  label: string;
}

export interface ReportSummary {
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
  series: Array<{ label: string; orders: number; revenue: number; delivered: number; cancelled: number }>;
}

const PERIOD_LABELS: Record<ReportType, string> = {
  DAILY: 'Daily report',
  WEEKLY: 'Weekly report',
  MONTHLY: 'Monthly report',
  YEARLY: 'Yearly report',
};

const CHART_PERIOD: Record<ReportType, ChartPeriod> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

/** Resolves the reporting window for a report type (relative to "now" by default). */
export function resolveReportRange(type: ReportType, from?: Date, to?: Date): ReportRange {
  const now = new Date();
  const end = to ?? now;
  let start: Date;

  switch (type) {
    case 'DAILY':
      start = new Date(end.getTime() - 24 * 3_600_000);
      break;
    case 'WEEKLY':
      start = new Date(end.getTime() - 7 * 86_400_000);
      break;
    case 'YEARLY':
      start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
      break;
    case 'MONTHLY':
    default:
      start = new Date(end.getFullYear(), end.getMonth() - 1, end.getDate());
      break;
  }

  return { from: from ?? start, to: end, label: PERIOD_LABELS[type] };
}

export async function buildReportSummary(type: ReportType, from: Date, to: Date): Promise<ReportSummary> {
  const settings = await getSettings();

  const [orderGroups, charts, overview, newCustomers, customersWithOrders] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    getAnalyticsCharts(CHART_PERIOD[type], from, to),
    getAnalyticsOverview(),
    prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: from, lte: to } } }),
    prisma.order.groupBy({
      by: ['customerId'],
      where: { createdAt: { gte: from, lte: to }, status: 'DELIVERED' },
      _count: { _all: true },
      having: { customerId: { _count: { gt: 1 } } },
    }),
  ]);

  const byStatus = new Map(orderGroups.map((group) => [group.status, group]));
  const deliveredRows = byStatus.get('DELIVERED');
  const cancelledRows = byStatus.get('CANCELLED');
  const totalOrders = orderGroups.reduce((sum, group) => sum + group._count._all, 0);
  const delivered = deliveredRows?._count._all ?? 0;
  const cancelled = cancelledRows?._count._all ?? 0;
  const revenue = orderGroups
    .filter((group) => group.status !== 'CANCELLED')
    .reduce((sum, group) => sum + decimalToNumber(group._sum.total), 0);
  const billable = Math.max(0, totalOrders - cancelled);

  const paymentGroups = await prisma.order.groupBy({
    by: ['paymentMethod'],
    where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
    _count: { _all: true },
    _sum: { total: true },
  });

  return {
    businessName: settings.businessName,
    currencySymbol: settings.currencySymbol,
    periodType: type,
    periodLabel: PERIOD_LABELS[type],
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    totals: {
      orders: totalOrders,
      delivered,
      cancelled,
      pending: totalOrders - delivered - cancelled,
      revenue: Math.round(revenue * 100) / 100,
      averageOrderValue: billable > 0 ? Math.round((revenue / billable) * 100) / 100 : 0,
      completionRate: completionRate(totalOrders, delivered),
      averagePrepMinutes: charts.totals.averagePrepMinutes || overview.averagePrepMinutes,
    },
    payments: paymentGroups.map((group) => ({
      method: group.paymentMethod,
      orders: group._count._all,
      amount: decimalToNumber(group._sum.total),
    })),
    topProducts: charts.topProducts,
    staff: charts.kitchenPerformance,
    customers: {
      total: overview.customersTotal,
      newInPeriod: newCustomers,
      repeat: customersWithOrders.length,
    },
    series: charts.series.map((point) => ({
      label: point.label,
      orders: point.orders,
      revenue: point.revenue,
      delivered: point.delivered,
      cancelled: point.cancelled,
    })),
  };
}
function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toFixed(2)}`;
}

function printableRange(range: { from: Date; to: Date }): string {
  const format = (date: Date) =>
    date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return `${format(range.from)} → ${format(range.to)}`;
}

/** Renders the report as a multi-section PDF document. */
export async function renderReportPdf(summary: ReportSummary): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: summary.periodLabel } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 44;
    const width = doc.page.width - 88;
    const symbol = summary.currencySymbol;

    doc.roundedRect(left, 40, width, 84, 12).fill('#0b1120');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(summary.businessName, left + 18, 56, { width: width - 36 });
    doc
      .fillColor('#5eead4')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(summary.periodLabel.toUpperCase(), left + 18, 84, { width: width - 36 });
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(9)
      .text(
        printableRange({ from: new Date(summary.periodStart), to: new Date(summary.periodEnd) }),
        left + 18,
        100,
        { width: width - 36 },
      );

    let y = 148;
    const cards: Array<[string, string]> = [
      ['Revenue', formatMoney(summary.totals.revenue, symbol)],
      ['Orders', String(summary.totals.orders)],
      ['Delivered', String(summary.totals.delivered)],
      ['Cancelled', String(summary.totals.cancelled)],
      ['Average order value', formatMoney(summary.totals.averageOrderValue, symbol)],
      ['Completion rate', `${summary.totals.completionRate}%`],
      ['Average prep time', `${summary.totals.averagePrepMinutes} min`],
      ['Pending', String(summary.totals.pending)],
    ];

    const cardWidth = (width - 12) / 2;
    cards.forEach((card, index) => {
      const column = index % 2;
      const line = Math.floor(index / 2);
      const x = left + column * (cardWidth + 12);
      const cardY = y + line * 52;
      doc.roundedRect(x, cardY, cardWidth, 44, 8).fillAndStroke('#f8fafc', '#e2e8f0');
      doc
        .fillColor('#64748b')
        .font('Helvetica')
        .fontSize(8)
        .text(card[0].toUpperCase(), x + 12, cardY + 8, { width: cardWidth - 24 });
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(card[1], x + 12, cardY + 20, { width: cardWidth - 24 });
    });

    const tableHeader = (title: string) => {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(title, left, y);
      y = doc.y + 6;
    };

    // Period breakdown table
    y += 4 * 52 + 18;
    tableHeader('Period breakdown');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
    doc.text('PERIOD', left + 6, y, { width: 160 });
    doc.text('ORDERS', left + 180, y, { width: 70, align: 'right' });
    doc.text('DELIVERED', left + 260, y, { width: 80, align: 'right' });
    doc.text('CANCELLED', left + 350, y, { width: 80, align: 'right' });
    doc.text('REVENUE', left + width - 110, y, { width: 104, align: 'right' });
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    summary.series.forEach((point, index) => {
      if (index % 2 === 1) doc.rect(left, y - 3, width, 16).fill('#f8fafc');
      doc.fillColor('#334155');
      doc.text(point.label, left + 6, y, { width: 160 });
      doc.text(String(point.orders), left + 180, y, { width: 70, align: 'right' });
      doc.text(String(point.delivered), left + 260, y, { width: 80, align: 'right' });
      doc.text(String(point.cancelled), left + 350, y, { width: 80, align: 'right' });
      doc.text(formatMoney(point.revenue, symbol), left + width - 110, y, {
        width: 104,
        align: 'right',
      });
      y += 16;
    });

    // Top selling products
    y += 18;
    tableHeader('Top selling products');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a');
    doc.text('PRODUCT', left + 6, y, { width: 250 });
    doc.text('QTY SOLD', left + 270, y, { width: 80, align: 'right' });
    doc.text('REVENUE', left + width - 130, y, { width: 124, align: 'right' });
    y += 14;
    doc.font('Helvetica').fontSize(9);
    if (summary.topProducts.length === 0) {
      doc.fillColor('#64748b').text('No products were sold in this period.', left + 6, y);
      y += 16;
    }
    summary.topProducts.forEach((product, index) => {
      if (index % 2 === 1) doc.rect(left, y - 3, width, 16).fill('#f8fafc');
      doc.fillColor('#334155');
      doc.text(product.name, left + 6, y, { width: 250 });
      doc.text(String(product.quantity), left + 270, y, { width: 80, align: 'right' });
      doc.text(formatMoney(product.revenue, symbol), left + width - 130, y, {
        width: 124,
        align: 'right',
      });
      y += 16;
    });

    // Payment mix
    y += 18;
    tableHeader('Payment methods');
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    if (summary.payments.length === 0) {
      doc.fillColor('#64748b').text('No payments recorded in this period.', left + 6, y);
      y += 16;
    }
    summary.payments.forEach((payment) => {
      doc
        .fillColor('#334155')
        .font('Helvetica')
        .fontSize(9)
        .text(
          `${payment.method === 'CASH' ? 'Cash on delivery' : 'Mobile Money'} — ${payment.orders} orders • ${formatMoney(payment.amount, symbol)}`,
          left + 6,
          y,
          { width: width - 12 },
        );
      y += 15;
    });

    // Kitchen performance
    y += 18;
    tableHeader('Kitchen performance');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a');
    doc.text('STAFF', left + 6, y, { width: 180 });
    doc.text('ACCEPTED', left + 200, y, { width: 70, align: 'right' });
    doc.text('COMPLETED', left + 280, y, { width: 80, align: 'right' });
    doc.text('AVG PREP', left + 370, y, { width: 70, align: 'right' });
    doc.text('CANCEL %', left + width - 80, y, { width: 74, align: 'right' });
    y += 14;
    doc.font('Helvetica').fontSize(9);
    if (summary.staff.length === 0) {
      doc.fillColor('#64748b').text('No kitchen activity recorded in this period.', left + 6, y);
      y += 16;
    }
    summary.staff.forEach((row) => {
      doc.fillColor('#334155');
      doc.text(row.name, left + 6, y, { width: 180 });
      doc.text(String(row.accepted), left + 200, y, { width: 70, align: 'right' });
      doc.text(String(row.completed), left + 280, y, { width: 80, align: 'right' });
      doc.text(`${row.averagePrepMinutes} min`, left + 370, y, { width: 70, align: 'right' });
      doc.text(`${row.cancellationRate}%`, left + width - 80, y, { width: 74, align: 'right' });
      y += 16;
    });

    // Customers
    y += 18;
    tableHeader('Customers');
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(9)
      .text(`New customers in period: ${summary.customers.newInPeriod}`, left + 6, y)
      .text(`Repeat customers in period: ${summary.customers.repeat}`, left + 6, y + 14)
      .text(`Total registered customers: ${summary.customers.total}`, left + 6, y + 28);

    doc
      .fillColor('#94a3b8')
      .fontSize(8)
      .text(
        `${summary.businessName} • Generated ${new Date().toLocaleString('en-GB')}`,
        left,
        doc.page.height - 56,
        { width, align: 'center' },
      );

    doc.end();
  });
}
/** Generates the spreadsheet version of the report (one sheet per section). */
export async function renderReportExcel(summary: ReportSummary): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = summary.businessName;
  workbook.created = new Date();

  const headerStyle = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1120' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  };

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 24 },
  ];
  headerStyle(summarySheet.getRow(1));
  summarySheet.addRows([
    { metric: 'Business', value: summary.businessName },
    { metric: 'Report', value: summary.periodLabel },
    { metric: 'Period start', value: new Date(summary.periodStart).toLocaleString('en-GB') },
    { metric: 'Period end', value: new Date(summary.periodEnd).toLocaleString('en-GB') },
    { metric: 'Revenue', value: summary.totals.revenue },
    { metric: 'Orders', value: summary.totals.orders },
    { metric: 'Delivered', value: summary.totals.delivered },
    { metric: 'Cancelled', value: summary.totals.cancelled },
    { metric: 'Pending', value: summary.totals.pending },
    { metric: 'Average order value', value: summary.totals.averageOrderValue },
    { metric: 'Completion rate (%)', value: summary.totals.completionRate },
    { metric: 'Average preparation time (min)', value: summary.totals.averagePrepMinutes },
    { metric: 'New customers in period', value: summary.customers.newInPeriod },
    { metric: 'Repeat customers in period', value: summary.customers.repeat },
    { metric: 'Total customers', value: summary.customers.total },
  ]);

  const periodSheet = workbook.addWorksheet('Period breakdown');
  periodSheet.columns = [
    { header: 'Period', key: 'label', width: 16 },
    { header: 'Orders', key: 'orders', width: 12 },
    { header: 'Delivered', key: 'delivered', width: 12 },
    { header: 'Cancelled', key: 'cancelled', width: 12 },
    { header: `Revenue (${summary.currencySymbol})`, key: 'revenue', width: 18 },
  ];
  headerStyle(periodSheet.getRow(1));
  summary.series.forEach((point) => periodSheet.addRow(point));
  periodSheet.addRow({
    label: 'TOTAL',
    orders: summary.totals.orders,
    delivered: summary.totals.delivered,
    cancelled: summary.totals.cancelled,
    revenue: summary.totals.revenue,
  });
  periodSheet.getRow(periodSheet.rowCount).font = { bold: true };

  const productSheet = workbook.addWorksheet('Top products');
  productSheet.columns = [
    { header: 'Product', key: 'name', width: 34 },
    { header: 'Quantity sold', key: 'quantity', width: 16 },
    { header: `Revenue (${summary.currencySymbol})`, key: 'revenue', width: 18 },
  ];
  headerStyle(productSheet.getRow(1));
  summary.topProducts.forEach((product) =>
    productSheet.addRow({
      name: product.name,
      quantity: product.quantity,
      revenue: product.revenue,
    }),
  );

  const staffSheet = workbook.addWorksheet('Kitchen performance');
  staffSheet.columns = [
    { header: 'Staff', key: 'name', width: 26 },
    { header: 'Accepted', key: 'accepted', width: 12 },
    { header: 'Completed', key: 'completed', width: 12 },
    { header: 'Average prep (min)', key: 'averagePrepMinutes', width: 20 },
    { header: 'Cancellation rate (%)', key: 'cancellationRate', width: 22 },
  ];
  headerStyle(staffSheet.getRow(1));
  summary.staff.forEach((row) => staffSheet.addRow(row));

  const paymentSheet = workbook.addWorksheet('Payments');
  paymentSheet.columns = [
    { header: 'Method', key: 'method', width: 24 },
    { header: 'Orders', key: 'orders', width: 12 },
    { header: `Amount (${summary.currencySymbol})`, key: 'amount', width: 18 },
  ];
  headerStyle(paymentSheet.getRow(1));
  summary.payments.forEach((row) => paymentSheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
export interface GenerateReportInput {
  type: ReportType;
  format: ReportFormat;
  from?: Date;
  to?: Date;
  generatedById?: string | null;
  actor?: { id: string; email: string; role: string } | null;
}

/** Builds the report, writes it to disk and records it in the database. */
export async function generateReport(input: GenerateReportInput) {
  const range = resolveReportRange(input.type, input.from, input.to);
  const summary = await buildReportSummary(input.type, range.from, range.to);

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const extension = input.format === 'PDF' ? 'pdf' : 'xlsx';
  const stamp = `${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}`;
  const fileName = `${input.type.toLowerCase()}-report-${stamp}.${extension}`;
  const filePath = path.join(REPORT_DIR, fileName);

  const buffer =
    input.format === 'PDF' ? await renderReportPdf(summary) : await renderReportExcel(summary);
  fs.writeFileSync(filePath, buffer);

  const report = await prisma.report.create({
    data: {
      type: input.type,
      format: input.format,
      periodStart: range.from,
      periodEnd: range.to,
      fileName,
      filePath,
      orderCount: summary.totals.orders,
      revenue: new Prisma.Decimal(summary.totals.revenue),
      summary: summary as never,
      generatedById: input.generatedById ?? null,
    },
  });

  await logActivity({
    action: 'REPORT_GENERATED',
    entity: 'Report',
    entityId: report.id,
    description: `${summary.periodLabel} exported as ${input.format}`,
    metadata: { orders: summary.totals.orders, revenue: summary.totals.revenue, fileName },
    userId: input.actor?.id ?? null,
    actorEmail: input.actor?.email ?? null,
    actorRole: (input.actor?.role as never) ?? null,
  });

  return { report, summary, fileName, filePath };
}

export function reportFilePath(report: { filePath: string; fileName: string }): string {
  return path.isAbsolute(report.filePath)
    ? report.filePath
    : path.join(REPORT_DIR, report.filePath);
}

export function serializeReport(report: {
  id: string;
  type: ReportType;
  format: ReportFormat;
  periodStart: Date;
  periodEnd: Date;
  fileName: string;
  orderCount: number;
  revenue: unknown;
  summary: unknown;
  createdAt: Date;
}) {
  return {
    id: report.id,
    type: report.type,
    format: report.format,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    fileName: report.fileName,
    orderCount: report.orderCount,
    revenue: decimalToNumber(report.revenue),
    summary: report.summary,
    createdAt: report.createdAt.toISOString(),
    downloadUrl: `/api/reports/${report.id}/download`,
  };
}