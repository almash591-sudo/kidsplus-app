import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Служебные пары ключ–значение уровня приложения. */
export const appMeta = pgTable('app_meta', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ─── Родители ────────────────────────────────────────────────────────────────

/** Семья основателя: ей принадлежат данные, созданные до этапа 23; она же ведёт общую библиотеку. */
export const MAIN_FAMILY_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Семьи (этап 23): у каждой свои родители, дети, телефоны, звонки, голос и аудиотека.
 * Библиотека (видео, карточки, игры) общая; меняет её и модерирует только семья с isAdmin.
 */
export const families = pgTable('families', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  isAdmin: boolean().notNull().default(false),
  createdAt: createdAt(),
});

const familyId = () =>
  uuid()
    .notNull()
    .default(MAIN_FAMILY_ID)
    .references(() => families.id, { onDelete: 'cascade' });

export const parentUsers = pgTable('parent_users', {
  id: uuid().primaryKey().defaultRandom(),
  familyId: familyId(),
  /** Хранится в нижнем регистре. */
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  /** Как ребёнок видит родителя в звонках («Мама», «Папа»); null — «Родитель». */
  displayName: text(),
  createdAt: createdAt(),
});

/** Сессии родителя. В cookie — случайный токен, здесь — его SHA-256. */
export const parentSessions = pgTable(
  'parent_sessions',
  {
    tokenHash: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => parentUsers.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.userId)],
);

/** Одноразовые приглашения второго родителя. */
export const parentInvites = pgTable('parent_invites', {
  tokenHash: text().primaryKey(),
  createdBy: uuid()
    .notNull()
    .references(() => parentUsers.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  /** Приглашение основать новую семью (а не стать вторым родителем в своей). */
  newFamily: boolean().notNull().default(false),
  /** Название новой семьи — для списка в кабинете. */
  familyName: text(),
});

// ─── Дети и устройства ───────────────────────────────────────────────────────

export const genderEnum = pgEnum('gender', ['f', 'm']);

/** Профиль ребёнка. Настоящее имя и точная дата рождения не хранятся. */
export const children = pgTable(
  'children',
  {
    id: uuid().primaryKey().defaultRandom(),
    familyId: familyId(),
    nickname: text().notNull(),
    birthYear: integer().notNull(),
    birthMonth: integer().notNull(),
    /** Грамматический род для фраз озвучки. */
    gender: genderEnum().notNull(),
    languages: text()
      .array()
      .notNull()
      .default(sql`'{ru}'::text[]`),
    /** Вариантов ответа в квизе (2–4); null — по возрасту (п. 5.4 ТЗ). */
    quizOptions: integer(),
    /** Верных ответов до следующего видео (1–10); null — по возрасту. */
    quizQuestions: integer(),
    /** Карточки на иностранном языке — только на этом языке, без перевода (погружение). */
    foreignImmersion: boolean().notNull().default(false),
    /** Объёмные авторские картинки (этап 25) вместо эмодзи, где они есть; включает родитель. */
    illustrations: boolean().notNull().default(false),
    /** Громкость телефона 0–100, заданная родителем (этап 29, киоск); null — не трогаем. */
    volume: integer(),
    /**
     * «Выключить экран с поводом» (этап 29): sleep | eat | walk | bath | book | rest. У ребёнка,
     * а не у дня: «спать» в 21:00 не должно сняться само в полночь.
     */
    rest: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check('children_birth_month', sql`${t.birthMonth} between 1 and 12`),
    check(
      'children_quiz_options',
      sql`${t.quizOptions} is null or ${t.quizOptions} between 2 and 4`,
    ),
    check(
      'children_quiz_questions',
      sql`${t.quizQuestions} is null or ${t.quizQuestions} between 1 and 10`,
    ),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    createdAt: createdAt(),
    lastSeenAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    /** Просмотр из кабинета (этап 16а): родитель смотрит глазами ребёнка — без прогресса, на 2 часа. */
    preview: boolean().notNull().default(false),
    /** Языки, для которых на телефоне есть голос синтеза речи (ru, en, …); null — ещё не сообщал. */
    speechLangs: text().array(),
    speechCheckedAt: timestamp({ withTimezone: true }),
    /** Заряд телефона, % (этап 8); null — ещё не сообщал. */
    batteryLevel: smallint(),
    batteryCharging: boolean(),
    batteryAt: timestamp({ withTimezone: true }),
    /** Когда ушёл push «телефон садится» — один раз за разряд. */
    batteryAlertAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.childId)],
);

