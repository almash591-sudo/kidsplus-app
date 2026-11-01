import type { IceConfig } from '@kidsplus/shared/calls';
import type { Db } from '@kidsplus/db';
import type { PushSend } from '@kidsplus/db/notify';
import type { MediaStorage, YouTubeDataApi } from '@kidsplus/providers';
import type { EmojiCatalog } from './services/emoji';
import type { TtsSettings } from './services/media';

export interface AppConfig {
  /** Токен создания первого аккаунта; без него /setup отключён. */
  setupToken?: string | undefined;
  /** Публичный адрес детского PWA (для ссылки в QR-коде). */
  kidAppUrl: string;
  /** Число доверенных прокси перед api. */
  trustProxyHops: number;
  tts: TtsSettings;
  moderation: {
    /** Видео длиннее не отправляются на анализ. */
    maxVideoSec: number;
    /** Лимиты токенов модели — только для показа родителю (соблюдает их worker). */
    dailyTokenLimit: number;
    totalTokenLimit: number;
  };
  /** Снимки ребёнка: квота копий на сервере, сверх — удаляются самые старые. */
  captures: { quotaBytes: number };
  /** Токен публикации новой версии киоска (только у компьютера владельца); нет — публикация выключена. */
  kioskPublishToken?: string | undefined;
  /** Серверы ICE для звонков (STUN/TURN); по умолчанию — открытые STUN. */
  ice?: IceConfig;
}

/** Клиент YouTube Data API (null — ключ не задан, работаем через oEmbed). */
export type YouTubeClient = Pick<
  YouTubeDataApi,
  'videos' | 'playlistVideoIds' | 'channelUploadsPlaylist'
>;

/** Зависимости обработчиков. `fetch`, `now` и `storage` подменяются в тестах. */
export interface Ctx {
  db: Db;
  config: AppConfig;
  storage: MediaStorage;
  /** Аудиотека — отдельный bucket (R2) или то же хранилище медиа. */
  audioStorage: MediaStorage;
  emoji: EmojiCatalog;
  fetch: typeof fetch;
  now: () => Date;
  youtube: YouTubeClient | null;
  /** Web Push: открытый ключ VAPID (для подписки в браузере) и отправка; null — не настроено. */
  push: { publicKey: string; sender: PushSend } | null;
}

export const MAX_PARENTS = 2;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const INVITE_TTL_MS = 24 * 3600 * 1000;
/** Приглашение новой семьи живёт дольше: его пересылают родственникам. */
export const FAMILY_INVITE_TTL_MS = 14 * 24 * 3600 * 1000;
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Код в QR-коде настройки Android (этап 53): сброс, скачивание и установка киоска — долго. */
export const SETUP_PAIRING_TTL_MS = 60 * 60 * 1000;
/** Chrome ограничивает срок жизни cookie 400 днями; продлеваем при каждом обращении. */
export const DEVICE_COOKIE_MAX_AGE_S = 400 * 24 * 3600;
