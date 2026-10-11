import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@kidsplus/db';
import type { MediaStorage } from '@kidsplus/providers';
import { API_PREFIX, type HealthResponse } from '@kidsplus/shared';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { AppConfig, Ctx, YouTubeClient } from './context';
import { registerErrorHandler } from './lib/http';
import { childrenRoutes } from './routes/children';
import { dayRoutes } from './routes/day';
import { decksRoutes } from './routes/decks';
import { gamesRoutes } from './routes/games';
import { devicesRoutes } from './routes/devices';
import { kidRoutes } from './routes/kid';
import { mediaRoutes } from './routes/media';
import { moderationRoutes } from './routes/moderation';
import { CAPTURES_QUOTA_MB } from '@kidsplus/shared/captures';
import { parentAuthRoutes } from './routes/parent-auth';
import { pushRoutes } from './routes/push';
import { capturesRoutes } from './routes/captures';
import { callsRoutes } from './routes/calls';
import { quizRoutes } from './routes/quiz';
import { videosRoutes } from './routes/videos';
import { voiceRoutes } from './routes/voice';
import { EmojiCatalog } from './services/emoji';

/** Настройки модерации по умолчанию (как в env). */
const DEFAULT_MODERATION: AppConfig['moderation'] = {
  maxVideoSec: 30 * 60,
  dailyTokenLimit: 2_000_000,
  totalTokenLimit: 100_000_000,
};

export interface AppDeps {
  db: Db;
  config: Omit<AppConfig, 'moderation' | 'captures'> & {
    moderation?: AppConfig['moderation'];
    captures?: AppConfig['captures'];
  };
  storage: MediaStorage;
  /** Проверка связи с БД; бросает исключение, если БД недоступна. */
  pingDb: () => Promise<void>;
  logger?: FastifyServerOptions['logger'];
  fetch?: typeof fetch;
  now?: () => Date;
  youtube?: YouTubeClient | null;
  push?: Ctx['push'];
  /** Ограничение частоты запросов (в тестах с «перемоткой» времени выключается). */
  rateLimit?: boolean;
}

export async function buildApp({
  db,
  config,
  storage,
  pingDb,
  logger = false,
  fetch = globalThis.fetch,
  now = () => new Date(),
  youtube = null,
  push = null,
  rateLimit: limits = true,
}: AppDeps) {
  const app = Fastify({
    logger,
    // Доверяем ровно N ближайшим прокси (Caddy, Railway edge), иначе IP клиента можно подделать.
    trustProxy: (_address: string, hop: number) => hop < config.trustProxyHops,
    bodyLimit: 64 * 1024,
  });
  const ctx: Ctx = {
    db,
    config: {
      ...config,
      moderation: config.moderation ?? DEFAULT_MODERATION,
      captures: config.captures ?? { quotaBytes: CAPTURES_QUOTA_MB * 1024 * 1024 },
    },
    storage,
    emoji: new EmojiCatalog(),
    fetch,
    now,
    youtube,
    push,
  };

  app.decorateRequest('parent', null);
  app.decorateRequest('device', null);
  await app.register(cookie);
  if (limits) await app.register(rateLimit, { global: false });
  registerErrorHandler(app);

  app.get(`${API_PREFIX}/health`, async (request, reply): Promise<HealthResponse> => {
    try {
      await pingDb();
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      request.log.error({ err }, 'health: БД недоступна');
      return reply.code(503).send({ status: 'error', db: 'unavailable' });
    }
  });

  parentAuthRoutes(app, ctx);
  childrenRoutes(app, ctx);
  devicesRoutes(app, ctx);
  videosRoutes(app, ctx);
  quizRoutes(app, ctx);
  decksRoutes(app, ctx);
  gamesRoutes(app, ctx);
  moderationRoutes(app, ctx);
  mediaRoutes(app, ctx);
  kidRoutes(app, ctx);
  dayRoutes(app, ctx);
  pushRoutes(app, ctx);
  capturesRoutes(app, ctx);
  callsRoutes(app, ctx);
  voiceRoutes(app, ctx);

  return app;
}
