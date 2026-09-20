import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { OrderStatus, PaymentMethod, PaymentStatus, ReceiptDTO, SettingsDTO } from '@delivery/shared';
import { prisma, decimalToNumber } from '../lib/prisma';
import { env } from '../config/env';
import { randomCode } from '../lib/tokens';
import { getSettings } from './settings.service';
import { getOrderById } from './order.service';
import { emitToOrder } from '../realtime/socket';
import { ORDER_STATUS_LABELS } from '@delivery/shared';
import type { OrderWithRelations } from './serializers';

export interface ReceiptPayload extends Omit<ReceiptDTO, 'qrDataUrl'> {
  qrDataUrl?: string;
}

export function buildReceiptPayload(
  order: OrderWithRelations,
  settings: SettingsDTO,
  verifyCode: string,
): ReceiptPayload {
  const verifyUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/verify/${verifyCode}`;
  return {
    receiptNumber: `RCP-${order.orderNumber}`,
    businessName: settings.businessName,
    businessAddress: settings.businessAddress,
    businessPhone: settings.businessPhone,
    businessEmail: settings.businessEmail,
    currencySymbol: settings.currencySymbol,
    orderNumber: order.orderNumber,
    orderId: order.id,
    issuedAt: new Date().toISOString(),
    status: order.status as OrderStatus,
    paymentMethod: order.paymentMethod as PaymentMethod,
    paymentStatus: order.paymentStatus as PaymentStatus,
    customerName: order.customer?.name ?? 'Customer',
    customerPhone: order.deliveryPhone,
    deliveryAddress: [order.deliveryAddress, order.deliveryArea].filter(Boolean).join(', '),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      imageUrl: item.imageUrl,
      unitPrice: decimalToNumber(item.unitPrice),
      quantity: item.quantity,
      lineTotal: decimalToNumber(item.lineTotal),
      notes: item.notes,
    })),
    subtotal: decimalToNumber(order.subtotal),
    deliveryFee: decimalToNumber(order.deliveryFee),
    tax: decimalToNumber(order.tax),
    discount: decimalToNumber(order.discount),
    total: decimalToNumber(order.total),
    verifyUrl,
  };
}

/** Creates the receipt once and reuses it afterwards so numbers stay stable. */
export async function ensureReceipt(orderId: string, generatedById?: string | null) {
  const existing = await prisma.receipt.findUnique({ where: { orderId } });
  if (existing) return existing;

  const order = await getOrderById(orderId);
  const settings = await getSettings();
  const verifyCode = randomCode(12);
  const payload = buildReceiptPayload(order, settings, verifyCode);
  const qrDataUrl = await QRCode.toDataURL(
    JSON.stringify({
      verifyUrl: payload.verifyUrl,
      orderNumber: payload.orderNumber,
      total: payload.total,
      issuedAt: payload.issuedAt,
    }),
    { margin: 1, width: 360, errorCorrectionLevel: 'M' },
  );

  const receipt = await prisma.receipt.create({
    data: {
      receiptNumber: payload.receiptNumber,
      orderId,
      verifyCode,
      payload: { ...payload } as never,
      qrDataUrl,
      generatedById: generatedById ?? null,
    },
  });

  emitToOrder(orderId, 'receipt:generated', {
    orderId,
    receiptNumber: receipt.receiptNumber,
  });
  return receipt;
}

export async function getReceiptForOrder(orderId: string) {
  const receipt = await prisma.receipt.findUnique({ where: { orderId } });
  return receipt ?? ensureReceipt(orderId);
}

export function receiptDto(
  payload: ReceiptPayload,
  qrDataUrl: string,
): ReceiptDTO {
  return { ...payload, qrDataUrl };
}

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const receiptHelpers = { formatMoney, formatDateTime, ORDER_STATUS_LABELS };
export async function renderReceiptPdf(input: {
  payload: ReceiptPayload;
  qrDataUrl: string;
}): Promise<Buffer> {
  const { payload, qrDataUrl } = input;
  const money = (amount: number) => formatMoney(amount, payload.currencySymbol);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: payload.receiptNumber } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 44;
    const width = doc.page.width - 88;
    const right = left + width;

    // Header band
    doc.roundedRect(left, 40, width, 96, 12).fill('#0b1120');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(payload.businessName, left + 20, 58, { width: width - 150 });
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(9)
      .text(payload.businessAddress, left + 20, 86, { width: width - 150 })
      .text(`${payload.businessPhone}  •  ${payload.businessEmail}`, left + 20, 99, {
        width: width - 150,
      });
    doc
      .fillColor('#5eead4')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('RECEIPT', right - 140, 58, { width: 120, align: 'right' });
    doc
      .fillColor('#e2e8f0')
      .font('Helvetica')
      .fontSize(9)
      .text(payload.receiptNumber, right - 170, 80, { width: 150, align: 'right' })
      .text(formatDateTime(payload.issuedAt), right - 170, 93, { width: 150, align: 'right' });

    // Meta grid (two columns, four rows)
    const metaTop = 156;
    const metaRows: Array<[string, string]> = [
      ['Order number', payload.orderNumber],
      ['Status', ORDER_STATUS_LABELS[payload.status] ?? payload.status],
      ['Payment method', payload.paymentMethod === 'CASH' ? 'Cash on delivery' : 'Mobile Money'],
      ['Payment status', payload.paymentStatus],
      ['Customer', payload.customerName],
      ['Phone', payload.customerPhone],
      ['Deliver to', payload.deliveryAddress],
      ['Items', String(payload.items.reduce((sum, item) => sum + item.quantity, 0))],
    ];

    metaRows.forEach((row, index) => {
      const column = index % 2;
      const line = Math.floor(index / 2);
      const x = left + column * (width / 2);
      const metaY = metaTop + line * 32;
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(row[0].toUpperCase(), x, metaY, {
        width: width / 2 - 12,
      });
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(row[1] || '—', x, metaY + 10, { width: width / 2 - 12 });
    });

    // Items table
    let y = metaTop + 4 * 32 + 16;
    doc.roundedRect(left, y, width, 24, 6).fill('#f1f5f9');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9);
    doc.text('ITEM', left + 10, y + 8, { width: 240 });
    doc.text('QTY', left + 250, y + 8, { width: 50, align: 'right' });
    doc.text('UNIT', left + 310, y + 8, { width: 90, align: 'right' });
    doc.text('TOTAL', left + 410, y + 8, { width: width - 420, align: 'right' });
    y += 32;

    payload.items.forEach((item, index) => {
      if (index % 2 === 1) {
        doc.rect(left, y - 6, width, 24).fill('#f8fafc');
      }
      doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
      doc.text(item.name, left + 10, y, { width: 230 });
      doc.text(String(item.quantity), left + 250, y, { width: 50, align: 'right' });
      doc.text(money(item.unitPrice), left + 310, y, { width: 90, align: 'right' });
      doc.text(money(item.lineTotal), left + 410, y, { width: width - 420, align: 'right' });
      if (item.notes) {
        doc
          .fillColor('#64748b')
          .fontSize(8)
          .text(`note: ${item.notes}`, left + 10, y + 13, { width: 300 });
        y += 14;
      }
      y += 20;
    });

    // Totals block
    y += 12;
    const totalsX = left + width / 2;
    const totalsRows: Array<[string, string, boolean?]> = [
      ['Subtotal', money(payload.subtotal)],
      ['Delivery fee', money(payload.deliveryFee)],
      ['Tax', money(payload.tax)],
    ];
    if (payload.discount > 0) totalsRows.push(['Discount', `-${money(payload.discount)}`]);
    totalsRows.push(['TOTAL', money(payload.total), true]);

    totalsRows.forEach((row) => {
      const bold = Boolean(row[2]);
      doc
        .fillColor(bold ? '#0f172a' : '#475569')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 12 : 10);
      doc.text(row[0], totalsX, y, { width: width / 2 - 100 });
      doc.text(row[1], right - 100, y, { width: 100, align: 'right' });
      y += bold ? 24 : 16;
    });

    // QR code and verification details
    const qrSize = 96;
    const qrTop = y + 16;
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64');
    if (qrBuffer.length > 0) {
      doc.image(qrBuffer, left, qrTop, { width: qrSize, height: qrSize });
    }
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Scan to verify this receipt', left + qrSize + 14, qrTop + 4, {
        width: width - qrSize - 24,
      });
    doc
      .fillColor('#64748b')
      .font('Helvetica')
      .fontSize(8)
      .text(payload.verifyUrl, left + qrSize + 14, qrTop + 20, { width: width - qrSize - 24 })
      .text(
        'Machine generated and stored against this order. Keep it as proof of payment.',
        left + qrSize + 14,
        qrTop + 40,
        { width: width - qrSize - 24 },
      );

    doc
      .fillColor('#94a3b8')
      .fontSize(8)
      .text(
        `${payload.businessName} • ${payload.businessPhone} • Generated ${formatDateTime(payload.issuedAt)}`,
        left,
        doc.page.height - 56,
        { width, align: 'center' },
      );

    doc.end();
  });
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Standalone, print-ready HTML receipt (also used for the "Print" action in the PWA). */
export function renderReceiptHtml(input: {
  payload: ReceiptPayload;
  qrDataUrl: string;
  autoPrint?: boolean;
}): string {
  const { payload, qrDataUrl, autoPrint } = input;
  const symbol = payload.currencySymbol;
  const lines = payload.items
    .map(
      (item) => `
      <tr>
        <td>
          <span class="item">${escapeHtml(item.name)}</span>
          ${item.notes ? `<span class="note">${escapeHtml(item.notes)}</span>` : ''}
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatMoney(item.unitPrice, symbol)}</td>
        <td class="num">${formatMoney(item.lineTotal, symbol)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${escapeHtml(payload.receiptNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #eef2f7; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12); }
  header { background: #0b1120; color: #fff; padding: 26px 28px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  header h1 { margin: 0 0 6px; font-size: 20px; }
  header p { margin: 2px 0; color: #94a3b8; font-size: 12px; }
  .tag { text-align: right; }
  .tag strong { color: #5eead4; letter-spacing: 0.18em; font-size: 12px; }
  .tag span { display: block; font-size: 12px; color: #cbd5f5; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px 18px; padding: 22px 28px; border-bottom: 1px dashed #e2e8f0; }
  .meta div span { display: block; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; }
  .meta div strong { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; padding: 14px 28px 8px; }
  th.num, td.num { text-align: right; }
  td { padding: 10px 28px; border-top: 1px solid #f1f5f9; font-size: 14px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .item { display: block; font-weight: 600; }
  .note { display: block; font-size: 12px; color: #64748b; margin-top: 2px; }
  .totals { padding: 18px 28px 6px; margin-left: auto; max-width: 320px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #475569; }
  .totals div.grand { border-top: 2px solid #0f172a; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 700; color: #0f172a; }
  .verify { display: flex; gap: 18px; align-items: center; padding: 24px 28px; border-top: 1px dashed #e2e8f0; }
  .verify img { width: 110px; height: 110px; }
  .verify p { margin: 0 0 6px; font-size: 12px; color: #475569; line-height: 1.5; word-break: break-all; }
  footer { padding: 16px 28px 26px; text-align: center; font-size: 11px; color: #94a3b8; }
  .actions { max-width: 720px; margin: 18px auto 0; display: flex; gap: 10px; justify-content: flex-end; }
  .actions button { border: 0; border-radius: 14px; padding: 12px 22px; font-size: 14px; font-weight: 600; cursor: pointer; background: #0f172a; color: #fff; }
  .actions button.ghost { background: #e2e8f0; color: #0f172a; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; max-width: none; } .actions { display: none; } }
</style>
</head>
<body>
  <div class="actions">
    <button type="button" class="ghost" onclick="window.close()">Close</button>
    <button type="button" onclick="window.print()">Print receipt</button>
  </div>
  <section class="sheet">
    <header>
      <div>
        <h1>${escapeHtml(payload.businessName)}</h1>
        <p>${escapeHtml(payload.businessAddress)}</p>
        <p>${escapeHtml(payload.businessPhone)} • ${escapeHtml(payload.businessEmail)}</p>
      </div>
      <div class="tag">
        <strong>RECEIPT</strong>
        <span>${escapeHtml(payload.receiptNumber)}</span>
        <span>${escapeHtml(formatDateTime(payload.issuedAt))}</span>
      </div>
    </header>
    <div class="meta">
      <div><span>Order number</span><strong>${escapeHtml(payload.orderNumber)}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(ORDER_STATUS_LABELS[payload.status] ?? payload.status)}</strong></div>
      <div><span>Payment method</span><strong>${payload.paymentMethod === 'CASH' ? 'Cash on delivery' : 'Mobile Money'}</strong></div>
      <div><span>Payment status</span><strong>${escapeHtml(payload.paymentStatus)}</strong></div>
      <div><span>Customer</span><strong>${escapeHtml(payload.customerName)}</strong></div>
      <div><span>Phone</span><strong>${escapeHtml(payload.customerPhone)}</strong></div>
      <div><span>Deliver to</span><strong>${escapeHtml(payload.deliveryAddress)}</strong></div>
    </div>
    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr>
      </thead>
      <tbody>${lines}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${formatMoney(payload.subtotal, symbol)}</span></div>
      <div><span>Delivery fee</span><span>${formatMoney(payload.deliveryFee, symbol)}</span></div>
      <div><span>Tax</span><span>${formatMoney(payload.tax, symbol)}</span></div>
      ${payload.discount > 0 ? `<div><span>Discount</span><span>-${formatMoney(payload.discount, symbol)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${formatMoney(payload.total, symbol)}</span></div>
    </div>
    <div class="verify">
      <img src="${qrDataUrl}" alt="Receipt QR code" />
      <div>
        <p><strong>Scan to verify this receipt</strong></p>
        <p>${escapeHtml(payload.verifyUrl)}</p>
        <p>Machine generated and stored against this order. Keep it as proof of payment.</p>
      </div>
    </div>
    <footer>${escapeHtml(payload.businessName)} • Generated ${escapeHtml(formatDateTime(payload.issuedAt))}</footer>
  </section>
  ${autoPrint ? '<script>window.addEventListener("load", () => window.print());</script>' : ''}
</body>
</html>`;
}