// Ежедневная проверка одобренных видео (п. 7.1 ТЗ, шаг 8): удалённые, закрытые, запрещённые
// к встраиванию или недоступные в регионе — помечаются недоступными и ребёнку не показываются.
// Этап 54: YouTube — через Data API (нужен ключ), RuTube — через открытый API, без ключа.
import { schema, type Db } from '@kidsplus/db';
import {
  fetchRuTubeVideo,
  ruTubeRegionBlocked,
  ruTubeUnavailable,
  type YouTubeDataApi,
} from '@kidsplus/providers';
import { eq } from 'drizzle-orm';
import { pushMessages } from '@kidsplus/shared/push';
import type { Notify } from './alerts';

const { videoSources } = schema;

/** Причины, которые ставит эта проверка (их же она и снимает, если видео снова доступно). */
const CHECK_REASONS = new Set([
  'not_found',
  'not_public',
  'not_embeddable',
  'not_for_kids',
  'region_blocked',
]);

type Source = typeof videoSources.$inferSelect;
/** Причина недоступности, null — доступно, undefined — сервис не ответил (не трогаем). */
type Verdict = string | null | undefined;

export interface AvailabilityDeps {
  /** Без ключа YouTube видео YouTube не проверяются. */
  youtube?: Pick<YouTubeDataApi, 'videos'> | null;
  fetch: typeof fetch;
  /** Страна детей — для ограничений RuTube по странам (как VIDEO_REGION у YouTube). */
  region: string;
}

async function youtubeVerdicts(
  youtube: Pick<YouTubeDataApi, 'videos'>,
  sources: Source[],
): Promise<Map<string, Verdict>> {
  const details = new Map(
    (await youtube.videos(sources.map((s) => s.externalId))).map((d) => [d.externalId, d]),
  );
  return new Map(
    sources.map((s) => {
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
      return [s.id, reason];
    }),
  );
}

async function ruTubeVerdicts(
  deps: AvailabilityDeps,
  sources: Source[],
): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  // По одному: видео RuTube немного, а API без ключа не любит наплыва.
  for (const s of sources) {
    try {
      const d = await fetchRuTubeVideo(deps.fetch, s.externalId);
      verdicts.set(
        s.id,
        ruTubeUnavailable(d) ?? (ruTubeRegionBlocked(d!, deps.region) ? 'region_blocked' : null),
      );
    } catch {
      verdicts.set(s.id, undefined); // RuTube не ответил — проверим завтра
    }
  }
  return verdicts;
}

export async function checkAvailability(
  db: Db,
  deps: AvailabilityDeps,
  now = new Date(),
  notify?: Notify,
): Promise<{ checked: number; unavailable: number; restored: number }> {
  const all = await db.select().from(videoSources);
  const youtube = all.filter((s) => s.provider === 'youtube');
  const rutube = all.filter((s) => s.provider === 'rutube');
  const verdicts = new Map<string, Verdict>([
    ...(deps.youtube && youtube.length ? await youtubeVerdicts(deps.youtube, youtube) : []),
    ...(rutube.length ? await ruTubeVerdicts(deps, rutube) : []),
  ]);
  let checked = 0;
  let unavailable = 0;
  let restored = 0;
  for (const s of all) {
    if (!verdicts.has(s.id)) continue;
    const reason = verdicts.get(s.id);
    if (reason === undefined) continue;
    checked++;
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
  return { checked, unavailable, restored };
}
