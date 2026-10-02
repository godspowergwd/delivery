import { describe, expect, it } from 'vitest';
import { sniffImageType } from './image-signature';

function withPayload(signature: number[], filler = 'payload-bytes'): Buffer {
  return Buffer.concat([Buffer.from(signature), Buffer.from(filler)]);
}

describe('image signature sniffing', () => {
  it('recognises genuine JPEG, PNG, WEBP and AVIF bytes', () => {
    expect(sniffImageType(withPayload([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffImageType(withPayload([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(
      sniffImageType(
        Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1')]),
      ),
    ).toBe('image/webp');
    expect(
      sniffImageType(
        Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp', 'latin1'), Buffer.from('avif', 'latin1')]),
      ),
    ).toBe('image/avif');
  });

  it('rejects scripts, documents and short/truncated buffers', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.4 fake pdf'))).toBeNull();
    expect(sniffImageType(Buffer.from('<html><body>hi</body></html>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(
      sniffImageType(
        Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp', 'latin1'), Buffer.from('heic', 'latin1')]),
      ),
    ).toBeNull();
  });
});
