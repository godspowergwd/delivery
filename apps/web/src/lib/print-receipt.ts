import type { ReceiptDTO } from '@delivery/shared';

export interface DeliveryReceiptPrintOptions {
  createdAt?: string;
  driverName?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toFixed(2)}`;
}

export function buildDeliveryReceiptHtml(
  receipt: ReceiptDTO,
  options: DeliveryReceiptPrintOptions = {},
): string {
  const money = (amount: number) => escapeHtml(formatMoney(amount, receipt.currencySymbol));
  const items = receipt.items
    .map((item) => `
      <article class="item">
        <strong>${escapeHtml(item.name)}</strong>
        ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}
        <div class="item-price"><span>${item.quantity} x ${money(item.unitPrice)}</span><b>${money(item.lineTotal)}</b></div>
      </article>`)
    .join('');
  const logoUrl = new URL(
    `${import.meta.env.BASE_URL}brand/maames-waakye-logo.png`,
    window.location.origin,
  ).href;
  const paymentMethodValue: string = receipt.paymentMethod;
  const paymentMethod =
    paymentMethodValue === 'CASH'
      ? receipt.fulfillmentType === 'PICKUP' ? 'Cash' : 'Payment on Delivery'
      : paymentMethodValue === 'MOBILE_MONEY'
        ? 'MoMo'
        : paymentMethodValue === 'BANK_TRANSFER'
          ? 'Bank Transfer'
          : paymentMethodValue;
  const placedAt = options.createdAt ?? receipt.issuedAt;
  const isPickup = receipt.fulfillmentType === 'PICKUP';
  const isWalkIn = receipt.source === 'KITCHEN_WALK_IN';
  const orderType = isWalkIn ? `Walk-In ${isPickup ? 'Pickup' : 'Delivery'}` : 'Online Delivery';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${escapeHtml(receipt.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; color: #000; background: #fff; font: 12px/1.4 Arial, sans-serif; }
  .receipt { width: 100%; max-width: 74mm; margin: 0 auto; }
  header { text-align: center; padding-bottom: 10px; border-bottom: 1px dashed #000; }
  header img { display: block; width: 36mm; max-height: 23mm; object-fit: contain; margin: 0 auto 5px; }
  h1 { margin: 0; font-size: 16px; line-height: 1.2; overflow-wrap: anywhere; }
  p { margin: 2px 0; }
  .section { padding: 8px 0; border-bottom: 1px dashed #000; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:first-child { flex: 0 0 auto; }
  .row span:last-child { text-align: right; overflow-wrap: anywhere; }
  .item { padding: 6px 0; border-bottom: 1px dotted #777; break-inside: avoid; }
  .item strong, .item small { display: block; overflow-wrap: anywhere; }
  .item small { margin-top: 2px; }
  .item-price { display: flex; justify-content: space-between; gap: 8px; margin-top: 3px; }
  .total { margin-top: 6px; padding-top: 8px; border-top: 2px solid #000; font-size: 17px; font-weight: 800; }
  .order-id { font-size: 10px; overflow-wrap: anywhere; }
  @page { size: auto; margin: 3mm; }
  @media print { body { padding: 0; } .receipt { max-width: 74mm; } }
</style>
</head>
<body>
  <main class="receipt">
    <header>
      <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(receipt.businessName)} logo" />
      <h1>${escapeHtml(receipt.businessName)}</h1>
      ${receipt.businessAddress ? `<p>${escapeHtml(receipt.businessAddress)}</p>` : ''}
      ${receipt.businessPhone ? `<p>${escapeHtml(receipt.businessPhone)}</p>` : ''}
    </header>
    <section class="section">
      <div class="row"><strong>Order</strong><strong>${escapeHtml(receipt.orderNumber)}</strong></div>
      <div class="row"><span>Order type</span><span>${escapeHtml(orderType)}</span></div>
      <div class="row"><span>Date &amp; time</span><span>${escapeHtml(formatDateTime(placedAt))}</span></div>
      <p class="order-id">Order ID: ${escapeHtml(receipt.orderId)}</p>
    </section>
    <section class="section">
      <div class="row"><span>Customer</span><span>${escapeHtml(receipt.customerName || 'Walk-in')}</span></div>
      ${receipt.customerPhone ? `<div class="row"><span>Phone</span><span>${escapeHtml(receipt.customerPhone)}</span></div>` : ''}
      <div class="row"><span>${isPickup ? 'Fulfilment' : 'Deliver to'}</span><span>${escapeHtml(receipt.deliveryAddress)}</span></div>
      ${options.driverName ? `<div class="row"><span>Driver</span><span>${escapeHtml(options.driverName)}</span></div>` : ''}
    </section>
    <section class="section">${items}</section>
    <section class="section">
      <div class="row"><span>Food subtotal</span><span>${money(receipt.subtotal)}</span></div>
      ${!isPickup ? `<div class="row"><span>Delivery fee</span><span>${money(receipt.deliveryFee)}</span></div>` : ''}
      ${receipt.tax > 0 ? `<div class="row"><span>Tax</span><span>${money(receipt.tax)}</span></div>` : ''}
      ${receipt.discount > 0 ? `<div class="row"><span>Discount</span><span>-${money(receipt.discount)}</span></div>` : ''}
      <div class="row total"><span>TOTAL AMOUNT TO PAY</span><span>${money(receipt.total)}</span></div>
      <div class="row"><span>Payment method</span><strong>${paymentMethod}</strong></div>
      <div class="row"><span>Payment status</span><strong>${escapeHtml(receipt.paymentStatus)}</strong></div>
    </section>
  </main>
  <script>window.addEventListener('load', () => window.print(), { once: true });</script>
</body>
</html>`;
}

/** Opens synchronously from the tap, then loads the existing receipt data. */
export async function printDeliveryReceipt(
  loadReceipt: () => Promise<ReceiptDTO>,
  options: DeliveryReceiptPrintOptions = {},
): Promise<void> {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Allow pop-ups to print this receipt.');
  const printDocument = printWindow.document;

  printDocument.write('<!doctype html><title>Preparing receipt</title><p>Preparing receipt...</p>');
  try {
    const receipt = await loadReceipt();
    printDocument.open();
    printDocument.write(buildDeliveryReceiptHtml(receipt, options));
    printDocument.close();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}