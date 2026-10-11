import { randomUUID } from 'node:crypto';
import { schema, type Db } from '@kidsplus/db';
import { saveSvgAsset } from '@kidsplus/db/media';
import { ttsCacheKey, type MediaStorage, type TtsLanguage } from '@kidsplus/providers';
import { mediaUrl, type MediaRef } from '@kidsplus/shared/api';
import { eq, inArray } from 'drizzle-orm';
import { HttpError } from '../lib/http';

const { mediaAssets } = schema;

export interface TtsSettings {
  providerId: string;
  speed: number;
  voices: Partial<Record<TtsLanguage, string>>;
}

type Exec = Pick<Db, 'select' | 'insert'>;
type Asset = typeof mediaAssets.$inferSelect;

export const toMediaRef = (a: Pick<Asset, 'id' | 'status'>): MediaRef => ({
  id: a.id,
  url: mediaUrl(a.id),
  status: a.status,
});

/**
 * Возвращает id озвучки фразы (null в режиме browser). Если такой фразы (текст + язык + голос + скорость) ещё нет —
 * создаёт запись со статусом pending; worker сгенерирует её один раз. Повторно не генерируется.
 */
export async function ensureTts(
  exec: Exec,
  tts: TtsSettings,
  text: string,
  lang: TtsLanguage,
): Promise<string | null> {
  // Озвучивает телефон (Web Speech API) — на сервере аудио не создаётся.
  if (tts.providerId === 'browser') return null;
  const request = {
    text: text.trim(),
    lang,
    speed: tts.speed,
    ...(tts.voices[lang] ? { voice: tts.voices[lang] } : {}),
  };
  const ttsKey = ttsCacheKey(tts.providerId, request);
  await exec
    .insert(mediaAssets)
    .values({
      kind: 'audio',
      status: 'pending',
      source: 'tts',
      ttsKey,
      ttsText: request.text,
      ttsLang: lang,
      ttsVoice: request.voice ?? null,
      ttsSpeed: tts.speed,
    })
    .onConflictDoNothing({ target: mediaAssets.ttsKey });
  const [row] = await exec
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.ttsKey, ttsKey));
  return row!.id;
}

export async function loadAssets(
  exec: Pick<Db, 'select'>,
  ids: (string | null)[],
): Promise<Map<string, Asset>> {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!wanted.length) return new Map();
  const rows = await exec.select().from(mediaAssets).where(inArray(mediaAssets.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Проверяет, что все id — существующие картинки. */
export async function assertImages(exec: Pick<Db, 'select'>, ids: string[]) {
  const assets = await loadAssets(exec, ids);
  for (const id of ids) {
    if (assets.get(id)?.kind !== 'image')
      throw new HttpError(400, 'validation', 'картинка не найдена');
  }
}

// ─── Картинки ────────────────────────────────────────────────────────────────

const IMAGE_SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      Buffer.from(b.subarray(0, 4)).toString() === 'RIFF' &&
      Buffer.from(b.subarray(8, 12)).toString() === 'WEBP',
  },
];

/** Тип картинки по содержимому, а не по заголовку запроса. SVG от родителя не принимаем. */
export function sniffImage(data: Uint8Array) {
  return IMAGE_SIGNATURES.find((s) => s.test(data)) ?? null;
}

export async function saveUpload(db: Db, storage: MediaStorage, data: Uint8Array) {
  const kind = sniffImage(data);
  if (!kind)
    throw new HttpError(415, 'unsupported_image', 'поддерживаются картинки PNG, JPEG и WebP');
  const key = `images/${randomUUID()}.${kind.ext}`;
  await storage.put(key, data, kind.mime);
  const [row] = await db
    .insert(mediaAssets)
    .values({
      kind: 'image',
      source: 'upload',
      storageKey: key,
      mimeType: kind.mime,
      bytes: data.byteLength,
    })
    .returning();
  return row!;
}

/** Эмодзи Twemoji: копируется в хранилище один раз и переиспользуется. */
export const saveEmoji = (db: Db, storage: MediaStorage, code: string, svg: Uint8Array) =>
  saveSvgAsset(db, storage, {
    source: 'twemoji',
    sourceRef: code,
    svg,
    storageKey: `emoji/${code}.svg`,
  });
