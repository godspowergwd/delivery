/** Supported image signatures: the bytes decide, never the browser's MIME label. */
export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const AVIF_BRANDS = new Set(['avif', 'avis']);

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

/**
 * Reads the leading bytes of an upload and reports the real image type.
 *
 * A browser-supplied Content-Type or file extension is trivially forged, so the
 * upload path rejects anything that is not a genuine JPG/PNG/WEBP/AVIF stream.
 */
export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (!buffer || buffer.length < 12) return null;
  if (startsWith(buffer, JPEG)) return 'image/jpeg';
  if (startsWith(buffer, PNG)) return 'image/png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buffer.toString('latin1', 8, 12);
    if (AVIF_BRANDS.has(brand)) return 'image/avif';
  }
  return null;
}