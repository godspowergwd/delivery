import crypto from 'node:crypto';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { badGateway, badRequest, internalError } from '../lib/errors';
import { logger } from '../lib/logger';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw internalError('Cloudflare R2 storage is not configured properly.');
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}

export function resetR2Client(): void {
  cachedClient = null;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

/**
 * Uploads a file buffer from Multer memory storage directly to Cloudflare R2
 * and returns the public URL and metadata.
 */
export async function uploadToR2(file: Express.Multer.File): Promise<UploadResult> {
  if (!file || !file.buffer) {
    throw badRequest('No file buffer provided for upload.');
  }

  const bucketName = env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw internalError('Cloudflare R2 bucket name (R2_BUCKET_NAME) is not configured.');
  }

  const extension = EXTENSIONS[file.mimetype] ?? path.extname(file.originalname) ?? '.bin';
  const key = `uploads/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;

  const client = getR2Client();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } catch (error) {
    logger.error('Failed to upload file to Cloudflare R2', { error, key, bucket: bucketName });
    throw badGateway('Failed to upload image to storage provider.');
  }

  const publicUrlBase = env.R2_PUBLIC_URL.replace(/\/+$/, '');
  const publicUrl = publicUrlBase
    ? `${publicUrlBase}/${key}`
    : `https://${bucketName}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

  return {
    url: publicUrl,
    key,
    size: file.size,
    mimeType: file.mimetype,
  };
}