/** Одноразовые коды привязки устройства (QR). Хранится SHA-256 кода. */
export const devicePairings = pgTable('device_pairings', {
  codeHash: text().primaryKey(),
  childId: uuid()
    .notNull()
    .references(() => children.id, { onDelete: 'cascade' }),
  deviceName: text().notNull(),
  createdBy: uuid()
    .notNull()
    .references(() => parentUsers.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
  /** Код для просмотра из кабинета, а не для телефона ребёнка. */
  preview: boolean().notNull().default(false),
});

// ─── Видео ───────────────────────────────────────────────────────────────────

export const videoStatusEnum = pgEnum('video_status', ['available', 'unavailable']);

/** Исходное видео у провайдера. Само видео не скачивается — только метаданные. */
export const videoSources = pgTable(
  'video_sources',
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    externalId: text().notNull(),
    title: text().notNull(),
    channelTitle: text(),
    thumbnailUrl: text(),
    status: videoStatusEnum().notNull().default('available'),
    statusReason: text(),
    statusCheckedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.provider, t.externalId)],
);

/** Фрагмент видео 1–5 минут. На этапе 1 добавляется родителем — значит, одобрен. */
export const videoSegments = pgTable(
  'video_segments',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceId: uuid()
      .notNull()
      .references(() => videoSources.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    startSec: integer().notNull(),
    endSec: integer().notNull(),
    /** Предмет плана (english, math, nature…) — для автосборки уроков; null — просто видео. */
    subject: text(),
    createdBy: uuid().references(() => parentUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.sourceId),
    check('video_segments_range', sql`${t.startSec} >= 0 and ${t.endSec} > ${t.startSec}`),
  ],
);

// ─── Модерация ───────────────────────────────────────────────────────────────

export const moderationStatusEnum = pgEnum('moderation_status', [
  'queued',
  'processing',
  'ready',
  'skipped',
  'failed',
  'approved',
  'rejected',
]);

/**
 * Видео в очереди модерации (п. 7.1 ТЗ): метаданные провайдера, отчёт модели, решение родителя.
 * До одобрения ничего из этого ребёнку не показывается.
 */
export const moderationItems = pgTable(
  'moderation_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    externalId: text().notNull(),
    url: text().notNull(),
    /** Подсказка родителя: о какой теме видео. */
    topic: text(),
    status: moderationStatusEnum().notNull().default('queued'),
    /** Метаданные YouTube Data API (или oEmbed без ключа). */
    metadata: jsonb().$type<Record<string, unknown>>(),
    skipReason: text(),
    /** Отчёт модели с черновиком фрагментов и квиза (ModerationReport). */
    report: jsonb().$type<Record<string, unknown>>(),
    error: text(),
    attempts: integer().notNull().default(0),
    createdBy: uuid().references(() => parentUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex().on(t.provider, t.externalId), index().on(t.status)],
);

/** Расход токенов модели по задачам — для лимитов (п. 7.4 ТЗ). */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    task: text().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull(),
    outputTokens: integer().notNull(),
    moderationItemId: uuid().references(() => moderationItems.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)],
);

// ─── События ─────────────────────────────────────────────────────────────────

/** События для аналитики (этап 5). Без персональных данных. */
export const events = pgTable(
  'events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    type: text().notNull(),
    segmentId: uuid().references(() => videoSegments.id, { onDelete: 'set null' }),
    payload: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.childId, t.createdAt)],
);

// ─── Медиа ───────────────────────────────────────────────────────────────────

export const mediaKindEnum = pgEnum('media_kind', ['audio', 'image']);
export const mediaStatusEnum = pgEnum('media_status', ['pending', 'ready', 'failed']);

/**
 * Файл озвучки или картинки. Сами байты — в хранилище (диск / Railway Bucket) по `storageKey`.
 * Озвучка создаётся со статусом pending и генерируется worker'ом ровно один раз (ключ `ttsKey`).
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: mediaKindEnum().notNull(),
    status: mediaStatusEnum().notNull().default('ready'),
    /** tts | upload | twemoji */
    source: text().notNull(),
    /** Для twemoji — код эмодзи: одна картинка на эмодзи. */
    sourceRef: text(),
    storageKey: text(),
    mimeType: text(),
    bytes: integer(),
    license: text(),
    attribution: text(),
    /** Ключ кэша озвучки: хэш текста, языка, голоса, скорости и провайдера. */
    ttsKey: text().unique(),
    ttsText: text(),
    ttsLang: text(),
    ttsVoice: text(),
    ttsSpeed: real(),
    /** Авторская картинка (этап 25) для эмодзи — показывается детям с включёнными illustrations. */
    illustrationId: uuid().references((): AnyPgColumn => mediaAssets.id, { onDelete: 'set null' }),
    attempts: integer().notNull().default(0),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.source, t.sourceRef), index().on(t.status)],
);

