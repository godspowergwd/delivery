import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptDTO } from '@delivery/shared';
import { buildDeliveryReceiptHtml } from './print-receipt';

const receipt: ReceiptDTO = {
  receiptNumber: 'RCP-ORDER-42',
  businessName: 'Maame & Sons',
  businessAddress: 'Accra',
  businessPhone: '0240000000',
  businessEmail: 'hello@example.com',
  currencySymbol: 'GH₵',
  orderNumber: 'ORDER-42',
  orderId: 'order-id-42',
  issuedAt: '2026-09-28T10:00:00.000Z',
  status: 'PREPARING',
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  customerName: 'Ama <script>',
  customerPhone: '0241111111',
  deliveryAddress: 'Mallam, Accra',
  items: [{
    id: 'item-1',
    productId: 'product-1',
    name: 'Waakye & fish',
    imageUrl: null,
    unitPrice: 25,
    quantity: 2,
    lineTotal: 50,
    notes: null,
  }],
  subtotal: 50,
  deliveryFee: 5,
  tax: 0,
  discount: 0,
  total: 55,
  qrDataUrl: '',
  verifyUrl: 'https://example.com/verify/abc',
};

afterEach(() => vi.unstubAllGlobals());

describe('delivery receipt print HTML', () => {
  it('includes delivery, item, payment, branding and escaped customer details', () => {
    vi.stubGlobal('window', { location: { origin: 'https://shop.example' } });

    const html = buildDeliveryReceiptHtml(receipt, {
      createdAt: '2026-09-27T09:30:00.000Z',
      driverName: 'Kofi Driver',
    });

    expect(html).toContain('https://shop.example/brand/maames-waakye-logo.png');
    expect(html).toContain('Maame &amp; Sons');
    expect(html).toContain('Order ID: order-id-42');
    expect(html).toContain('Ama &lt;script&gt;');
    expect(html).toContain('Kofi Driver');
    expect(html).toContain('Waakye &amp; fish');
    expect(html).toContain('2 x GH₵25.00');
    expect(html).toContain('GH₵50.00');
    expect(html).toContain('Food subtotal');
    expect(html).toContain('Delivery fee');
    expect(html).toContain('TOTAL AMOUNT TO PAY');
    expect(html).toContain('GH₵55.00');
    expect(html).toContain('Payment on Delivery');
    expect(html).not.toContain('<script>alert');
  });

  it('prints a Bank Transfer label when supplied by a compatible API version', () => {
    vi.stubGlobal('window', { location: { origin: 'https://shop.example' } });

    const compatibleReceipt = {
      ...receipt,
      paymentMethod: 'BANK_TRANSFER' as ReceiptDTO['paymentMethod'],
    };

    expect(buildDeliveryReceiptHtml(compatibleReceipt)).toContain('Bank Transfer');
  });
});