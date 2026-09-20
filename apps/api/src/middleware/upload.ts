import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Request } from 'express';
import { MAX_IMAGE_BYTES, SUPPORTED_IMAGE_TYPES } from '@delivery/shared';
import { UPLOAD_DIR } from '../config/env';
import { badRequest } from '../lib/errors';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    ensureUploadDir();
    callback(null, UPLOAD_DIR);
  },
  filename(_req, file, callback) {
    const extension = EXTENSIONS[file.mimetype] ?? path.extname(file.originalname) ?? '.bin';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
    callback(null, name);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, callback: multer.FileFilterCallback) {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.mimetype)) {
    callback(badRequest('Only JPG, PNG, WEBP or AVIF images can be uploaded.'));
    return;
  }
  callback(null, true);
}

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('file');