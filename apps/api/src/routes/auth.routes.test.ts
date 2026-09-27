import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/errorHandler';
import { authRouter } from './auth.routes';

const app = express();
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use(errorHandler);

describe('refresh session CSRF recovery', () => {
  it('returns the current CSRF cookie without caching when a refresh cookie exists', async () => {
    const response = await request(app)
      .get('/api/auth/csrf')
      .set('Cookie', ['ds_refresh=opaque-refresh', 'ds_csrf=current-csrf']);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ csrfToken: 'current-csrf' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not bootstrap CSRF state without a refresh session', async () => {
    const response = await request(app).get('/api/auth/csrf');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns an explicit CSRF mismatch for stale double-submit state', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['ds_refresh=opaque-refresh', 'ds_csrf=current-csrf'])
      .set('x-csrf-token', 'stale-csrf');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_MISMATCH');
  });

  it('returns 401 when the refresh cookie is absent', async () => {
    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
