// Инфраструктура Railway как код. Применение: `railway config plan` → `railway config apply`.
// Все ресурсы — в EU West (Амстердам): данные детей не хранятся в США.
import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

// Дневной лимит токенов Gemini: 5 млн — разбор большой партии видео (2026-10-10, владелец).
const LLM_DAILY_TOKEN_LIMIT = '5000000';
const REGION = 'europe-west4-drams3a';
const BRANCH = 'main';
// Публичный репозиторий (с 2026-10-11): бесплатные минуты CI; история разработки — в приватном архиве.
const REPO = 'almash591-sudo/kidsplus-app';

/** Файлы, общие для всех сервисов: изменение любого из них пересобирает сервис. */
const ROOT_FILES = ['/package.json', '/pnpm-lock.yaml', '/pnpm-workspace.yaml'];

const source = github(REPO, { branch: BRANCH, checkSuites: true });

/**
 * Медиа (картинки, серверная озвучка) хранятся в PostgreSQL: на бесплатном тарифе Railway
 * нельзя создать bucket. При переходе на Hobby — bucket('media', { region: 'ams' }),
 * STORAGE_DRIVER=s3 с переменными bucket и сервис backup (deploy/backup), см. docs/backup.md.
 */
const STORAGE_ENV = { STORAGE_DRIVER: 'db' };

export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: REGION });
  Postgres.networking = { privateNetworkEndpoint: 'postgres' };
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 500,
  });

  const api = service('api', {
    source,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/node.Dockerfile',
      watchPatterns: [
        '/apps/api/**',
        '/packages/shared/**',
        '/packages/db/**',
        '/packages/providers/**',
        '/deploy/node.Dockerfile',
        ...ROOT_FILES,
      ],
    },
    preDeploy: ['node dist/migrate.js'],
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    replicas: { [REGION]: 1 },
    networking: { privateNetworkEndpoint: 'api' },
    env: {
      APP: 'api',
      PORT: '3000',
      DATABASE_URL: Postgres.env.DATABASE_URL,
      // Ссылка в QR-коде привязки ведёт на публичный домен детского PWA.
      KID_APP_URL: 'https://${{kid-web.RAILWAY_PUBLIC_DOMAIN}}',
      // Перед api два прокси: Railway edge и Caddy.
      TRUST_PROXY_HOPS: '2',
      // Секрет: значение задаётся вне репозитория (`railway variable set`), здесь только сохраняется.
      SETUP_TOKEN: preserve(),
      // browser | google — задаётся вне репозитория вместе с ключом worker'а (docs/railway.md).
      TTS_PROVIDER: preserve(),
      // Дневной лимит токенов модели (кабинет показывает остаток); как у worker'а.
      LLM_DAILY_TOKEN_LIMIT: LLM_DAILY_TOKEN_LIMIT,
      // Модерация: ключ YouTube Data API (метаданные, плейлисты, каналы).
      YOUTUBE_API_KEY: preserve(),
      // Push-уведомления родителям (этап 5): ключи VAPID задаются вне репозитория.
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      ...STORAGE_ENV,
    },
  });

  const worker = service('worker', {
    source,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/node.Dockerfile',
      watchPatterns: [
        '/apps/worker/**',
        '/packages/shared/**',
        '/packages/db/**',
        '/packages/providers/**',
        '/deploy/node.Dockerfile',
        ...ROOT_FILES,
      ],
    },
    replicas: { [REGION]: 1 },
    env: {
      APP: 'worker',
      DATABASE_URL: Postgres.env.DATABASE_URL,
      // Нужен только при TTS_PROVIDER=google. Секрет задаётся вне репозитория.
      GOOGLE_TTS_API_KEY: preserve(),
      TTS_PROVIDER: preserve(),
      LLM_DAILY_TOKEN_LIMIT: LLM_DAILY_TOKEN_LIMIT,
      // Модерация: Gemini (анализ видео) и YouTube Data API (ежедневная проверка видео).
      GEMINI_API_KEY: preserve(),
      YOUTUBE_API_KEY: preserve(),
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      ...STORAGE_ENV,
    },
  });

  // Ссылки Railway в строке: значения подставляет сам Railway при деплое.
  const apiUpstream = '${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}';

  const web = (name: string, app: 'kid' | 'parent') =>
    service(name, {
      source,
      build: {
        builder: 'DOCKERFILE',
        dockerfilePath: 'deploy/web/Dockerfile',
        watchPatterns: [`/apps/${app}/**`, '/packages/shared/**', '/deploy/web/**', ...ROOT_FILES],
      },
      healthcheck: '/healthz',
      replicas: { [REGION]: 1 },
      env: { APP: app, API_UPSTREAM: apiUpstream },
    });

  const kidWeb = web('kid-web', 'kid');
  const parentWeb = web('parent-web', 'parent');

  return project('noble-contentment', {
    resources: [Postgres, postgresVolume, api, worker, kidWeb, parentWeb],
  });
});
