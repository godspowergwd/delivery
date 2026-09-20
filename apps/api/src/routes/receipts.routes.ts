import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { paginationSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { assertCanViewOrder, getOrderById } from '../services/order.service';
import {
  ensureReceipt,
  getReceiptForOrder,
  receiptDto,
  renderReceiptHtml,
  renderReceiptPdf,
  type ReceiptPayload,
} from '../services/receipt.service';
import { logActivity } from '../services/activity-log.service';

export const receiptsRouter = Router();

const orderIdParamSchema = z.object({ orderId: z.string().trim().min(1) });
const verifyParamSchema = z.object({ verifyCode: z.string().trim().min(4) });

/** GET /api/receipts/order/:orderId - receipt data (generated on first request). */
receiptsRouter.get(
  '/order/:orderId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { orderId } = orderIdParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const order = await getOrderById(orderId);
    assertCanViewOrder(order, user);

    const receipt = await ensureReceipt(orderId, user.id);
    res.json({
      receipt: receiptDto(receipt.payload as unknown as ReceiptPayload, receipt.qrDataUrl),
      receiptNumber: receipt.receiptNumber,
      generatedAt: receipt.generatedAt.toISOString(),
      downloadUrl: `/api/receipts/order/${orderId}/pdf`,
      printUrl: `/api/receipts/order/${orderId}/html?print=1`,
    });
  }),
);

/** GET /api/receipts/order/:orderId/pdf - downloadable PDF receipt. */
receiptsRouter.get(
  '/order/:orderId/pdf',
  authenticate,
  asyncHandler(async (req, res) => {
    const { orderId } = orderIdParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const order = await getOrderById(orderId);
    assertCanViewOrder(order, user);

    const receipt = await getReceiptForOrder(orderId);
    const buffer = await renderReceiptPdf({
      payload: receipt.payload as unknown as ReceiptPayload,
      qrDataUrl: receipt.qrDataUrl,
    });

    await logActivity({
      action: 'RECEIPT_DOWNLOADED',
      entity: 'Receipt',
      entityId: receipt.id,
      description: `Receipt ${receipt.receiptNumber} downloaded as PDF`,
      userId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      request: req,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${receipt.receiptNumber}.pdf"`);
    res.send(buffer);
  }),
);

/** GET /api/receipts/order/:orderId/html - print-friendly receipt view. */
receiptsRouter.get(
  '/order/:orderId/html',
  authenticate,
  asyncHandler(async (req, res) => {
    const { orderId } = orderIdParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const order = await getOrderById(orderId);
    assertCanViewOrder(order, user);

    const receipt = await getReceiptForOrder(orderId);
    const html = renderReceiptHtml({
      payload: receipt.payload as unknown as ReceiptPayload,
      qrDataUrl: receipt.qrDataUrl,
      autoPrint: String(req.query.print ?? '') === '1',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }),
);
/** GET /api/receipts/verify/:verifyCode - public QR verification endpoint. */
receiptsRouter.get(
  '/verify/:verifyCode',
  asyncHandler(async (req, res) => {
    const { verifyCode } = verifyParamSchema.parse(req.params);
    const receipt = await prisma.receipt.findUnique({
      where: { verifyCode },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
            deliveredAt: true,
            paymentStatus: true,
            paymentMethod: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
    if (!receipt) throw notFound('That receipt code could not be verified.');

    res.json({
      valid: true,
      receiptNumber: receipt.receiptNumber,
      verifyCode: receipt.verifyCode,
      issuedAt: receipt.generatedAt.toISOString(),
      order: {
        orderNumber: receipt.order.orderNumber,
        status: receipt.order.status,
        total: Number(receipt.order.total),
        paymentMethod: receipt.order.paymentMethod,
        paymentStatus: receipt.order.paymentStatus,
        placedAt: receipt.order.createdAt.toISOString(),
        deliveredAt: receipt.order.deliveredAt?.toISOString() ?? null,
        customerName: receipt.order.customer.name,
      },
    });
  }),
);

/** GET /api/receipts - every generated receipt (admin only). */
receiptsRouter.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const { skip, take } = paginateQuery(query);

    const [items, total] = await Promise.all([
      prisma.receipt.findMany({
        orderBy: { generatedAt: 'desc' },
        skip,
        take,
        include: {
          order: {
            select: {
              orderNumber: true,
              status: true,
              total: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.receipt.count(),
    ]);

    res.json(
      paginate(
        items.map((receipt) => ({
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          verifyCode: receipt.verifyCode,
          orderId: receipt.orderId,
          orderNumber: receipt.order.orderNumber,
          orderStatus: receipt.order.status,
          total: Number(receipt.order.total),
          customerName: receipt.order.customer.name,
          generatedAt: receipt.generatedAt.toISOString(),
          downloadUrl: `/api/receipts/order/${receipt.orderId}/pdf`,
        })),
        total,
        { page: query.page, pageSize: query.pageSize, skip, take },
      ),
    );
  }),
);

/** POST /api/receipts/order/:orderId/regenerate - rebuild a receipt snapshot (admin). */
receiptsRouter.post(
  '/order/:orderId/regenerate',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { orderId } = orderIdParamSchema.parse(req.params);
    await prisma.receipt.deleteMany({ where: { orderId } });
    const receipt = await ensureReceipt(orderId, getAuth(req).user.id);
    res.json({
      receipt: receiptDto(receipt.payload as unknown as ReceiptPayload, receipt.qrDataUrl),
      receiptNumber: receipt.receiptNumber,
    });
  }),
);