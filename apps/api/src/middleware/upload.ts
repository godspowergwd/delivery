import fs from 'node:fs';
import multer from 'multer';
import type { Request } from 'express';
import { MAX_IMAGE_BYTES, SUPPORTED_IMAGE_TYPES } from '@delivery/shared';
import { UPLOAD_DIR } from '../config/env';
import { badRequest } from '../lib/errors';
import { sniffImageType } from '../lib/image-signature';

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.memoryStorage();

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

/**
 * Second upload gate, applied after Multer has buffered the file.
 *
 * The browser's Content-Type (checked by `fileFilter`) is attacker-controlled, so
 * the leading bytes of the payload must match a real image signature as well.
 * Anything else - an SVG, a PDF, an HTML document, a script renamed to .png - is
 * refused before it can reach object storage.
 */
export function assertImageSignature(file: Express.Multer.File): void {
  if (!file.buffer || file.buffer.length === 0) {
    throw badRequest('That image file is empty. Please choose another one.');
  }
  const sniffed = sniffImageType(file.buffer);
  if (!sniffed || sniffed !== file.mimetype) {
    throw badRequest('That file is not a valid JPG, PNG, WEBP or AVIF image.');
  }
}
