import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler';
import { uploadsRouter } from './uploads.routes';
import { signAccessToken } from '../lib/tokens';
import { prisma } from '../lib/prisma';
import * as r2Service from '../services/r2.service';
import * as activityLogService from '../services/activity-log.service';

vi.mock('../lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../services/r2.service', () => ({
  uploadToR2: vi.fn(),
}));

vi.mock('../services/activity-log.service', () => ({
  logActivity: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/v1/uploads', uploadsRouter);
app.use(errorHandler);

describe('Uploads Route (POST /api/v1/uploads)', () => {
  const sessionId = 'session-123';
  const userId = 'user-123';

  function mockAuthUser(role: 'ADMIN' | 'KITCHEN' | 'CUSTOMER' | 'DRIVER', isActive = true) {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: sessionId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      userId,
    } as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: userId,
      name: 'Test Actor',
      email: 'test@example.com',
      phone: '+233200000000',
      role,
      isActive,
      isProtected: false,
      avatarUrl: null,
    } as never);

    return signAccessToken({
      sub: userId,
      sessionId,
      role,
      email: 'test@example.com',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when request is unauthenticated', async () => {
    const response = await request(app)
      .post('/api/v1/uploads')
      .attach('file', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when authenticated user is not kitchen or admin (e.g. CUSTOMER)', async () => {
    const token = mockAuthUser('CUSTOMER');

    const response = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.error.message).toContain('KITCHEN, ADMIN');
  });

  it('returns 403 when authenticated user is a DRIVER', async () => {
    const token = mockAuthUser('DRIVER');

    const response = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 when authenticated as kitchen/admin but no image file is attached', async () => {
    const token = mockAuthUser('ADMIN');

    const response = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.message).toBe('Choose an image file to upload (JPG, PNG, WEBP or AVIF).');
  });

  it('returns 400 when attached file is an unsupported format', async () => {
    const token = mockAuthUser('KITCHEN');

    const response = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4 fake pdf'), 'document.pdf');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.message).toBe('Only JPG, PNG, WEBP or AVIF images can be uploaded.');
  });
  it('returns 201 and uploads image when authenticated as ADMIN with a valid file', async () => {
    const token = mockAuthUser('ADMIN');

    const mockUploadResult = {
      url: 'https://cdn.example.com/uploads/12345678-abc.png',
      key: 'uploads/12345678-abc.png',
      size: 1024,
      mimeType: 'image/png',
    };
    vi.mocked(r2Service.uploadToR2).mockResolvedValue(mockUploadResult);

    const fileContent = Buffer.from('fake-png-content');
    const response = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileContent, 'food.png');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      url: mockUploadResult.url,
      fileName: mockUploadResult.key,
      size: mockUploadResult.size,
      mimeType: mockUploadResult.mimeType,
    });

    expect(r2Service.uploadToR2).toHaveBeenCalledTimes(1);
    const uploadedFileArg = vi.mocked(r2Service.uploadToR2).mock.calls[0][0];
    expect(uploadedFileArg.originalname).toBe('food.png');
    expect(uploadedFileArg.mimetype).toBe('image/png');

    expect(activityLogService.logActivity).toHaveBeenCalledTimes(1);
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IMAGE_UPLOADED',
        entity: 'Upload',
        entityId: mockUploadResult.key,
        userId,
        actorEmail: 'test@example.com',
        actorRole: 'ADMIN',
      }),
    );
  });

  it('returns 201 and uploads image when authenticated as KITCHEN with a valid file', async () => {
    const token = mockAuthUser('KITCHEN');

    const mockUploadResult = {
      url: 'https://cdn.example.com/uploads/87654321-xyz.webp',
      key: 'uploads/87654321-xyz.webp',
      size: 2048,
      mimeType: 'image/webp',
    };
    vi.mocked(r2Service.uploadToR2).mockResolvedValue(mockUploadResult);

    const fileContent = Buffer.from('fake-webp-content');
    const response = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileContent, 'food.webp');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      url: mockUploadResult.url,
      fileName: mockUploadResult.key,
      size: mockUploadResult.size,
      mimeType: mockUploadResult.mimeType,
    });

    expect(r2Service.uploadToR2).toHaveBeenCalledTimes(1);
    expect(activityLogService.logActivity).toHaveBeenCalledTimes(1);
    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IMAGE_UPLOADED',
        entity: 'Upload',
        entityId: mockUploadResult.key,
        userId,
        actorEmail: 'test@example.com',
        actorRole: 'KITCHEN',
      }),
    );
  });
});
