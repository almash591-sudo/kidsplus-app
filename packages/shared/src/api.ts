// Контракты HTTP API: Zod-схемы запросов и типы ответов.
// Сервер проверяет запросы этими схемами; фронтенды импортируют отсюда только типы.
import { z } from 'zod';
import { gameSpec, type GameSpec } from './games';

// ─── Общее ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
}

/** Фрагмент видео: от 1 до 5 минут (п. 4 ТЗ). */
export const SEGMENT_MIN_SEC = 60;
export const SEGMENT_MAX_SEC = 300;

export const LANGUAGES = ['ru', 'en', 'zh'] as const;
export type Language = (typeof LANGUAGES)[number];

const uuid = z.uuid();

// ─── Родитель: аккаунт ───────────────────────────────────────────────────────

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('некорректный email'));
export const passwordSchema = z
  .string()
  .min(10, 'пароль — минимум 10 символов')
  .max(200, 'слишком длинный пароль');

export const loginRequest = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const setupRequest = z.object({
  token: z.string().min(1),
  email: emailSchema,
  password: passwordSchema,
});
export const inviteAcceptRequest = setupRequest;

export type LoginRequest = z.input<typeof loginRequest>;
export type SetupRequest = z.input<typeof setupRequest>;

export interface ParentMe {
  id: string;
  email: string;
  /** Как ребёнок видит родителя в звонках; null — «Родитель». */
  displayName?: string | null;
  /** Семья-администратор: модерация и общая библиотека (этап 23). */
  isAdmin?: boolean;
}

export interface InviteCreated {
  token: string;
  expiresAt: string;
}

// ─── Семьи (этап 23) ─────────────────────────────────────────────────────────

export const familyInviteRequest = z.object({
  name: z.string().trim().min(1, 'укажите название').max(60),
});
export type FamilyInviteRequest = z.input<typeof familyInviteRequest>;

export interface FamilyInfo {
  id: string;
  name: string;
  isAdmin: boolean;
  parents: number;
  children: number;
  createdAt: string;
}

export interface FamilyInvite {
  name: string;
  createdAt: string;
  expiresAt: string;
}

export interface FamiliesOverview {
  families: FamilyInfo[];
  /** Ещё не принятые приглашения новых семей. */
  pending: FamilyInvite[];
}

// ─── Дети ────────────────────────────────────────────────────────────────────

export const childInput = z.object({
  nickname: z.string().trim().min(1, 'укажите прозвище').max(30),
  birthYear: z.number().int().min(2015).max(2100),
  birthMonth: z.number().int().min(1).max(12),
  gender: z.enum(['f', 'm']),
  languages: z.array(z.enum(LANGUAGES)).min(1).max(LANGUAGES.length),
  /** null — по возрасту (см. quizDefaults). */
  quizOptions: z.number().int().min(2).max(4).nullable().default(null),
  quizQuestions: z.number().int().min(1).max(10).nullable().default(null),
  /** Иностранные карточки и проверки по ним — только на языке набора, без русского перевода. */
  foreignImmersion: z.boolean().default(false),
  /** Объёмные авторские картинки вместо эмодзи (где они есть). */
  illustrations: z.boolean().default(false),
});
export type ChildInput = z.input<typeof childInput>;

export interface Child extends z.output<typeof childInput> {
  id: string;
  createdAt: string;
}

export interface QuizSettings {
  /** Вариантов ответа на экране. */
  options: number;
  /** Верных ответов до следующего видео. */
  questions: number;
}

/** Значения по возрасту из таблицы п. 5.4 ТЗ: малыши (до 4 лет) — 2 варианта и 3 вопроса. */
export function quizDefaults(
  child: { birthYear: number; birthMonth: number },
  now = new Date(),
): QuizSettings {
  const months =
    (now.getFullYear() - child.birthYear) * 12 + (now.getMonth() + 1 - child.birthMonth);
  return months < 48 ? { options: 2, questions: 3 } : { options: 4, questions: 5 };
}

/** Малыш (до 1,5 лет, этап 16б): телефон на кронштейне — экран без заданий, всё само. */
export const BABY_MONTHS = 18;
export function isBaby(child: { birthYear: number; birthMonth: number }, now = new Date()) {
  const months =
    (now.getFullYear() - child.birthYear) * 12 + (now.getMonth() + 1 - child.birthMonth);
  return months < BABY_MONTHS;
}

