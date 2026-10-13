// Конвейер модерации (п. 7.1 ТЗ): видео из очереди → анализ моделью (она сама смотрит видео
// по публичной ссылке) → картинки к вариантам (эмодзи или SVG) → отчёт для родителя.
// До одобрения родителем ребёнку ничего не показывается.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { schema, type Db } from '@kidsplus/db';
import { tokenUsage } from '@kidsplus/db/llm-usage';
import { saveSvgAsset, type MediaWriter } from '@kidsplus/db/media';
import {
  LlmError,
  llmJson,
  sanitizeSvg,
  type LlmProvider,
  type LlmUsageInfo,
} from '@kidsplus/providers';
import { moderateVideoPrompt } from '@kidsplus/providers/prompts/moderate-video.v1';
import { svgPicturePrompt } from '@kidsplus/providers/prompts/svg-picture.v1';
import { mediaUrl, SEGMENT_MAX_SEC, SEGMENT_MIN_SEC } from '@kidsplus/shared/api';
import {
  parseTimecode,
  svgPicture,
  videoAnalysis,
  type DraftSegment,
  type ModerationReport,
  type VideoAnalysis,
} from '@kidsplus/shared/moderation';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { pushMessages } from '@kidsplus/shared/push';
import { tokenAlert, type Notify } from './alerts';

const { appMeta, children, llmUsage, moderationItems } = schema;
const require = createRequire(import.meta.url);

/** После стольких попыток (временные ошибки модели) видео помечается failed. */
export const MAX_MODERATION_ATTEMPTS = 3;
/** Картинок SVG на одно видео не больше — остальные варианты родитель подберёт сам. */
const MAX_SVG_PER_ITEM = 24;
/** Ключ в app_meta: состояние worker'а модерации для кабинета. */
export const MODERATION_STATUS_KEY = 'moderation_worker';

export interface ModerationDeps {
  db: Db;
  storage: MediaWriter;
  /** null — ключа модели нет, очередь ждёт. */
  llm: LlmProvider | null;
  log: Logger;
  limits: { daily: number; total: number };
  now?: () => Date;
  /** Push-уведомление родителям (нет ключей VAPID — не задано). */
  notify?: Notify;
}

export type ModerationTickResult = 'idle' | 'done' | 'paused' | 'retry_later';

async function writeStatus(db: Db, value: Record<string, unknown>) {
  const json = JSON.stringify(value);
  await db
    .insert(appMeta)
    .values({ key: MODERATION_STATUS_KEY, value: json })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: json, updatedAt: sql`now()` } });
}

/** Возраст детей одной строкой: «2 и 5 лет». Только возраст — без имён. */
export async function childrenAges(db: Pick<Db, 'select'>, now: Date): Promise<string> {
  const rows = await db.select({ y: children.birthYear, m: children.birthMonth }).from(children);
  const ages = [
    ...new Set(
      rows.map((r) => {
        const months = (now.getFullYear() - r.y) * 12 + (now.getMonth() + 1 - r.m);
        return Math.max(1, Math.floor(months / 12));
      }),
    ),
  ].sort((a, b) => a - b);
  if (!ages.length) return '2–6 лет';
  const last = ages.at(-1)!;
  const word = last % 10 === 1 && last % 100 !== 11 ? 'года' : 'лет';
  return ages.length === 1
    ? `${last} ${word}`
    : `${ages.slice(0, -1).join(', ')} и ${last} ${word}`;
}

/** Файл Twemoji для эмодзи (как в twemoji: без FE0F, если в последовательности нет ZWJ). */
export function twemojiCode(emoji: string): string | null {
  const cps = [...emoji.trim()].map((c) => c.codePointAt(0)!.toString(16));
  if (!cps.length || cps.length > 10) return null;
  return (cps.includes('200d') ? cps : cps.filter((c) => c !== 'fe0f')).join('-');
}

let twemojiDir: string | null = null;
function twemojiSvg(code: string): Uint8Array | null {
  twemojiDir ??= dirname(require.resolve('@twemoji/svg/1f431.svg'));
  const file = join(twemojiDir, `${code}.svg`);
  return /^[0-9a-f-]+$/.test(code) && existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
}

type AnalysisSegment = VideoAnalysis['segments'][number];

/**
 * Фрагменты: время из «ММ:СС», в пределах видео и от 1 до 5 минут.
 * Вместе с черновиком — исходный фрагмент анализа (в нём эмодзи для подбора картинок).
 */
