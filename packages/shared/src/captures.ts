// Камера ребёнка (этап 9): фото без серийной съёмки, видео до 30 секунд; копия — в кабинете.
// Снимки хранятся только на телефоне и на сервере KidsPlus — в модель и другие сервисы не идут.
import { z } from 'zod';

export const CAPTURE_KINDS = ['photo', 'video'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

/** Пауза между фото: серийной съёмки нет. */
export const PHOTO_COOLDOWN_MS = 2000;
/** Видео останавливается само. */
export const VIDEO_MAX_MS = 30_000;
/** Длинная сторона фото на сервере (копия для кабинета). */
export const PHOTO_MAX_SIDE = 1600;
/** Сжатие видео: 720p, ~1 Мбит/с — 30 секунд ≈ 4 МБ. */
export const VIDEO_BITS_PER_SECOND = 1_000_000;

export const CAPTURE_MAX_BYTES: Record<CaptureKind, number> = {
  photo: 3 * 1024 * 1024,
  video: 10 * 1024 * 1024,
};
/** Снимков в день на ребёнка. */
export const CAPTURE_DAILY_LIMIT: Record<CaptureKind, number> = { photo: 30, video: 10 };
/** Квота копий на сервере по умолчанию; сверх — удаляются самые старые. */
export const CAPTURES_QUOTA_MB = 200;

export const CAPTURE_MIME: Record<CaptureKind, readonly string[]> = {
  photo: ['image/jpeg'],
  video: ['video/mp4', 'video/webm'],
};

/** Параметры загрузки (тело запроса — сам файл). */
export const captureUploadQuery = z.object({
  kind: z.enum(CAPTURE_KINDS),
  mime: z.string().max(60),
  durationMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(VIDEO_MAX_MS + 2000)
    .optional(),
  /** Когда снято на телефоне (копия могла ждать связи). */
  takenAt: z.iso.datetime().optional(),
});
export type CaptureUploadQuery = z.input<typeof captureUploadQuery>;

/** Сколько снято сегодня и сколько можно. */
export interface CaptureToday {
  photo: { used: number; limit: number };
  video: { used: number; limit: number };
}

export interface ParentCapture {
  id: string;
  childId: string;
  kind: CaptureKind;
  mimeType: string;
  bytes: number;
  durationMs: number | null;
  takenAt: string;
}

export interface CaptureUsage {
  bytes: number;
  quotaBytes: number;
}

/** Тип по первым байтам файла — не доверяем заголовку. */
export function sniffCapture(data: Uint8Array): string | null {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3)
    return 'video/webm';
  if (String.fromCharCode(...data.slice(4, 8)) === 'ftyp') return 'video/mp4';
  return null;
}
