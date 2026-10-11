export type VideoProviderId = 'youtube';

export interface VideoMetadata {
  provider: VideoProviderId;
  externalId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  embeddable: boolean;
  madeForKids: boolean | null;
  thumbnailUrl: string | null;
}

/** Серверная часть провайдера видео: метаданные и проверка доступности. Видео не скачиваются. */
export interface VideoProvider {
  readonly id: VideoProviderId;
  /** Извлекает внешний ID из ссылки; null, если ссылка не этого провайдера. */
  parseUrl(url: string): string | null;
  getMetadata(externalIds: string[]): Promise<VideoMetadata[]>;
}
