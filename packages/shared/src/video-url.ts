// Ссылка на видео любого поддерживаемого сервиса (этап 54: YouTube и RuTube).
import type { VideoProvider } from './api';
import { parseRuTubeId, parseRuTubeStart } from './rutube';
import { parseYouTubeId, parseYouTubeStart } from './youtube';

export interface VideoRef {
  provider: VideoProvider;
  externalId: string;
}

export const PROVIDER_NAMES: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  rutube: 'RuTube',
};

/** Сервис, ID видео и время из ссылки; null — это не ссылка на видео YouTube или RuTube. */
export function parseVideoUrl(input: string): (VideoRef & { startSec: number | null }) | null {
  const youtube = parseYouTubeId(input);
  if (youtube)
    return { provider: 'youtube', externalId: youtube, startSec: parseYouTubeStart(input) };
  const rutube = parseRuTubeId(input);
  if (rutube) return { provider: 'rutube', externalId: rutube, startSec: parseRuTubeStart(input) };
  return null;
}

/** Страница видео на сайте сервиса — для родителя (ребёнок ссылок не видит). */
export function videoPageUrl({ provider, externalId }: VideoRef): string {
  return provider === 'rutube'
    ? `https://rutube.ru/video/${externalId}/`
    : `https://www.youtube.com/watch?v=${externalId}`;
}