export function draftSegments(
  a: VideoAnalysis,
  durationSec: number | null,
): { draft: DraftSegment; source: AnalysisSegment }[] {
  const out: { draft: DraftSegment; source: AnalysisSegment }[] = [];
  for (const s of a.segments) {
    let start = parseTimecode(s.start) ?? 0;
    let end = parseTimecode(s.end) ?? start + SEGMENT_MIN_SEC;
    if (durationSec) {
      start = Math.min(start, Math.max(0, durationSec - SEGMENT_MIN_SEC));
      end = Math.min(end, durationSec);
    }
    end = Math.max(end, start + SEGMENT_MIN_SEC);
    end = Math.min(end, start + SEGMENT_MAX_SEC);
    if (durationSec && end > durationSec) continue; // видео короче минуты
    const draft: DraftSegment = {
      title: s.title,
      topic: s.topic,
      why: s.why,
      startSec: start,
      endSec: end,
      questions: s.questions.map((q) => ({
        prompt: q.prompt,
        lang: q.lang,
        options: q.options.map((o) => ({
          label: o.label,
          picture: o.picture,
          correct: o.correct,
          imageId: null,
          imageUrl: null,
        })),
      })),
    };
    out.push({ draft, source: s });
  }
  return out;
}

/** Берёт одно видео из очереди и анализирует его. */
export async function processModeration(deps: ModerationDeps): Promise<ModerationTickResult> {
  const { db, llm, log } = deps;
  const now = deps.now?.() ?? new Date();

  if (!llm) {
    await writeStatus(db, { paused: 'no_key', at: now.toISOString() });
    return 'paused';
  }
  const used = await tokenUsage(db, now);
  const paused =
    used.total >= deps.limits.total
      ? 'total_limit'
      : used.today >= deps.limits.daily
        ? 'daily_limit'
        : null;
  await writeStatus(db, { paused, at: now.toISOString() });
  if (paused) return 'paused';

  const [item] = await db
    .update(moderationItems)
    .set({ status: 'processing', attempts: sql`${moderationItems.attempts} + 1`, updatedAt: now })
    .where(
      inArray(
        moderationItems.id,
        db
          .select({ id: moderationItems.id })
          .from(moderationItems)
          .where(
            and(
              eq(moderationItems.status, 'queued'),
              lt(moderationItems.attempts, MAX_MODERATION_ATTEMPTS),
            ),
          )
          .orderBy(moderationItems.createdAt)
          .limit(1)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();
  if (!item) return 'idle';

  const onUsage = (task: string) => async (u: LlmUsageInfo) => {
    await db.insert(llmUsage).values({
      task,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      moderationItemId: item.id,
    });
  };

  try {
    const meta = (item.metadata ?? {}) as {
      title?: string;
      channelTitle?: string | null;
      durationSec?: number | null;
      madeForKids?: boolean | null;
      description?: string;
    };
    const analysis = await llmJson(
      llm,
      {
        prompt: moderateVideoPrompt({
          ages: await childrenAges(db, now),
          topic: item.topic ?? '',
          title: meta.title ?? '—',
          channel: meta.channelTitle ?? '—',
          durationSec: meta.durationSec ?? 0,
          madeForKids:
            meta.madeForKids === true ? 'да' : meta.madeForKids === false ? 'нет' : 'неизвестно',
          description: (meta.description ?? '').slice(0, 1500),
        }),
        schema: videoAnalysis,
        videoUrl: `https://www.youtube.com/watch?v=${item.externalId}`,
      },
      { onUsage: onUsage('moderate') },
    );

    const pairs = draftSegments(analysis, meta.durationSec ?? null);
    await attachPictures(deps, pairs, onUsage('svg'));
    const segments = pairs.map((p) => p.draft);

    const report: ModerationReport = {
      model: (await lastModel(db, item.id)) ?? llm.id,
      summary: analysis.summary,
      language: analysis.language,
      ages: analysis.ages,
      educationalValue: analysis.educationalValue,
      redFlags: analysis.redFlags,
      recommendation: analysis.recommendation,
      segments,
    };
    await db
      .update(moderationItems)
      .set({
        status: 'ready',
        report: report as unknown as Record<string, unknown>,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(moderationItems.id, item.id));
    log.info({ itemId: item.id, segments: segments.length }, 'модерация: отчёт готов');
    await deps.notify?.(pushMessages.moderation(meta.title ?? 'Видео'));
    await tokenAlert(db, deps.limits, deps.notify, now);
    return 'done';
  } catch (err) {
    if (err instanceof LlmError && err.billing) {
      // Нет денег на счёте модели — видео обратно в очередь без потраченной попытки, анализ на паузе.
      await db
        .update(moderationItems)
        .set({
          status: 'queued',
          attempts: sql`greatest(${moderationItems.attempts} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(moderationItems.id, item.id));
      await writeStatus(db, { paused: 'no_credits', at: now.toISOString() });
      log.warn({ itemId: item.id }, 'модерация: закончились кредиты модели — пауза');
      return 'paused';
    }
    const retryable = err instanceof LlmError ? err.retryable : true;
    const final = !retryable || item.attempts >= MAX_MODERATION_ATTEMPTS;
    const message = (err as Error).message.slice(0, 500);
    await db
      .update(moderationItems)
      .set({ status: final ? 'failed' : 'queued', error: message, updatedAt: new Date() })
      .where(eq(moderationItems.id, item.id));
    log.warn({ itemId: item.id, attempt: item.attempts, final, err: message }, 'модерация: ошибка');
    return final ? 'done' : 'retry_later';
  }
}

async function lastModel(db: Db, itemId: string) {
  const [row] = await db
    .select({ model: llmUsage.model })
    .from(llmUsage)
    .where(and(eq(llmUsage.moderationItemId, itemId), eq(llmUsage.task, 'moderate')))
    .limit(1);
  return row?.model;
}

/**
 * Картинки к вариантам: эмодзи, названный моделью, если он есть в Twemoji; иначе — SVG,
 * нарисованный моделью и очищенный. Не получилось — картинку выберет родитель.
 */
async function attachPictures(
  deps: ModerationDeps,
  pairs: { draft: DraftSegment; source: AnalysisSegment }[],
  onUsage: (u: LlmUsageInfo) => Promise<void>,
) {
  const { db, storage, llm, log } = deps;
  let svgCount = 0;
  const cache = new Map<string, string | null>();
  const options = pairs.flatMap(({ draft, source }) =>
    draft.questions.flatMap((q, qi) =>
      q.options.map((o, oi) => ({ o, emoji: source.questions[qi]!.options[oi]!.emoji })),
    ),
  );
  for (const { o, emoji } of options) {
    const key = `${emoji}|${o.picture}`;
    if (cache.has(key)) {
      o.imageId = cache.get(key)!;
      o.imageUrl = o.imageId && mediaUrl(o.imageId);
      continue;
    }
    let imageId: string | null = null;
    const code = emoji && twemojiCode(emoji);
    const svg = code ? twemojiSvg(code) : null;
    if (code && svg) {
      imageId = (
        await saveSvgAsset(db, storage, {
          source: 'twemoji',
          sourceRef: code,
          svg,
          storageKey: `emoji/${code}.svg`,
        })
      ).id;
    } else if (llm && svgCount < MAX_SVG_PER_ITEM) {
      svgCount++;
      try {
        const drawn = await llmJson(
          llm,
          { prompt: svgPicturePrompt(o.picture), schema: svgPicture },
          { retries: 1, onUsage },
        );
        const clean = sanitizeSvg(drawn.svg);
        if (clean) {
          const hash = createHash('sha256').update(o.picture.trim().toLowerCase()).digest('hex');
          imageId = (
            await saveSvgAsset(db, storage, {
              source: 'generated',
              sourceRef: `llm/${hash}`,
              svg: new TextEncoder().encode(clean),
              storageKey: `generated/llm/${hash}.svg`,
            })
          ).id;
        }
      } catch (err) {
        log.warn({ err: (err as Error).message }, 'модерация: картинка не нарисована');
      }
    }
    cache.set(key, imageId);
    o.imageId = imageId;
    o.imageUrl = imageId && mediaUrl(imageId);
  }
}

/** Бесконечный цикл модерации; останавливается через возвращённую функцию. */
export function startModerationLoop(deps: ModerationDeps, intervalMs = 15_000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let delay = intervalMs;
    try {
      const r = await processModeration(deps);
      if (r === 'done') delay = 0;
      if (r === 'retry_later') delay = 60_000;
      if (r === 'paused') delay = 5 * 60_000;
    } catch (err) {
      deps.log.error({ err }, 'модерация: сбой цикла');
      delay = 60_000;
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
