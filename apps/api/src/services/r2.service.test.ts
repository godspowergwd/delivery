import { afterEach, describe, expect, it, vi } from 'vitest';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { getR2Client, resetR2Client, uploadToR2 } from './r2.service';

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  const sendMock = vi.fn().mockResolvedValue({});
  class MockS3Client {
    send = sendMock;
  }
  return {
    ...actual,
    S3Client: MockS3Client,
  };
});

describe('Cloudflare R2 Service', () => {
  const originalEnv = { ...env };

  afterEach(() => {
    resetR2Client();
    Object.assign(env, originalEnv);
    vi.clearAllMocks();
  });

  it('fails if R2 credentials or bucket are missing', async () => {
    env.R2_BUCKET_NAME = 'delivery-bucket';
    env.R2_ACCOUNT_ID = '';
    env.R2_ACCESS_KEY_ID = '';
    env.R2_SECRET_ACCESS_KEY = '';

    const dummyFile = {
      buffer: Buffer.from('image content'),
      originalname: 'waakye.jpg',
      mimetype: 'image/jpeg',
      size: 13,
    } as Express.Multer.File;

    await expect(uploadToR2(dummyFile)).rejects.toMatchObject({
      statusCode: 500,
      message: 'Cloudflare R2 storage is not configured properly.',
    });
  });

  it('fails if R2 bucket name is missing', async () => {
    env.R2_ACCOUNT_ID = 'cf-acc-123';
    env.R2_ACCESS_KEY_ID = 'key-id';
    env.R2_SECRET_ACCESS_KEY = 'secret-key';
    env.R2_BUCKET_NAME = '';

    const dummyFile = {
      buffer: Buffer.from('image content'),
      originalname: 'waakye.jpg',
      mimetype: 'image/jpeg',
      size: 13,
    } as Express.Multer.File;

    await expect(uploadToR2(dummyFile)).rejects.toMatchObject({
      statusCode: 500,
      message: 'Cloudflare R2 bucket name (R2_BUCKET_NAME) is not configured.',
    });
  });

  it('uploads image buffer to R2 and constructs public URL with custom public URL', async () => {
    env.R2_ACCOUNT_ID = 'cf-acc-123';
    env.R2_ACCESS_KEY_ID = 'key-id';
    env.R2_SECRET_ACCESS_KEY = 'secret-key';
    env.R2_BUCKET_NAME = 'my-bucket';
    env.R2_PUBLIC_URL = 'https://cdn.example.com';

    const client = getR2Client();
    const sendSpy = vi.spyOn(client, 'send').mockResolvedValue({} as never);

    const dummyFile = {
      buffer: Buffer.from('image-binary-data'),
      originalname: 'delicious-food.png',
      mimetype: 'image/png',
      size: 17,
    } as Express.Multer.File;

    const result = await uploadToR2(dummyFile);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'my-bucket',
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
      Body: dummyFile.buffer,
    });
    expect(command.input.Key).toMatch(/^uploads\/\d+-[a-f0-9]+\.png$/);

    expect(result).toMatchObject({
      url: expect.stringMatching(/^https:\/\/cdn\.example\.com\/uploads\/\d+-[a-f0-9]+\.png$/),
      key: expect.stringMatching(/^uploads\/\d+-[a-f0-9]+\.png$/),
      size: 17,
      mimeType: 'image/png',
    });
  });

  it('falls back to default R2 bucket domain when R2_PUBLIC_URL is not set', async () => {
    env.R2_ACCOUNT_ID = 'acc-999';
    env.R2_ACCESS_KEY_ID = 'key-id';
    env.R2_SECRET_ACCESS_KEY = 'secret-key';
    env.R2_BUCKET_NAME = 'delivery-store';
    env.R2_PUBLIC_URL = '';

    const client = getR2Client();
    vi.spyOn(client, 'send').mockResolvedValue({} as never);

    const dummyFile = {
      buffer: Buffer.from('webp-data'),
      originalname: 'food.webp',
      mimetype: 'image/webp',
      size: 9,
    } as Express.Multer.File;

    const result = await uploadToR2(dummyFile);

    expect(result.url).toMatch(
      /^https:\/\/delivery-store\.acc-999\.r2\.cloudflarestorage\.com\/uploads\/\d+-[a-f0-9]+\.webp$/,
    );
  });
});

