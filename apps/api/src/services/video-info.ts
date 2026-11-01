import { fetchRuTubeVideo, RuTubeApiError, ruTubeUnavailable } from '@kidsplus/providers';
import type { VideoRef } from '@kidsplus/shared/video-url';
import { HttpError } from '../lib/http';
import { fetchYouTubeOEmbed, type OEmbedInfo } from './oembed';

export interface VideoInfo {
  /** Название, канал и превью — для таблицы video_sources. */
  info: OEmbedInfo;
  /** Страны, где видео можно смотреть; null — везде или неизвестно. */
  onlyIn: string[] | null;
}

/** Почему RuTube-видео не берём — код и текст для родителя. */
const RUTUBE_REFUSAL = {
  not_found: ['video_not_found', 'видео не найдено, скрыто или удалено'],
  not_public: ['video_not_found', 'видео не найдено, скрыто или удалено'],
  not_for_kids: ['not_for_kids', 'видео помечено 12+ или 18+ — малышам его не показываем'],
  not_embeddable: ['embedding_disabled', 'платное видео, трансляция или аудио — встроить нельзя'],
} as const;

/**
 * Метаданные видео для формы и проверки (этап 54: YouTube или RuTube). 422 — видео нельзя
 * показывать ребёнку, 502 — сервис не ответил.
 */
export async function fetchVideoInfo(fetchFn: typeof fetch, ref: VideoRef): Promise<VideoInfo> {
  if (ref.provider === 'youtube')
    return { info: await fetchYouTubeOEmbed(fetchFn, ref.externalId), onlyIn: null };

  const d = await fetchRuTubeVideo(fetchFn, ref.externalId).catch((err: unknown) => {
    if (err instanceof RuTubeApiError)
      throw new HttpError(502, 'provider_unavailable', 'RuTube не отвечает, попробуйте позже');
    throw err;
  });
  const refusal = ruTubeUnavailable(d);
  if (refusal) {
    const [code, message] = RUTUBE_REFUSAL[refusal];
    throw new HttpError(422, code, message);
  }
  return {
    info: { title: d!.title, channelTitle: d!.channelTitle, thumbnailUrl: d!.thumbnailUrl },
    onlyIn: d!.allowedCountries,
  };
}
