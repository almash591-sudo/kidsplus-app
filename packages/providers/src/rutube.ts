// RuTube: метаданные видео через открытый API без ключа (этап 54). Видео не скачиваются.
import { z } from 'zod';

export interface RuTubeVideoDetails {
  externalId: string;
  title: string;
  channelTitle: string | null;
  durationSec: number;
  /** Только с pic.rtbcdn.ru — этот домен разрешён в CSP кабинета и детского приложения. */
  thumbnailUrl: string | null;
  /** 18+ по разметке RuTube. */
  adult: boolean;
  /** Скрыто владельцем или удалено. */
  hidden: boolean;
  /** Платное или по подписке, трансляция или аудио — детский плеер такое не покажет. */
  notEmbeddable: boolean;
  /** Возрастная метка: 0, 6, 12, 16, 18; null — нет. */
  ageRating: number | null;
  /** Где можно смотреть (коды ISO); null — везде. */
  allowedCountries: string[] | null;
  restrictedCountries: string[];
}

/** С какой возрастной метки видео не для малышей. */
export const RUTUBE_MAX_AGE = 12;

export class RuTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** Сеть, 429, 5xx — можно повторить позже. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const flag = z.boolean().nullish();
const apiVideo = z.object({
  id: z.string(),
  title: z.string().nullish(),
  duration: z.number().nullish(),
  thumbnail_url: z.string().nullish(),
  author: z.object({ name: z.string().nullish() }).nullish(),
  is_adult: flag,
  is_hidden: flag,
  is_deleted: flag,
  is_paid: flag,
  is_club: flag,
  is_livestream: flag,
  is_audio: flag,
  pg_rating: z.object({ age: z.number().nullish() }).nullish(),
  restrictions: z
    .object({
      country: z
        .object({
          allowed: z.array(z.string()).nullish(),
          restricted: z.array(z.string()).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

const THUMB = /^https:\/\/pic\.rtbcdn\.ru\/[\w./-]+\.(?:jpe?g|png|webp)$/i;

/** Метаданные одного видео; null — видео нет (удалено или не было). */
export async function fetchRuTubeVideo(
  fetchFn: typeof fetch,
  id: string,
): Promise<RuTubeVideoDetails | null> {
  let res: Response;
  try {
    res = await fetchFn(`https://rutube.ru/api/video/${id}/`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new RuTubeApiError(`RuTube недоступен: ${(err as Error).message}`, 0);
  }
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new RuTubeApiError(`RuTube ответил ${res.status}`, res.status);
  const parsed = apiVideo.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new RuTubeApiError('RuTube прислал непонятный ответ', 502);
  const v = parsed.data;
  const country = v.restrictions?.country;
  const str = (x: string | null | undefined) => (x?.trim() ? x.trim() : null);
  return {
    externalId: id,
    title: str(v.title) ?? 'Без названия',
    channelTitle: str(v.author?.name),
    durationSec: Math.round(v.duration ?? 0),
    thumbnailUrl: v.thumbnail_url && THUMB.test(v.thumbnail_url) ? v.thumbnail_url : null,
    adult: Boolean(v.is_adult),
    hidden: Boolean(v.is_hidden || v.is_deleted),
    notEmbeddable: Boolean(v.is_paid || v.is_club || v.is_livestream || v.is_audio),
    ageRating: v.pg_rating?.age ?? null,
    allowedCountries: country?.allowed?.length ? country.allowed : null,
    restrictedCountries: country?.restricted ?? [],
  };
}

/** Видео нельзя смотреть в стране `region` (код ISO). */
export function ruTubeRegionBlocked(d: RuTubeVideoDetails, region: string): boolean {
  const r = region.toUpperCase();
  return (
    d.restrictedCountries.includes(r) ||
    (d.allowedCountries !== null && !d.allowedCountries.includes(r))
  );
}

export type RuTubeUnavailable = 'not_found' | 'not_public' | 'not_for_kids' | 'not_embeddable';

/** Почему видео нельзя показывать ребёнку (регион проверяется отдельно) или null. */
export function ruTubeUnavailable(d: RuTubeVideoDetails | null): RuTubeUnavailable | null {
  if (!d) return 'not_found';
  if (d.hidden) return 'not_public';
  if (d.adult || (d.ageRating ?? 0) >= RUTUBE_MAX_AGE) return 'not_for_kids';
  if (d.notEmbeddable) return 'not_embeddable';
  return null;
}
