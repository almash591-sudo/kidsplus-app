import { z } from 'zod';

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
const logLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info');
const databaseUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'ожидается строка подключения postgres://…');
/** Пустая строка из .env — как незаданная переменная. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** Хранилище медиа: диск (разработка), таблица в PostgreSQL (бесплатный Railway) или S3-bucket. */
const storageEnv = {
  STORAGE_DRIVER: z.enum(['fs', 'db', 's3']).default('fs'),
  /** Папка медиа для STORAGE_DRIVER=fs; путь относительно папки приложения. */
  MEDIA_DIR: z.string().default('../../media'),
  S3_ENDPOINT: optional(z.url()),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
};

/** Озвучка: от этих значений зависит ключ кэша, поэтому они общие для api и worker. */
const ttsEnv = {
  /** browser — озвучивает телефон (Web Speech API), сервер аудио не создаёт; google — Google Cloud TTS. */
  TTS_PROVIDER: z.enum(['browser', 'google']).default('browser'),
  /** Скорость речи: медленнее обычной — для малышей. */
  TTS_SPEED: z.coerce.number().min(0.5).max(1.5).default(0.85),
  TTS_VOICE_RU: optional(z.string()),
  TTS_VOICE_EN: optional(z.string()),
  TTS_VOICE_ZH: optional(z.string()),
};

const requireS3 = (
  env: { STORAGE_DRIVER: string } & Record<string, unknown>,
  ctx: z.RefinementCtx,
) => {
  if (env.STORAGE_DRIVER !== 's3') return;
  for (const key of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    if (!env[key])
      ctx.addIssue({ code: 'custom', path: [key], message: `обязателен при STORAGE_DRIVER=s3` });
  }
};

/** Модерация видео (п. 7.1 ТЗ): метаданные YouTube и анализ моделью (Gemini). Общие для api и worker. */
const moderationEnv = {
  /** Ключ YouTube Data API v3. Без него — только oEmbed (без длительности и «для детей»). */
  YOUTUBE_API_KEY: optional(z.string().min(10)),
  /** Регион, в котором смотрят дети, — для проверки региональных ограничений видео. */
  VIDEO_REGION: z.string().length(2).default('RU'),
  /** Видео длиннее не анализируются (минуты). */
  /** Серверы ICE для звонков (JSON {"iceServers":[…]}); пусто — открытые STUN (этап 10). */
  ICE_SERVERS: optional(z.string().max(4000)),
  /** Квота копий фото и видео детей на сервере, МБ (этап 9). */
  CAPTURES_QUOTA_MB: z.coerce.number().int().min(10).max(100_000).default(200),
  MODERATION_MAX_VIDEO_MIN: z.coerce.number().int().min(1).max(180).default(30),
  /** Модель анализа видео. */
  LLM_MODEL_MAIN: z.string().min(1).default('gemini-3.8-flash'),
  /** Лимиты токенов модели: в сутки и всего (п. 7.4 ТЗ). */
  LLM_DAILY_TOKEN_LIMIT: z.coerce.number().int().min(0).default(2_000_000),
  LLM_TOTAL_TOKEN_LIMIT: z.coerce.number().int().min(0).default(100_000_000),
};

/** Web Push (п. 6.2 ТЗ): ключи VAPID. Без них уведомления не отправляются. */
const pushEnv = {
  VAPID_PUBLIC_KEY: optional(z.string().min(20)),
  VAPID_PRIVATE_KEY: optional(z.string().min(20)),
  /** Контакт отправителя для сервиса доставки: mailto: или https-адрес кабинета. */
  VAPID_SUBJECT: z.string().default('https://parent-web-production-d797.up.railway.app'),
};

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    // '::' слушает IPv6 и IPv4 — нужно для приватной сети Railway.
    HOST: z.string().default('::'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: databaseUrl,
    /** Токен для создания первого родительского аккаунта (/setup). После создания не действует. */
    SETUP_TOKEN: optional(z.string().min(24, 'SETUP_TOKEN — минимум 24 символа')),
    /** Публичный адрес детского PWA — для QR-ссылки привязки устройства. */
    KID_APP_URL: z.url().default('http://localhost:5173'),
    /** Сколько прокси перед api (Railway edge + Caddy = 2) — для определения IP клиента. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(2),
    ...storageEnv,
    ...ttsEnv,
    ...moderationEnv,
    ...pushEnv,
  })
  .superRefine(requireS3);

export const workerEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    DATABASE_URL: databaseUrl,
    /** Ключ Google Cloud TTS (ограничен Text-to-Speech API). Без него озвучка не генерируется. */
    GOOGLE_TTS_API_KEY: optional(z.string().min(10)),
    /** Ключ Gemini API — анализ видео для модерации. Без него очередь модерации ждёт. */
    GEMINI_API_KEY: optional(z.string().min(10)),
    /** Резервные копии на Google Диск владельца (OAuth, право drive.file): scripts/google-drive-auth.mjs. */
    GOOGLE_DRIVE_CLIENT_ID: optional(z.string().min(10)),
    GOOGLE_DRIVE_CLIENT_SECRET: optional(z.string().min(10)),
    GOOGLE_DRIVE_REFRESH_TOKEN: optional(z.string().min(10)),
    ...storageEnv,
    ...ttsEnv,
    ...moderationEnv,
    ...pushEnv,
  })
  .superRefine(requireS3);

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type StorageEnv = Pick<ApiEnv, keyof typeof storageEnv>;
export type TtsEnv = Pick<ApiEnv, keyof typeof ttsEnv>;

/**
 * Голоса Google по умолчанию — Chirp 3 HD (нейроголоса, звучат естественно).
 * Один и тот же «персонаж» на всех языках, чтобы ребёнок слышал знакомый голос.
 */
export const DEFAULT_GOOGLE_VOICES = {
  ru: 'ru-RU-Chirp3-HD-Aoede',
  en: 'en-US-Chirp3-HD-Aoede',
  zh: 'cmn-CN-Chirp3-HD-Aoede',
} as const;

/** Голоса по языкам: заданные в окружении, иначе — по умолчанию для провайдера. */
export function ttsVoices(env: TtsEnv): Partial<Record<'ru' | 'en' | 'zh', string>> {
  if (env.TTS_PROVIDER === 'browser') return {};
  return {
    ru: env.TTS_VOICE_RU ?? DEFAULT_GOOGLE_VOICES.ru,
    en: env.TTS_VOICE_EN ?? DEFAULT_GOOGLE_VOICES.en,
    zh: env.TTS_VOICE_ZH ?? DEFAULT_GOOGLE_VOICES.zh,
  };
}

/** Проверяет окружение по схеме; при ошибке падает с понятным списком проблем. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Некорректные переменные окружения:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