export function quizSettings(
  child: {
    birthYear: number;
    birthMonth: number;
    quizOptions: number | null;
    quizQuestions: number | null;
  },
  now = new Date(),
): QuizSettings {
  const d = quizDefaults(child, now);
  return { options: child.quizOptions ?? d.options, questions: child.quizQuestions ?? d.questions };
}

// ─── Устройства ──────────────────────────────────────────────────────────────

export const pairingCreateRequest = z.object({
  childId: uuid,
  deviceName: z.string().trim().min(1).max(40),
});
export type PairingCreateRequest = z.input<typeof pairingCreateRequest>;

export interface PairingCreated {
  /** Короткий код для ручного ввода, формат XXXX-XXXX. */
  code: string;
  /** Ссылка для QR-кода: открывает детское приложение и привязывает устройство. */
  url: string;
  expiresAt: string;
}

export interface Device {
  id: string;
  childId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** Языки голосов синтеза речи на телефоне (ru, en, …); null — телефон ещё не сообщал. */
  speechLangs: string[] | null;
  speechCheckedAt: string | null;
}

// ─── Видео ───────────────────────────────────────────────────────────────────

export interface VideoLookup {
  provider: 'youtube';
  externalId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  /** Время из ссылки (`?t=`), подсказка для начала фрагмента. */
  suggestedStartSec: number | null;
}

/** Разделы главного экрана ребёнка для наборов карточек (видео — отдельный раздел). */
export const DECK_CATEGORIES = [
  'english',
  'chinese',
  'math',
  'geography',
  'nature',
  'music',
  'letters',
  'other',
] as const;
export type DeckCategory = (typeof DECK_CATEGORIES)[number];
/** Раздел игры: «Игры» или раздел карточек (игра про природу — в «Природе»). */
export const GAME_CATEGORIES = ['games', ...DECK_CATEGORIES] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];
/** Раздел игры из БД; неизвестный (старое значение) — «Игры». */
export const gameCategory = (v: string): GameCategory =>
  (GAME_CATEGORIES as readonly string[]).includes(v) ? (v as GameCategory) : 'games';
/** Раздел на главном экране ребёнка: видео, игры или раздел наборов карточек. */
export type KidCategory = 'video' | GameCategory;

const segmentRange = <T extends { startSec: number; endSec: number }>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  const len = v.endSec - v.startSec;
  if (len < SEGMENT_MIN_SEC || len > SEGMENT_MAX_SEC) {
    ctx.addIssue({
      code: 'custom',
      path: ['endSec'],
      message: `длительность фрагмента — от ${SEGMENT_MIN_SEC / 60} до ${SEGMENT_MAX_SEC / 60} минут`,
    });
  }
};

const segmentFields = {
  title: z.string().trim().min(1, 'укажите название').max(120),
  startSec: z.number().int().min(0),
  endSec: z.number().int().min(1),
  childIds: z.array(uuid).max(20),
  /** Предмет плана — для автосборки уроков; null — просто видео. */
  subject: z.enum(GAME_CATEGORIES).nullable().default(null),
};

export const segmentCreateRequest = z
  .object({ url: z.string().trim().min(1).max(500), ...segmentFields })
  .superRefine(segmentRange);
export const segmentUpdateRequest = z.object(segmentFields).superRefine(segmentRange);

export type SegmentCreateRequest = z.input<typeof segmentCreateRequest>;
export type SegmentUpdateRequest = z.input<typeof segmentUpdateRequest>;

export interface VideoSourceInfo {
  provider: 'youtube';
  externalId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  status: 'available' | 'unavailable';
  statusReason: string | null;
}

export interface Segment {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  createdAt: string;
  source: VideoSourceInfo;
  childIds: string[];
  questionCount: number;
  subject: GameCategory | null;
}

// ─── Медиа ───────────────────────────────────────────────────────────────────

export type MediaStatus = 'pending' | 'ready' | 'failed';

export interface MediaRef {
  id: string;
  /** Адрес для <img>/<audio>: /api/media/<id>. */
  url: string;
  status: MediaStatus;
}

