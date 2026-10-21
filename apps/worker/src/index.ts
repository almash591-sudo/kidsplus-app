import { createDb } from '@kidsplus/db';
import { DbStorage } from '@kidsplus/db/blob-storage';
import { notifyParents } from '@kidsplus/db/notify';
import {
  ElevenLabsTtsProvider,
  GoogleTtsProvider,
  OpenAiCompatibleTtsProvider,
  WebPushSender,
  YouTubeDataApi,
  type TtsProvider,
} from '@kidsplus/providers';
import type { PushMessage } from '@kidsplus/shared/push';
import { GeminiLlmProvider } from '@kidsplus/providers/gemini';
import { createStorage } from '@kidsplus/providers/storage-factory';
import { parseEnv, ttsVoices, workerEnvSchema } from '@kidsplus/shared/env';
import { PROXY_TTS_MODEL } from '@kidsplus/shared/voice';
import { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { GoogleDrive } from '@kidsplus/providers/google-drive';
import { S3Backups } from '@kidsplus/providers/backup-s3';
import { startBlobMove } from './blob-move';
import { checkAvailability } from './availability';
import { checkOffline } from './offline-alerts';
import { markConfigured, pgDump, runBackup, startBackupRequests } from './backup';
import { registerJobs } from './jobs';
import { startStoryLoop } from './stories';
import { startDraftLoop } from './curriculum-draft';
import { startExplanationLoop } from './explanation-draft';
import { startModerationLoop } from './moderation';
import { startTtsLoop } from './tts';
import { buildWeeklyReports } from './weekly';

const env = parseEnv(workerEnvSchema);
const log = pino({ level: env.LOG_LEVEL });

const boss = new PgBoss(env.DATABASE_URL);
boss.on('error', (err) => log.error({ err }, 'pg-boss'));

const { db, pool } = createDb(env.DATABASE_URL);
const youtube = env.YOUTUBE_API_KEY
  ? new YouTubeDataApi({ apiKey: env.YOUTUBE_API_KEY, region: env.VIDEO_REGION })
  : null;

// Push-уведомления родителям: без ключей VAPID не отправляются.
const push =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? new WebPushSender({
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      })
    : null;
const notify = push ? (m: PushMessage) => notifyParents(db, push, m) : undefined;
if (!push) log.warn('VAPID_* не заданы — push-уведомления родителям не отправляются');

// Модель (Gemini): модерация, черновики планов, советы в недельном отчёте; без ключа — ждут.
const llm = env.GEMINI_API_KEY
  ? new GeminiLlmProvider({ apiKey: env.GEMINI_API_KEY, model: env.LLM_MODEL_MAIN })
  : null;
const limits = { daily: env.LLM_DAILY_TOKEN_LIMIT, total: env.LLM_TOTAL_TOKEN_LIMIT };

const s3 =
  env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      }
    : null;

// Резервные копии: на Google Диск владельца, если он подключён, иначе — в bucket (R2);
// без ключей — не делаются (кабинет это покажет).
const drive =
  env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN
    ? new GoogleDrive({
        clientId: env.GOOGLE_DRIVE_CLIENT_ID,
        clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
        refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      })
    : s3
      ? new S3Backups(s3)
      : null;
const backupDeps = { db, drive, log, dump: pgDump(env.DATABASE_URL) };
await markConfigured(db, Boolean(drive), drive instanceof S3Backups ? 's3' : 'drive').catch(
  (err: unknown) => log.error({ err }, 'резервная копия: статус'),
);
if (!drive) log.warn('ни Google Диск, ни S3_* не заданы — резервные копии не делаются');

// Медиа переехали в bucket: worker переносит оставшиеся в базе файлы.
const stopBlobMove =
  env.STORAGE_DRIVER === 's3'
    ? startBlobMove({ db, target: createStorage(env), log, batch: 10 })
    : undefined;
const stopBackupRequests = drive ? startBackupRequests(backupDeps) : undefined;

await boss.start();
await registerJobs(
  boss,
  log,
  youtube ? () => checkAvailability(db, youtube, new Date(), notify) : undefined,
  () => buildWeeklyReports({ db, llm, log, limits, notify }),
  drive ? () => runBackup(backupDeps) : undefined,
  () => checkOffline({ db, notify }),
);
if (!youtube) log.warn('YOUTUBE_API_KEY не задан — ежедневная проверка видео отключена');
let stopTts: (() => void) | undefined;
/** Провайдер серверной озвучки по TTS_PROVIDER; без ключа — null. */
function ttsProvider(): TtsProvider | null {
  // ElevenLabs через ProxyAPI (этап 28): модель — в имени голоса (@kidsplus/shared/voice).
  if (env.TTS_PROVIDER === 'proxyapi')
    return env.PROXYAPI_KEY
      ? new OpenAiCompatibleTtsProvider({
          apiKey: env.PROXYAPI_KEY,
          baseUrl: 'https://api.proxyapi.ru/v1',
          model: PROXY_TTS_MODEL,
          voices: ttsVoices(env),
        })
      : null;
  if (env.TTS_PROVIDER === 'elevenlabs')
    return env.ELEVENLABS_API_KEY
      ? new ElevenLabsTtsProvider({
          apiKey: env.ELEVENLABS_API_KEY,
          voices: ttsVoices(env),
          ...(env.ELEVENLABS_MODEL ? { model: env.ELEVENLABS_MODEL } : {}),
        })
      : null;
  return env.GOOGLE_TTS_API_KEY
    ? new GoogleTtsProvider({ apiKey: env.GOOGLE_TTS_API_KEY, voices: ttsVoices(env) })
    : null;
}
if (env.TTS_PROVIDER === 'browser') {
  log.info('озвучка — на устройстве ребёнка (Web Speech API), сервер аудио не генерирует');
} else {
  const provider = ttsProvider();
  if (provider) {
    stopTts = startTtsLoop({ db, storage: createStorage(env, new DbStorage(db)), provider, log });
    log.info({ storage: env.STORAGE_DRIVER, provider: provider.id }, 'озвучка запущена');
  } else {
    const key = {
      elevenlabs: 'ELEVENLABS_API_KEY',
      proxyapi: 'PROXYAPI_KEY',
      google: 'GOOGLE_TTS_API_KEY',
    }[env.TTS_PROVIDER];
    log.warn(`${key} не задан — серверная озвучка не генерируется, звучит голос телефона`);
  }
}

const stopModeration = startModerationLoop({
  db,
  storage: createStorage(env, new DbStorage(db)),
  llm,
  log,
  limits,
  ...(notify ? { notify } : {}),
});
const stopDrafts = startDraftLoop({ db, llm, log, limits, ...(notify ? { notify } : {}) });
const stopExplanations = startExplanationLoop({
  db,
  llm,
  log,
  limits,
  ...(notify ? { notify } : {}),
});
const stopStories = startStoryLoop({ db, llm, log, limits, ...(notify ? { notify } : {}) });
if (!env.GEMINI_API_KEY)
  log.warn('GEMINI_API_KEY не задан — анализ видео для модерации ждёт ключа');

log.info('worker запущен');

async function shutdown(signal: string) {
  log.info({ signal }, 'остановка');
  stopTts?.();
  stopBackupRequests?.();
  stopBlobMove?.();
  stopModeration();
  stopDrafts();
  stopExplanations();
  stopStories();
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