// ─── Квизы ───────────────────────────────────────────────────────────────────

/** Вопрос к видеофрагменту: озвучивается, ответ — одна из картинок. */
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    segmentId: uuid()
      .notNull()
      .references(() => videoSegments.id, { onDelete: 'cascade' }),
    prompt: text().notNull(),
    lang: text().notNull().default('ru'),
    promptAudioId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    position: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.segmentId)],
);

export const quizOptions = pgTable(
  'quiz_options',
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    imageId: uuid()
      .notNull()
      .references(() => mediaAssets.id),
    /** Подпись для родителя («кошка»); ребёнок её не видит. */
    label: text().notNull(),
    isCorrect: boolean().notNull(),
    position: integer().notNull(),
  },
  (t) => [index().on(t.questionId)],
);

// ─── Карточки ────────────────────────────────────────────────────────────────

export const flashcardDecks = pgTable('flashcard_decks', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  /** Язык озвучки карточек. */
  lang: text().notNull().default('ru'),
  /** Раздел на главном экране ребёнка: english | chinese | math | other. */
  category: text().notNull().default('other'),
  createdAt: createdAt(),
});

export const flashcards = pgTable(
  'flashcards',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => flashcardDecks.id, { onDelete: 'cascade' }),
    imageId: uuid()
      .notNull()
      .references(() => mediaAssets.id),
    text: text().notNull(),
    audioId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    /** Перевод на русский для языковых наборов — озвучивается после слова. */
    translation: text(),
    translationAudioId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    /** Свой вопрос для проверки («Покажи пример: два плюс один»); без него — «Где <слово>?». */
    question: text(),
    questionAudioId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    /** Слово, записанное голосом родителя (этап 15в) — звучит вместо нейроголоса. */
    customAudioId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    position: integer().notNull(),
  },
  (t) => [index().on(t.deckId)],
);

// ─── Список ребёнка ──────────────────────────────────────────────────────────

// ─── Игры ────────────────────────────────────────────────────────────────────

/** Интерактивная игра: вид (kind) и параметры, проверенные схемой gameSpec из shared. */
export const interactives = pgTable('interactives', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  /** Раздел на главном экране ребёнка: games или раздел карточек (geography, nature…). */
  category: text().notNull().default('games'),
  kind: text().notNull(),
  params: jsonb().notNull(),
  createdAt: createdAt(),
});

export const childItemKindEnum = pgEnum('child_item_kind', ['segment', 'deck', 'interactive']);

/** Что и в каком порядке показывается ребёнку: видеофрагменты (с квизами) и наборы карточек. */
export const childItems = pgTable(
  'child_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    kind: childItemKindEnum().notNull(),
    segmentId: uuid().references(() => videoSegments.id, { onDelete: 'cascade' }),
    deckId: uuid().references(() => flashcardDecks.id, { onDelete: 'cascade' }),
    interactiveId: uuid().references(() => interactives.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex().on(t.childId, t.segmentId),
    uniqueIndex().on(t.childId, t.deckId),
    uniqueIndex().on(t.childId, t.interactiveId),
    index().on(t.childId, t.position),
    check(
      'child_items_target',
      // kind::text — новое значение enum нельзя использовать в той же транзакции, что и ADD VALUE.
      sql`(${t.kind}::text = 'segment' and ${t.segmentId} is not null and ${t.deckId} is null and ${t.interactiveId} is null)
       or (${t.kind}::text = 'deck' and ${t.deckId} is not null and ${t.segmentId} is null and ${t.interactiveId} is null)
       or (${t.kind}::text = 'interactive' and ${t.interactiveId} is not null and ${t.segmentId} is null and ${t.deckId} is null)`,
    ),
  ],
);

// ─── Файлы в БД ──────────────────────────────────────────────────────────────

/** bytea: node-postgres отдаёт Buffer, PGlite — Uint8Array; наружу всегда Uint8Array. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  toDriver: (v) => Buffer.from(v),
  fromDriver: (v) => new Uint8Array(v),
});

/**
 * Содержимое медиафайлов при STORAGE_DRIVER=db (бесплатный тариф Railway без bucket).
 * Ключ — тот же storageKey, что и в media_assets.
 */
export const mediaBlobs = pgTable('media_blobs', {
  key: text().primaryKey(),
  data: bytea().notNull(),
  mimeType: text().notNull(),
  createdAt: createdAt(),
});