export const mediaUrl = (id: string) => `/api/media/${id}`;

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

export interface EmojiItem {
  code: string;
  label: string;
  emoji: string;
}

export const emojiPickRequest = z.object({
  code: z.string().regex(/^[0-9a-f]{2,6}(-[0-9a-f]{2,6}){0,8}$/),
});

// ─── Вопросы квиза ───────────────────────────────────────────────────────────

const ttsText = z.string().trim().min(1, 'пустой текст').max(200);

export const questionInput = z
  .object({
    prompt: ttsText,
    lang: z.enum(LANGUAGES),
    options: z
      .array(
        z.object({
          imageId: uuid,
          label: z.string().trim().min(1, 'подпишите вариант').max(60),
          isCorrect: z.boolean(),
        }),
      )
      .min(2, 'минимум 2 варианта')
      .max(4, 'максимум 4 варианта'),
  })
  .refine((q) => q.options.filter((o) => o.isCorrect).length === 1, {
    message: 'должен быть ровно один верный вариант',
    path: ['options'],
  });
export type QuestionInput = z.input<typeof questionInput>;

export interface QuestionOption {
  id: string;
  label: string;
  isCorrect: boolean;
  image: MediaRef;
}

export interface Question {
  id: string;
  segmentId: string;
  prompt: string;
  lang: Language;
  audio: MediaRef | null;
  options: QuestionOption[];
}

// ─── Карточки ────────────────────────────────────────────────────────────────

export const deckInput = z.object({
  title: z.string().trim().min(1, 'укажите название').max(120),
  lang: z.enum(LANGUAGES),
  category: z.enum(DECK_CATEGORIES).default('other'),
  childIds: z.array(uuid).max(20),
});
export type DeckInput = z.input<typeof deckInput>;

export const cardInput = z.object({
  imageId: uuid,
  text: ttsText,
  /** Перевод на русский — для наборов на иностранном языке. */
  translation: ttsText.nullable().default(null),
  /** Свой вопрос проверки на языке набора; без него — «Где <слово>?». */
  question: ttsText.nullable().default(null),
});
export type CardInput = z.input<typeof cardInput>;

export interface Card {
  id: string;
  text: string;
  translation: string | null;
  question: string | null;
  image: MediaRef;
  audio: MediaRef | null;
  translationAudio: MediaRef | null;
  questionAudio: MediaRef | null;
  /** Слово, записанное голосом родителя (звучит вместо нейроголоса). */
  voice: MediaRef | null;
}

export interface Deck {
  id: string;
  title: string;
  lang: Language;
  category: DeckCategory;
  childIds: string[];
  cards: Card[];
}

// ─── Список ребёнка ──────────────────────────────────────────────────────────

export interface ChildItem {
  id: string;
  kind: 'segment' | 'deck' | 'interactive';
  /** id фрагмента, набора карточек или игры. */
  refId: string;
}

// ─── Игры ────────────────────────────────────────────────────────────────────

export interface Game {
  id: string;
  title: string;
  category: GameCategory;
  spec: GameSpec;
  childIds: string[];
}

/** Игра из кабинета: название, вид с параметрами, кому показывать. */
export const gameInput = z.object({
  title: z.string().trim().min(1, 'укажите название').max(120),
  category: z.enum(GAME_CATEGORIES).default('games'),
  spec: gameSpec,
  childIds: z.array(uuid).max(20),
});
export type GameInput = z.input<typeof gameInput>;

export const childItemsOrderRequest = z.object({ itemIds: z.array(uuid).max(1000) });

/** Массовое назначение (этап 33): дать ребёнку и убрать у него сразу много видео, наборов, игр. */
const itemRef = z.object({ kind: z.enum(['segment', 'deck', 'interactive']), refId: uuid });
export const childItemsBulkRequest = z.object({
  add: z.array(itemRef).max(2000).default([]),
  remove: z.array(itemRef).max(2000).default([]),
});
export type ChildItemsBulkRequest = z.input<typeof childItemsBulkRequest>;
export interface ChildItemsBulkResult {
  added: number;
  removed: number;
}

// ─── Детское приложение ──────────────────────────────────────────────────────

export const pairClaimRequest = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s.replace(/[^A-Z0-9]/g, ''))
    .pipe(z.string().length(8, 'код из 8 символов')),
});

