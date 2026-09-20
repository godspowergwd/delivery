import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { paginationSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import {
  buildReportSummary,
  generateReport,
  reportFilePath,
  resolveReportRange,
  serializeReport,
} from '../services/report.service';

export const reportsRouter = Router();

const reportTypeSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
const reportFormatSchema = z.enum(['PDF', 'EXCEL']);

const previewQuerySchema = z.object({
  type: reportTypeSchema.default('DAILY'),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

const generateBodySchema = z.object({
  type: reportTypeSchema,
  format: reportFormatSchema,
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

const exportQuerySchema = z.object({
  type: reportTypeSchema.default('DAILY'),
  format: reportFormatSchema.default('PDF'),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

function optionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** GET /api/reports/preview - aggregated data used to draw the report on screen. */
reportsRouter.get(
  '/preview',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = previewQuerySchema.parse(req.query);
    const range = resolveReportRange(query.type, optionalDate(query.from), optionalDate(query.to));
    const summary = await buildReportSummary(query.type, range.from, range.to);
    res.json({ summary });
  }),
);

/** POST /api/reports/generate - creates the PDF/Excel file and stores it. */
reportsRouter.post(
  '/generate',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = generateBodySchema.parse(req.body);
    const actor = getAuth(req).user;
    const { report, summary } = await generateReport({
      type: body.type,
      format: body.format,
      from: optionalDate(body.from),
      to: optionalDate(body.to),
      generatedById: actor.id,
      actor,
    });
    res.status(201).json({ report: serializeReport(report), summary });
  }),
);

/** GET /api/reports/export - one-shot download (generates and streams the file). */
reportsRouter.get(
  '/export',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = exportQuerySchema.parse(req.query);
    const actor = getAuth(req).user;
    const { report, filePath } = await generateReport({
      type: query.type,
      format: query.format,
      from: optionalDate(query.from),
      to: optionalDate(query.to),
      generatedById: actor.id,
      actor,
    });

    res.setHeader(
      'Content-Type',
      query.format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  }),
);

/** GET /api/reports - previously generated reports. */
reportsRouter.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const { skip, take } = paginateQuery(query);

    const [items, total] = await Promise.all([
      prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { generatedBy: { select: { name: true } } },
      }),
      prisma.report.count(),
    ]);

    res.json(
      paginate(
        items.map((report) => ({
          ...serializeReport(report),
          generatedByName: report.generatedBy?.name ?? 'System',
        })),
        total,
        { page: query.page, pageSize: query.pageSize, skip, take },
      ),
    );
  }),
);

/** GET /api/reports/:id/download */
reportsRouter.get(
  '/:id/download',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = z.string().trim().min(1).parse(req.params.id);
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw notFound('That report no longer exists.');

    const filePath = reportFilePath(report);
    if (!fs.existsSync(filePath)) {
      throw notFound('The generated file is missing. Please generate the report again.');
    }

    res.setHeader(
      'Content-Type',
      report.format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  }),
);

/** DELETE /api/reports/:id - removes the record and its file. */
reportsRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = z.string().trim().min(1).parse(req.params.id);
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw notFound('That report no longer exists.');

    const filePath = reportFilePath(report);
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    await prisma.report.delete({ where: { id } });

    res.json({ success: true });
  }),
);