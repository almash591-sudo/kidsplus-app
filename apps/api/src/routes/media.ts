import { schema } from '@kidsplus/db';
import {
  emojiPickRequest,
  IMAGE_MAX_BYTES,
  type EmojiItem,
  type MediaRef,
} from '@kidsplus/shared/api';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParent, requireParentOrDevice } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { saveEmoji, saveUpload, toMediaRef } from '../services/media';

const { mediaAssets } = schema;

/** Медиа не должны исполняться как страница, даже если их открыть напрямую. */
const SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

export function mediaRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, storage } = ctx;
  const parentOnly = requireParent(ctx);

  // Картинки приходят «сырым» телом с типом image/*; тип проверяется по содержимому.
  app.addContentTypeParser(
    ['image/png', 'image/jpeg', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: IMAGE_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  // Содержимое файла по id не меняется — кэшируем навсегда.
  app.get('/api/media/:id', { preHandler: requireParentOrDevice(ctx) }, async (request, reply) => {
    const id = idFrom(request.params);
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    if (!asset || asset.status !== 'ready' || !asset.storageKey) throw notFound('файл не найден');
    const data = await storage.get(asset.storageKey);
    if (!data) throw notFound('файл не найден');
    return reply
      .headers({
        ...SAFE_HEADERS,
        'content-type': asset.mimeType ?? 'application/octet-stream',
        'cache-control': 'private, max-age=31536000, immutable',
      })
      .send(Buffer.from(data));
  });

  app.post(
    '/api/parent/media/images',
    { preHandler: parentOnly },
    async (request, reply): Promise<MediaRef> => {
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new HttpError(415, 'unsupported_image', 'поддерживаются картинки PNG, JPEG и WebP');
      }
      const asset = await saveUpload(db, storage, new Uint8Array(request.body));
      reply.code(201);
      return toMediaRef(asset);
    },
  );

  app.get(
    '/api/parent/emoji',
    { preHandler: parentOnly },
    async (request): Promise<EmojiItem[]> => {
      const { q } = parse(z.object({ q: z.string().max(40).default('') }), request.query);
      return ctx.emoji.search(q);
    },
  );

  // Предпросмотр эмодзи в окне выбора (до сохранения в хранилище).
  app.get('/api/parent/emoji/:code', { preHandler: parentOnly }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const svg = ctx.emoji.svg(code.replace(/\.svg$/, ''));
    if (!svg) throw notFound('эмодзи не найден');
    return reply
      .headers({
        ...SAFE_HEADERS,
        'content-type': 'image/svg+xml',
        'cache-control': 'private, max-age=86400',
      })
      .send(Buffer.from(svg));
  });

  app.post(
    '/api/parent/media/emoji',
    { preHandler: parentOnly },
    async (request, reply): Promise<MediaRef> => {
      const { code } = parse(emojiPickRequest, request.body);
      const svg = ctx.emoji.svg(code);
      if (!svg) throw notFound('эмодзи не найден');
      const asset = await saveEmoji(db, storage, code, svg);
      reply.code(201);
      return toMediaRef(asset);
    },
  );
}
