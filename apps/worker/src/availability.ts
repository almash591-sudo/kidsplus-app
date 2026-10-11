// Ежедневная проверка одобренных видео (п. 7.1 ТЗ, шаг 8): удалённые, закрытые, запрещённые
// к встраиванию или недоступные в регионе — помечаются недоступными и ребёнку не показываются.
import { schema, type Db } from '@kidsplus/db';
import type { YouTubeDataApi } from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { pushMessages } from '@kidsplus/shared/push';
import type { Notify } from './alerts';

const { videoSources } = schema;

/** Причины, которые ставит эта проверка (их же она и снимает, если видео снова доступно). */
const CHECK_REASONS = new Set(['not_found', 'not_public', 'not_embeddable', 'region_blocked']);

export async function checkAvailability(
  db: Db,
  youtube: Pick<YouTubeDataApi, 'videos'>,
  now = new Date(),
  notify?: Notify,
): Promise<{ checked: number; unavailable: number; restored: number }> {
  const sources = await db.select().from(videoSources).where(eq(videoSources.provider, 'youtube'));
  if (!sources.length) return { checked: 0, unavailable: 0, restored: 0 };
  const details = new Map(
    (await youtube.videos(sources.map((s) => s.externalId))).map((d) => [d.externalId, d]),
  );
  let unavailable = 0;
  let restored = 0;
  for (const s of sources) {
    const d = details.get(s.externalId);
    const reason = !d
      ? 'not_found'
      : d.privacyStatus === 'private'
        ? 'not_public'
        : !d.embeddable
          ? 'not_embeddable'
          : d.regionBlocked
            ? 'region_blocked'
            : null;
    if (reason && s.status === 'available') {
      await db
        .update(videoSources)
        .set({ status: 'unavailable', statusReason: reason, statusCheckedAt: now })
        .where(eq(videoSources.id, s.id));
      unavailable++;
      await notify?.(pushMessages.video(s.title));
    } else if (!reason && s.status === 'unavailable' && CHECK_REASONS.has(s.statusReason ?? '')) {
      // Ошибки плеера у ребёнка (player_error_*) сами не снимаем — их проверяет родитель.
      await db
        .update(videoSources)
        .set({ status: 'available', statusReason: null, statusCheckedAt: now })
        .where(eq(videoSources.id, s.id));
      restored++;
    } else {
      await db.update(videoSources).set({ statusCheckedAt: now }).where(eq(videoSources.id, s.id));
    }
  }
  return { checked: sources.length, unavailable, restored };
}
