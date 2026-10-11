import { schema } from '@kidsplus/db';
import { mediaUrl } from '@kidsplus/shared/api';
import {
  googleVoice,
  VOICE_NAMES,
  voicePreviewRequest,
  voiceSettings,
  voiceShortName,
  type VoiceInfo,
  type VoicePreview,
} from '@kidsplus/shared/voice';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireParent } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, parse } from '../lib/http';
import { ensureTts } from '../services/media';
import { backfillTts } from '../services/tts-backfill';
import { applyVoice, saveVoice } from '../services/voice';

const { mediaAssets } = schema;

/** Голос озвучки (этап 14в): прослушать голоса и выбрать; после выбора всё переозвучивается. */
export function voiceRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const preHandler = requireParent(ctx);
  const serverVoice = () => ctx.config.tts.providerId !== 'browser';
  const needServer = () => {
    if (!serverVoice())
      throw new HttpError(409, 'browser_voice', 'озвучивает телефон — нейроголос не включён');
  };

  app.get('/api/parent/voice', { preHandler }, async (): Promise<VoiceInfo> => {
    const { tts } = ctx.config;
    return {
      serverVoice: serverVoice(),
      voice: voiceShortName(tts.voices.ru) ?? 'Aoede',
      speed: tts.speed,
      voices: VOICE_NAMES,
    };
  });

  app.put('/api/parent/voice', { preHandler }, async (request): Promise<VoiceInfo> => {
    needServer();
    const v = parse(voiceSettings, request.body);
    await saveVoice(db, v);
    applyVoice(ctx.config.tts, v);
    // Слова карточек и вопросы — в очередь новым голосом (в фоне); фразы приложения
    // переозвучиваются сами, когда телефон их запросит.
    void backfillTts(db, ctx.config.tts)
      .then((n) => request.log.info({ updated: n, voice: v.voice }, 'голос: переозвучка'))
      .catch((err: unknown) => request.log.error({ err }, 'голос: ошибка переозвучки'));
    return { serverVoice: true, voice: v.voice, speed: v.speed, voices: VOICE_NAMES };
  });

  /** Озвучить фразу выбранным для прослушивания голосом (не меняя текущий). */
  app.post('/api/parent/voice/preview', { preHandler }, async (request): Promise<VoicePreview> => {
    needServer();
    const r = parse(voicePreviewRequest, request.body);
    const id = await ensureTts(
      db,
      {
        providerId: ctx.config.tts.providerId,
        speed: r.speed,
        voices: { ru: googleVoice('ru', r.voice) },
      },
      r.text,
      'ru',
    );
    return preview(id!);
  });

  app.get('/api/parent/voice/preview/:id', { preHandler }, async (request) =>
    preview(idFrom(request.params)),
  );

  async function preview(id: string): Promise<VoicePreview> {
    const [row] = await db
      .select({ status: mediaAssets.status })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id));
    if (!row) throw new HttpError(404, 'not_found', 'озвучка не найдена');
    return { id, status: row.status, url: row.status === 'ready' ? mediaUrl(id) : null };
  }
}
