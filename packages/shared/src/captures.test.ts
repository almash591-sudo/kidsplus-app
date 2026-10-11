import { describe, expect, it } from 'vitest';
import { captureUploadQuery, sniffCapture } from './captures';

describe('снимки', () => {
  it('тип определяется по содержимому', () => {
    expect(sniffCapture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffCapture(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]))).toBe('video/webm');
    expect(sniffCapture(new TextEncoder().encode('\0\0\0 ftypisom'))).toBe('video/mp4');
    expect(sniffCapture(new TextEncoder().encode('<svg>'))).toBeNull();
  });

  it('видео длиннее 32 секунд не принимается', () => {
    expect(
      captureUploadQuery.safeParse({ kind: 'video', mime: 'video/mp4', durationMs: '30000' })
        .success,
    ).toBe(true);
    expect(
      captureUploadQuery.safeParse({ kind: 'video', mime: 'video/mp4', durationMs: '40000' })
        .success,
    ).toBe(false);
  });
});
