import type { IceConfig } from '@kidsplus/shared/calls';
import { createDb } from '@kidsplus/db';
import { DbStorage } from '@kidsplus/db/blob-storage';
import { WebPushSender, YouTubeDataApi } from '@kidsplus/providers';
import { createAudioStorage, createStorage } from '@kidsplus/providers/storage-factory';
import { apiEnvSchema, parseEnv, ttsVoices } from '@kidsplus/shared/env';
import { buildApp } from './app';
import { backfillTts } from './services/tts-backfill';
import { addPushKindOnce } from './services/push-kinds';
import { applyVoice, loadVoice } from './services/voice';

const env = parseEnv(apiEnvSchema);
const { db, pool } = createDb(env.DATABASE_URL);

const tts = { providerId: env.TTS_PROVIDER, speed: env.TTS_SPEED, voices: ttsVoices(env) };
// Голос, выбранный родителем в кабинете, важнее переменных окружения.
const chosenVoice = await loadVoice(db).catch(() => null);
if (chosenVoice) applyVoice(tts, chosenVoice);

const storage = createStorage(env, new DbStorage(db));
const app = await buildApp({
  db,
  storage,
  audioStorage: createAudioStorage(env, storage),
  config: {
    setupToken: env.SETUP_TOKEN,
    kidAppUrl: env.KID_APP_URL,
    kioskPublishToken: env.KIOSK_PUBLISH_TOKEN,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    tts,
    moderation: {
      maxVideoSec: env.MODERATION_MAX_VIDEO_MIN * 60,
      dailyTokenLimit: env.LLM_DAILY_TOKEN_LIMIT,
      totalTokenLimit: env.LLM_TOTAL_TOKEN_LIMIT,
    },
    captures: { quotaBytes: env.CAPTURES_QUOTA_MB * 1024 * 1024 },
    ...(env.ICE_SERVERS ? { ice: JSON.parse(env.ICE_SERVERS) as IceConfig } : {}),
  },
  push:
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? {
          publicKey: env.VAPID_PUBLIC_KEY,
          sender: new WebPushSender({
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }),
        }
      : null,
  youtube: env.YOUTUBE_API_KEY
    ? new YouTubeDataApi({ apiKey: env.YOUTUBE_API_KEY, region: env.VIDEO_REGION })
    : null,
  pingDb: async () => {
    await pool.query('select 1');
  },
  logger: { level: env.LOG_LEVEL },
});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'остановка');
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: env.HOST, port: env.PORT });

// «Телефон не на связи» (этап 15д) — в подписках тех, кто получает «телефон садится».
void addPushKindOnce(db, 'offline', 'battery').catch((err: unknown) =>
  app.log.error({ err }, 'push: новый вид уведомлений'),
);

// Серверная озвучка включена или сменился голос — старое ставится в очередь (в фоне, один раз).
void backfillTts(db, tts)
  .then((n) => n && app.log.info({ updated: n }, 'озвучка: старое поставлено в очередь'))
  .catch((err: unknown) => app.log.error({ err }, 'озвучка: ошибка дозаполнения'));