// ─── Учебный план и расписание (этап 4) ──────────────────────────────────────

/** Правила дня ребёнка: предметы × минуты, свободное время, окна по дням недели. */
export const childSchedules = pgTable('child_schedules', {
  childId: uuid()
    .primaryKey()
    .references(() => children.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(false),
  subjectsPerDay: integer().notNull(),
  minutesPerSubject: integer().notNull(),
  freeMinutes: integer().notNull(),
  timezone: text().notNull(),
  /** { mon: { from: '09:00', to: '21:00' } | null, … } */
  windows: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Учебный план на период: предметы и темы по неделям. */
export const curricula = pgTable(
  'curricula',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    /** ГГГГ-ММ-ДД, первый день первой недели. */
    startsOn: text().notNull(),
    weeks: integer().notNull(),
    subjects: text().array().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.childId)],
);

/** Тема недели по предмету и материалы для её уроков. */
export const curriculumTopics = pgTable(
  'curriculum_topics',
  {
    id: uuid().primaryKey().defaultRandom(),
    curriculumId: uuid()
      .notNull()
      .references(() => curricula.id, { onDelete: 'cascade' }),
    subject: text().notNull(),
    week: integer().notNull(),
    title: text().notNull(),
    /** [{ kind: 'segment' | 'deck' | 'interactive', refId }] */
    items: jsonb().notNull().default([]),
    position: integer().notNull().default(0),
  },
  (t) => [index().on(t.curriculumId)],
);

/** Сколько секунд ребёнок занимался за день: по предмету или 'free' (свободное время). */
export const dayUsage = pgTable(
  'day_usage',
  {
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    /** ГГГГ-ММ-ДД в часовом поясе расписания. */
    date: text().notNull(),
    activity: text().notNull(),
    seconds: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.date, t.activity] })],
);

/** День ребёнка под управлением родителя: пауза, завершение, добавленное время; что на экране. */
export const dayControls = pgTable(
  'day_controls',
  {
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    date: text().notNull(),
    paused: boolean().notNull().default(false),
    ended: boolean().notNull().default(false),
    extraSeconds: integer().notNull().default(0),
    /** Окно открыто родителем до этого момента (время добавлено вне окна). */
    openUntil: timestamp({ withTimezone: true }),
    /** Родителю уже сообщили, что занятия на сегодня закончены. */
    doneNotified: boolean().notNull().default(false),
    /** Родитель позвал ребёнка. */
    calledAt: timestamp({ withTimezone: true }),
    /** Последний сигнал телефона: чем занят и что на экране. */
    lastBeatAt: timestamp({ withTimezone: true }),
    activity: text(),
    item: jsonb(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.date] })],
);

/** Черновик учебного плана от языковой модели: тема на неделю по каждому предмету. */
export const curriculumDrafts = pgTable(
  'curriculum_drafts',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    /** queued | processing | ready | failed */
    status: text().notNull().default('queued'),
    /** Что передаётся модели: только возраст, предметы и число недель — без имени ребёнка. */
    request: jsonb().notNull(),
    result: jsonb(),
    error: text(),
    attempts: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.status)],
);

/** Подписки родителей на push-уведомления (по одной на браузер/телефон). */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid().primaryKey().defaultRandom(),
  parentId: uuid()
    .notNull()
    .references(() => parentUsers.id, { onDelete: 'cascade' }),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  /** Какие уведомления присылать (PUSH_KINDS). */
  kinds: text().array().notNull(),
  createdAt: createdAt(),
});

/**
 * Снимки ребёнка (этап 9): копия фото и видео с телефона для кабинета. Файл — в хранилище медиа
 * (ключ captures/…), доступ только родителю. Сверх квоты удаляются самые старые.
 */
export const kidCaptures = pgTable(
  'kid_captures',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    /** photo | video */
    kind: text().notNull(),
    mimeType: text().notNull(),
    bytes: integer().notNull(),
    durationMs: integer(),
    storageKey: text().notNull(),
    /** Когда снято на телефоне. */
    takenAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.childId, t.takenAt), index().on(t.createdAt)],
);

/**
 * Звонки внутри семьи (этап 10). Участник — «c:<id ребёнка>» или «p:<id родителя>».
 * Сами звук и видео через сервер не идут — здесь только журнал и состояние.
 */
export const calls = pgTable(
  'calls',
  {
    id: uuid().primaryKey().defaultRandom(),
    video: boolean().notNull(),
    /** Радионяня (этап 11): только звук от ребёнка, без звонка на его телефоне. */
    monitor: boolean().notNull().default(false),
    createdBy: text().notNull(),
    /** ringing | active | ended */
    status: text().notNull(),
    createdAt: createdAt(),
    answeredAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.status), index().on(t.createdAt)],
);