export interface KidSegment {
  id: string;
  provider: 'youtube';
  externalId: string;
  startSec: number;
  endSec: number;
  thumbnailUrl: string | null;
  /** Тема видео (раздел): у малыша по ней — «Песенки» (music) и «Логопед» (other). */
  subject?: GameCategory | null;
}

/**
 * Фраза для ребёнка: текст и язык — всегда; audioUrl — если аудио сгенерировано на сервере
 * (Google TTS). Без audioUrl фразу произносит сам телефон (Web Speech API).
 */
export interface Speech {
  text: string;
  lang: Language;
  audioUrl: string | null;
}

export interface KidQuestion {
  id: string;
  prompt: Speech;
  options: { id: string; imageUrl: string; isCorrect: boolean }[];
}

export interface KidCard {
  id: string;
  imageUrl: string;
  word: Speech;
  /** Перевод на русский — звучит после слова. */
  translation: Speech | null;
  /** Свой вопрос проверки (вместо «Где <слово>?»). */
  question: Speech | null;
}

export type KidItem =
  | ({ kind: 'segment'; questions: KidQuestion[] } & KidSegment)
  | { kind: 'deck'; id: string; category: DeckCategory; coverUrl: string; cards: KidCard[] }
  | { kind: 'interactive'; id: string; category: GameCategory; spec: GameSpec };

/** Фразы похвалы и подсказки (с учётом рода ребёнка). */
export interface KidPhrases {
  correct: Speech[];
  retry: Speech[];
  done: Speech[];
  /** Несколько верных подряд (этап 30); у старых ответов сервера нет. */
  streak?: Speech[];
  /** Тыкает наугад — пауза «не спеши» (этап 30). */
  slow?: Speech[];
}

export interface KidPlaylist {
  quiz: QuizSettings;
  items: KidItem[];
  phrases: KidPhrases;
  /** Погружение: иностранные карточки без перевода, проверки и похвала — на английском. */
  immersion: boolean;
  /** Похвала и подсказки на английском — для проверок в режиме погружения. */
  phrasesEn: KidPhrases;
  /** Озвучка на сервере (нейроголос): фразы приложения запрашиваются через /api/kid/speech. */
  serverVoice: boolean;
  /** Просмотр из кабинета: родитель смотрит глазами ребёнка, прогресс не пишется. */
  preview?: boolean;
  /** Малыш (до 1,5 лет): экран малыша вместо разделов и заданий. */
  baby?: boolean;
  /** Колыбельные и сказки голосом мамы (записи родителя). */
  lullabies?: { label: string; url: string }[];
}

/** Фразы приложения для серверной озвучки (задания игр, разделы, «Где …?»). */
export const kidSpeechRequest = z.object({
  phrases: z
    .array(z.object({ text: z.string().trim().min(1).max(200), lang: z.enum(LANGUAGES) }))
    .min(1)
    .max(300),
});
export type KidSpeechRequest = z.input<typeof kidSpeechRequest>;

export const KID_EVENT_TYPES = [
  'segment_start',
  'segment_complete',
  'segment_exit',
  'segment_error',
  'app_hidden',
  'app_visible',
  'quiz_answer',
  'quiz_complete',
  'deck_complete',
  'interactive_complete',
] as const;

/** Языки голосов синтеза речи на телефоне — для предупреждения родителю. Только коды языков. */
export const kidVoicesRequest = z.object({
  langs: z.array(z.string().regex(/^[a-z]{2,3}$/)).max(100),
});
export type KidVoicesRequest = z.input<typeof kidVoicesRequest>;

/** Языки, голос для которых нужен ребёнку: русский (фразы приложения) + языки профиля и карточек. */
export function requiredSpeechLangs(
  childLangs: readonly string[],
  deckLangs: readonly string[] = [],
): string[] {
  return [...new Set(['ru', ...childLangs, ...deckLangs])];
}

export const kidEventRequest = z.object({
  type: z.enum(KID_EVENT_TYPES),
  segmentId: uuid.optional(),
  questionId: uuid.optional(),
  deckId: uuid.optional(),
  interactiveId: uuid.optional(),
  payload: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});
export type KidEventRequest = z.input<typeof kidEventRequest>;
