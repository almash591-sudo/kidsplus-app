import { schema, type Db } from '@kidsplus/db';
import {
  kidEventRequest,
  kidSpeechRequest,
  quizSettings,
  type KidPhrases,
  type KidPlaylist,
  type Speech,
} from '@kidsplus/shared/api';
import { PHRASES, PHRASES_EN, type PhraseKind } from '@kidsplus/shared/phrases';
import { pushMessages } from '@kidsplus/shared/push';
import { notifyParents } from '@kidsplus/db/notify';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireDevice } from '../auth';
import type { Ctx } from '../context';
import { notFound, parse } from '../lib/http';
import { ensureTts, loadAssets, type TtsSettings } from '../services/media';
import { buildKidItems, toSpeech } from '../services/kid-items';

const { childItems, children, events, videoSegments, videoSources } = schema;

/** Коды ошибок IFrame API, означающие, что видео больше нельзя показать. */
const UNAVAILABLE_PLAYER_ERRORS = new Set([100, 101, 150]);

/** Фразы похвалы для рода ребёнка (при серверной озвучке — ставит её в очередь, отдаёт готовые). */
export async function kidPhrases(
  db: Db,
  tts: TtsSettings,
  gender: 'f' | 'm',
  lang: 'ru' | 'en' = 'ru',
): Promise<KidPhrases> {
  const result: KidPhrases = { correct: [], retry: [], done: [] };
  const source = lang === 'en' ? PHRASES_EN : PHRASES[gender];
  const entries: [PhraseKind, string, string | null][] = [];
  for (const kind of Object.keys(source) as PhraseKind[]) {
    for (const text of source[kind])
      entries.push([kind, text, await ensureTts(db, tts, text, lang)]);
  }
  const assets = await loadAssets(
    db,
    entries.map(([, , id]) => id),
  );
  const ready = (id: string | null) => Boolean(id && assets.get(id)?.status === 'ready');
  for (const [kind, text, id] of entries) {
    result[kind].push(toSpeech(tts, text, lang, id, ready));
  }
  return result;
}

export function kidRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const deviceOnly = requireDevice(ctx);

  /**
   * Всё, что ребёнок может пройти, в порядке, заданном родителем.
   * Только доступные видео и только вопросы/карточки с готовыми картинками (и озвучкой — если она серверная).
   */
  app.get(
    '/api/kid/playlist',
    { preHandler: deviceOnly },
    async (request): Promise<KidPlaylist> => {
      const childId = request.device!.childId;
      const [child] = await db.select().from(children).where(eq(children.id, childId));
      if (!child) throw notFound('профиль не найден');

      const rows = await db
        .select()
        .from(childItems)
        .where(eq(childItems.childId, childId))
        .orderBy(asc(childItems.position));
      const result = await buildKidItems(db, ctx.config.tts, rows, {
        childId,
        now: ctx.now(),
      });

      return {
        quiz: quizSettings(child, ctx.now()),
        items: result,
        phrases: await kidPhrases(db, ctx.config.tts, child.gender),
        immersion: child.foreignImmersion,
        serverVoice: ctx.config.tts.providerId !== 'browser',
        phrasesEn: await kidPhrases(db, ctx.config.tts, child.gender, 'en'),
      };
    },
  );

  /**
   * Озвучка фраз самого приложения (задания игр, названия разделов, «Где …?»): ставит
   * в очередь те, что ещё не озвучены, и отдаёт ссылки на готовые. Голосом телефона —
   * пока файл не готов.
   */
  app.post(
    '/api/kid/speech',
    { preHandler: deviceOnly, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<Speech[]> => {
      const { phrases } = parse(kidSpeechRequest, request.body);
      const tts = ctx.config.tts;
      if (tts.providerId === 'browser') return phrases.map((p) => ({ ...p, audioUrl: null }));
      const ids: (string | null)[] = [];
      for (const p of phrases) ids.push(await ensureTts(db, tts, p.text, p.lang));
      const assets = await loadAssets(db, ids);
      const ready = (id: string | null) => Boolean(id && assets.get(id)?.status === 'ready');
      return phrases.map((p, i) => toSpeech(tts, p.text, p.lang, ids[i] ?? null, ready));
    },
  );

  app.post(
    '/api/kid/events',
    { preHandler: deviceOnly, config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parse(kidEventRequest, request.body);
      const { childId, id: deviceId } = request.device!;

      let sourceId: string | undefined;
      if (body.segmentId) {
        // Событие можно записать только по своему фрагменту.
        const [own] = await db
          .select({ sourceId: videoSegments.sourceId })
          .from(childItems)
          .innerJoin(videoSegments, eq(videoSegments.id, childItems.segmentId))
          .where(and(eq(childItems.childId, childId), eq(childItems.segmentId, body.segmentId)));
        if (!own) throw notFound('фрагмент не найден');
        sourceId = own.sourceId;
      }

      await db.insert(events).values({
        childId,
        deviceId,
        type: body.type,
        segmentId: body.segmentId ?? null,
        payload: {
          ...body.payload,
          ...(body.questionId ? { questionId: body.questionId } : {}),
          ...(body.deckId ? { deckId: body.deckId } : {}),
          ...(body.interactiveId ? { interactiveId: body.interactiveId } : {}),
        },
      });

      const code = Number(body.payload?.code);
      if (body.type === 'segment_error' && sourceId && UNAVAILABLE_PLAYER_ERRORS.has(code)) {
        const [changed] = await db
          .update(videoSources)
          .set({
            status: 'unavailable',
            statusReason: `player_error_${code}`,
            statusCheckedAt: ctx.now(),
          })
          .where(and(eq(videoSources.id, sourceId), eq(videoSources.status, 'available')))
          .returning({ title: videoSources.title });
        // Родителю — один раз, когда видео перестало открываться.
        if (changed)
          void notifyParents(db, ctx.push?.sender ?? null, pushMessages.video(changed.title));
      }
      return reply.code(204).send();
    },
  );
}
