// Модерация видео (п. 7.1 ТЗ): ответ модели (Gemini), карточка очереди, одобрение родителем.
// Ответ модели всегда проверяется схемой videoAnalysis; при ошибке запрос повторяется.
import { z } from 'zod';
import { GAME_CATEGORIES, LANGUAGES, questionInput, SEGMENT_MAX_SEC, SEGMENT_MIN_SEC } from './api';

const uuid = z.uuid();

/** «ММ:СС» или «Ч:ММ:СС» → секунды. */
export function parseTimecode(s: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, h, min, sec] = m;
  if (Number(sec) > 59) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(sec);
}

export const formatTimecode = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const timecode = z
  .string()
  .describe('Время в видео: ММ:СС или Ч:ММ:СС')
  .refine((s) => parseTimecode(s) !== null, 'время в формате ММ:СС');

export const AGE_GROUPS = ['2-3', '4-5', '6'] as const;
export const RED_FLAG_TYPES = [
  'scary',
  'violence',
  'bad_language',
  'ads_unboxing',
  'clickbait',
  'overstimulation',
  'factual_error',
  'bad_pronunciation',
  'other',
] as const;

const option = z.object({
  label: z.string().min(1).max(60).describe('Короткая подпись варианта для родителя'),
  picture: z.string().min(1).max(200).describe('Что нарисовано на картинке варианта'),
  emoji: z
    .string()
    .max(16)
    .describe('Один эмодзи, точно изображающий вариант, или пустая строка, если подходящего нет'),
  correct: z.boolean(),
});

const question = z
  .object({
    prompt: z.string().min(1).max(200).describe('Вопрос для озвучки ребёнку'),
    lang: z.enum(LANGUAGES),
    options: z.array(option).min(4).max(4),
  })
  .refine((q) => q.options.filter((o) => o.correct).length === 1, {
    message: 'ровно один верный вариант',
  });

const segment = z.object({
  title: z.string().min(1).max(120),
  topic: z.string().max(120).describe('Тема фрагмента для учебного плана'),
  start: timecode,
  end: timecode,
  why: z.string().max(400).describe('Почему этот фрагмент полезен'),
  questions: z.array(question).min(3).max(10),
});

/** Ответ модели на анализ видео. */
export const videoAnalysis = z.object({
  summary: z.string().min(1).max(1500).describe('О чём видео, по-русски'),
  language: z.enum([...LANGUAGES, 'other']),
  ages: z
    .array(
      z.object({
        age: z.enum(AGE_GROUPS),
        fit: z.enum(['good', 'ok', 'bad']),
        note: z.string().max(300),
      }),
    )
    .min(1)
    .max(3),
  educationalValue: z.object({
    score: z.number().int().min(1).max(5),
    note: z.string().max(400),
  }),
  redFlags: z
    .array(
      z.object({
        type: z.enum(RED_FLAG_TYPES),
        severity: z.enum(['low', 'medium', 'high']),
        at: z.string().max(20).describe('Время ММ:СС или пустая строка'),
        note: z.string().max(300),
      }),
    )
    .max(20),
  recommendation: z.enum(['approve', 'review', 'reject']),
  segments: z.array(segment).max(6),
});
export type VideoAnalysis = z.infer<typeof videoAnalysis>;

/** Картинка SVG для варианта без подходящего эмодзи. */
export const svgPicture = z.object({
  svg: z.string().min(20).max(20_000).describe('Код SVG с viewBox="0 0 200 200"'),
});

// ─── Очередь модерации ───────────────────────────────────────────────────────

export const MODERATION_STATUSES = [
  'queued',
  'processing',
  'ready',
  'skipped',
  'failed',
  'approved',
  'rejected',
] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

/** Вариант ответа в черновике: картинка подобрана (эмодзи или SVG) или ещё нет. */
export interface DraftOption {
  label: string;
  picture: string;
  correct: boolean;
  imageId: string | null;
  imageUrl: string | null;
}
export interface DraftQuestion {
  prompt: string;
  lang: (typeof LANGUAGES)[number];
  options: DraftOption[];
}
export interface DraftSegment {
  title: string;
  topic: string;
  why: string;
  startSec: number;
  endSec: number;
  questions: DraftQuestion[];
}

export interface ModerationReport {
  model: string;
  summary: string;
  language: VideoAnalysis['language'];
  ages: VideoAnalysis['ages'];
  educationalValue: VideoAnalysis['educationalValue'];
  redFlags: VideoAnalysis['redFlags'];
  recommendation: VideoAnalysis['recommendation'];
  segments: DraftSegment[];
}

export interface ModerationItem {
  id: string;
  status: ModerationStatus;
  externalId: string;
  url: string;
  title: string | null;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  madeForKids: boolean | null;
  topic: string | null;
  /** Почему видео отсеяно на входе (не встраивается, не публичное, слишком длинное…). */
  skipReason: string | null;
  error: string | null;
  report: ModerationReport | null;
  createdAt: string;
}

/** Ссылка на видео, плейлист или канал; тема — необязательная подсказка для анализа. */
export const moderationAddRequest = z.object({
  url: z.string().trim().min(1).max(500),
  topic: z.string().trim().max(120).optional(),
});
export type ModerationAddRequest = z.input<typeof moderationAddRequest>;

export interface ModerationAddResult {
  added: number;
  /** Уже были в очереди или одобрены. */
  existing: number;
}

const approvedSegment = z
  .object({
    title: z.string().trim().min(1).max(120),
    startSec: z.number().int().min(0),
    endSec: z.number().int().min(1),
    questions: z.array(questionInput).max(10),
  })
  .refine(
    (s) => s.endSec - s.startSec >= SEGMENT_MIN_SEC && s.endSec - s.startSec <= SEGMENT_MAX_SEC,
    { message: 'фрагмент — от 1 до 5 минут', path: ['endSec'] },
  );

/** Одобрение: фрагменты и вопросы в том виде, как их поправил родитель. */
export const moderationApproveRequest = z.object({
  segments: z.array(approvedSegment).min(1).max(6),
  childIds: z.array(uuid).max(20),
  /** Предмет плана для уроков; не задан — по теме модерации. */
  subject: z.enum(GAME_CATEGORIES).nullable().optional(),
});
export type ModerationApproveRequest = z.input<typeof moderationApproveRequest>;

export interface LlmUsageSummary {
  todayTokens: number;
  totalTokens: number;
  dailyLimit: number;
  totalLimit: number;
  /** Анализ приостановлен: лимит исчерпан или ключ не задан. */
  paused: 'daily_limit' | 'total_limit' | 'no_key' | 'no_credits' | null;
}
