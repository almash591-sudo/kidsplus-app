// Аудиотека семьи (этап 20): mp3 и m4a, которые родители загружают в кабинете; с этапа 42 —
// и свои видео MP4 (клипы, семейные ролики). Детям — только файлы с отметкой «детям».
import { z } from 'zod';

/** Предел одного файла: песня или сказка — это 3–30 МБ. */
export const AUDIO_TRACK_MAX_BYTES = 60 * 1024 * 1024;

export const AUDIO_MIME = ['audio/mpeg', 'audio/mp4', 'video/mp4'] as const;
export type AudioMime = (typeof AUDIO_MIME)[number];

export interface AudioTrack {
  id: string;
  title: string;
  mimeType: string;
  bytes: number;
  forKids: boolean;
  /** Адрес файла (с поддержкой перемотки) — для плеера. */
  url: string;
  createdAt: string;
}

/** Трек на телефоне ребёнка — без служебных полей. */
export interface KidAudioTrack {
  id: string;
  title: string;
  url: string;
  /** Видео (этап 42) — открывается в плеере на весь экран. */
  video: boolean;
}

export const isVideo = (mime: string) => mime.startsWith('video/');

export const audioUploadQuery = z.object({
  title: z.string().trim().min(1, 'укажите название').max(200),
  forKids: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
});

export const audioUpdate = z
  .object({
    title: z.string().trim().min(1, 'укажите название').max(200),
    forKids: z.boolean(),
  })
  .partial();
export type AudioUpdate = z.input<typeof audioUpdate>;

/**
 * Настоящий тип файла по содержимому: MP3 (ID3 или кадр MPEG), M4A или видео MP4. Контейнер у
 * M4A и MP4 один; видео — если в нём есть видеодорожка (обработчик «vide» в описании дорожек).
 */
export function sniffAudio(data: Uint8Array): AudioMime | null {
  if (data.length < 12) return null;
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) return 'audio/mpeg'; // «ID3»
  if (data[0] === 0xff && (data[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  const ftyp = String.fromCharCode(data[4]!, data[5]!, data[6]!, data[7]!);
  if (ftyp !== 'ftyp') return null;
  const brand = String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!);
  if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
  return hasVideoTrack(data) ? 'video/mp4' : 'audio/mp4';
}

/** Есть ли в MP4 дорожка «vide»: «hdlr» + 4 байта версии + 4 байта pre_defined + тип. */
function hasVideoTrack(data: Uint8Array): boolean {
  for (let i = 0; i + 16 <= data.length; i++)
    if (
      data[i] === 0x68 && // h
      data[i + 1] === 0x64 && // d
      data[i + 2] === 0x6c && // l
      data[i + 3] === 0x72 && // r
      data[i + 12] === 0x76 && // v
      data[i + 13] === 0x69 && // i
      data[i + 14] === 0x64 && // d
      data[i + 15] === 0x65 // e
    )
      return true;
  return false;
}

/** Название из имени файла: без расширения, «_» и «-» — пробелы. */
export function titleFromFile(name: string): string {
  const base = name
    .replace(/\.[^.]{1,5}$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
  return (base || 'Без названия').slice(0, 200);
}

/**
 * Заголовок Range («bytes=100-», «bytes=0-499», «bytes=-500») → границы включительно.
 * null — заголовка нет или несколько диапазонов (отдаём файл целиком); 'invalid' — за пределами.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return 'invalid';
  let start: number;
  let end: number;
  if (!a) {
    start = Math.max(0, size - Number(b));
    end = size - 1;
  } else {
    start = Number(a);
    end = b ? Math.min(Number(b), size - 1) : size - 1;
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
