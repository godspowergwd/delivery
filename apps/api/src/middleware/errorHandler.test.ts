import express from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { errorHandler, notFoundHandler } from './errorHandler';

describe('error response privacy', () => {
  it('does not reflect query-string credentials from an unknown route', async () => {
    const app = express();
    app.use(notFoundHandler);
    app.use(errorHandler);

    const response = await request(app).get('/missing?access_token=synthetic-secret&email=person%40example.com');

    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain('GET /missing');
    expect(response.body.error.message).not.toContain('synthetic-secret');
    expect(response.body.error.message).not.toContain('person@example.com');
  });

  it('reports a missing database column as a server error, not a client error', async () => {
    const app = express();
    app.get('/orders', () => {
      throw new Prisma.PrismaClientKnownRequestError('Missing column', {
        code: 'P2022',
        clientVersion: '7.10.0',
        meta: { modelName: 'Order', column: 'deliveryPricingSnapshot' },
      });
    });
    app.use(errorHandler);

    const response = await request(app).get('/orders');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('DATABASE_SCHEMA_MISMATCH');
    expect(response.body.error.message).toContain('database field');
  });
});