import { createDb } from '@kidsplus/db';
import { DbStorage } from '@kidsplus/db/blob-storage';
import { notifyParents } from '@kidsplus/db/notify';
import { GoogleTtsProvider, WebPushSender, YouTubeDataApi } from '@kidsplus/providers';
import type { PushMessage } from '@kidsplus/shared/push';
import { GeminiLlmProvider } from '@kidsplus/providers/gemini';
import { createStorage } from '@kidsplus/providers/storage-factory';
import { parseEnv, ttsVoices, workerEnvSchema } from '@kidsplus/shared/env';
import { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { GoogleDrive } from '@kidsplus/providers/google-drive';
import { checkAvailability } from './availability';
import { markConfigured, pgDump, runBackup, startBackupRequests } from './backup';
import { registerJobs } from './jobs';
import { startDraftLoop } from './curriculum-draft';
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

// Резервные копии на Google Диск владельца; без ключей — не делаются (кабинет это покажет).
const drive =
  env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN
    ? new GoogleDrive({
        clientId: env.GOOGLE_DRIVE_CLIENT_ID,
        clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
        refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      })
    : null;
const backupDeps = { db, drive, log, dump: pgDump(env.DATABASE_URL) };
await markConfigured(db, Boolean(drive)).catch((err: unknown) =>
  log.error({ err }, 'резервная копия: статус'),
);
if (!drive) log.warn('GOOGLE_DRIVE_* не заданы — резервные копии не делаются');
const stopBackupRequests = drive ? startBackupRequests(backupDeps) : undefined;

await boss.start();
await registerJobs(
  boss,
  log,
  youtube ? () => checkAvailability(db, youtube, new Date(), notify) : undefined,
  () => buildWeeklyReports({ db, llm, log, limits, notify }),
  drive ? () => runBackup(backupDeps) : undefined,
);
if (!youtube) log.warn('YOUTUBE_API_KEY не задан — ежедневная проверка видео отключена');
let stopTts: (() => void) | undefined;
if (env.TTS_PROVIDER === 'browser') {
  log.info('озвучка — на устройстве ребёнка (Web Speech API), сервер аудио не генерирует');
} else if (env.GOOGLE_TTS_API_KEY) {
  const provider = new GoogleTtsProvider({
    apiKey: env.GOOGLE_TTS_API_KEY,
    voices: ttsVoices(env),
  });
  stopTts = startTtsLoop({ db, storage: createStorage(env, new DbStorage(db)), provider, log });
  log.info({ storage: env.STORAGE_DRIVER }, 'озвучка запущена');
} else {
  log.warn(
    'GOOGLE_TTS_API_KEY не задан — серверная озвучка не генерируется, звучит голос телефона',
  );
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
if (!env.GEMINI_API_KEY)
  log.warn('GEMINI_API_KEY не задан — анализ видео для модерации ждёт ключа');

log.info('worker запущен');

async function shutdown(signal: string) {
  log.info({ signal }, 'остановка');
  stopTts?.();
  stopBackupRequests?.();
  stopModeration();
  stopDrafts();
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