export const callMembers = pgTable(
  'call_members',
  {
    callId: uuid()
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    peer: text().notNull(),
    /** ringing | joined | declined | missed | left */
    state: text().notNull(),
    joinedAt: timestamp({ withTimezone: true }),
    leftAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.callId, t.peer] }), index().on(t.peer)],
);

/** Радионяня (этап 11): включена ли для ребёнка, чувствительность, когда было шумно. */
export const childMonitor = pgTable('child_monitor', {
  childId: uuid()
    .primaryKey()
    .references(() => children.id, { onDelete: 'cascade' }),
  on: boolean().notNull().default(false),
  /** low | medium | high */
  sensitivity: text().notNull().default('medium'),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastNoiseAt: timestamp({ withTimezone: true }),
  /** Когда ушёл push о шуме — не чаще раза в 5 минут. */
  lastAlertAt: timestamp({ withTimezone: true }),
});

/** Недельный отчёт по ребёнку (п. 9 ТЗ): сводка, рекомендации по правилам и от модели. */
export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    /** Понедельник недели, ГГГГ-ММ-ДД. */
    weekStart: text().notNull(),
    stats: jsonb().notNull(),
    rules: jsonb().notNull(),
    advice: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.childId, t.weekStart)],
);

/** Настройки системы, которые родитель меняет в кабинете (этап 14в): key — имя, value — JSON. */
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Фразы, записанные голосом родителя (этап 15в): похвала, «попробуй ещё», конец урока. */
export const familyPhrases = pgTable('family_phrases', {
  id: uuid().primaryKey().defaultRandom(),
  familyId: familyId(),
  /** correct | retry | done */
  kind: text().notNull(),
  audioId: uuid()
    .notNull()
    .references(() => mediaAssets.id, { onDelete: 'cascade' }),
  /** Что сказано — для списка в кабинете и как подпись, если запись не загрузится. */
  label: text().notNull(),
  createdAt: createdAt(),
});

/**
 * Аудиотека семьи (этап 20): mp3, которые родители загружают в кабинете. Одна на всех родителей;
 * на телефоны детей попадают только треки с forKids. Файл — в хранилище аудио (R2), ключ audio/….
 */
export const audioTracks = pgTable(
  'audio_tracks',
  {
    id: uuid().primaryKey().defaultRandom(),
    familyId: familyId(),
    title: text().notNull(),
    mimeType: text().notNull(),
    bytes: integer().notNull(),
    storageKey: text().notNull(),
    /** Показывать на телефонах детей. */
    forKids: boolean().notNull().default(false),
    createdBy: uuid().references(() => parentUsers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)],
);

/**
 * Привычки ребёнка (этап 30): дела утра, дня и вечера. Удалённая родителем — archivedAt
 * (отметки и заработанные за неё звёзды остаются).
 */
export const habits = pgTable(
  'habits',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    /** Готовое дело (teeth, wash…) — картинка и напоминание; null — своё дело родителя. */
    preset: text(),
    title: text().notNull(),
    /** morning | day | evening */
    slot: text().notNull(),
    /** Напоминание на телефоне, ЧЧ:ММ по часам телефона; null — без напоминания. */
    remindAt: text(),
    position: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.childId)],
);

/** Отметка «сделал» — одна на дело в день (дата — в часовом поясе расписания); одна звёздочка. */
export const habitMarks = pgTable(
  'habit_marks',
  {
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    date: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.habitId, t.date] }), index().on(t.childId, t.date)],
);

/** Награды за звёзды, которые задаёт родитель. */
export const rewards = pgTable(
  'rewards',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    price: integer().notNull(),
    /** Бонусные минуты к времени дня при выдаче; null — награда «в жизни». */
    bonusMinutes: integer(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.childId), check('rewards_price', sql`${t.price} > 0`)],
);

/**
 * Выданные награды: звёзды списаны. Баланс копилки = отметки − сумма price выдач (без
 * отдельного счётчика — не разойдётся). Название и цена копируются: награду могут удалить.
 */
export const rewardGrants = pgTable(
  'reward_grants',
  {
    id: uuid().primaryKey().defaultRandom(),
    childId: uuid()
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    rewardId: uuid().references(() => rewards.id, { onDelete: 'set null' }),
    title: text().notNull(),
    price: integer().notNull(),
    bonusMinutes: integer(),
    grantedBy: uuid().references(() => parentUsers.id, { onDelete: 'set null' }),
    at: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.childId, t.at)],
);
