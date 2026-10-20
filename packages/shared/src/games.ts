// Интерактивные игры (п. 5.6 ТЗ): каждый вид — компонент детского приложения + схема параметров.
// Параметры хранятся в БД (interactives.params) и проверяются этой схемой и при записи, и при выдаче.
import { z } from 'zod';
import { SONG_IDS } from './songs';

const uuid = z.uuid();
const phrase = z.string().trim().min(1).max(200);

/** Картинки раскраски — нарисованы в коде детского приложения. */
export const COLORING_PICTURES = [
  'sun',
  'fish',
  'house',
  'flower',
  'car',
  'butterfly',
  'rocket',
] as const;
export type ColoringPicture = (typeof COLORING_PICTURES)[number];

/** Фигуры и цифры для обводки по точкам. */
export const TRACE_SHAPES = [
  'line',
  'wave',
  'zigzag',
  'circle',
  'square',
  'triangle',
  'star',
  'heart',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
] as const;
export type TraceShape = (typeof TRACE_SHAPES)[number];

export const BALLOON_COLORS = ['red', 'yellow', 'blue', 'green'] as const;
export type BalloonColor = (typeof BALLOON_COLORS)[number];

/** Фигуры сортера — нарисованы в коде детского приложения. */
export const SORTER_SHAPES = [
  'circle',
  'square',
  'triangle',
  'rectangle',
  'star',
  'heart',
  'hexagon',
  'oval',
  'rhombus',
  'cross',
] as const;
export type SorterShape = (typeof SORTER_SHAPES)[number];

/** Сцены «Фонарика» — фон нарисован в коде. */
export const FLASHLIGHT_SCENES = ['room', 'forest', 'sea', 'space'] as const;
export type FlashlightScene = (typeof FLASHLIGHT_SCENES)[number];

/** Закономерности «Продолжи ряд»: буква — картинка. */
export const PATTERNS = ['AB', 'AAB', 'ABB', 'ABC', 'AABB'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const MOLE_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type MoleSpeed = (typeof MOLE_SPEEDS)[number];

/** Слово «Собери слово»: буквы русского или английского алфавита, 2–10. */
const WORD_RE = /^[А-ЯЁA-Z]{2,10}$/u;

/** Ноты от «до» первой октавы до «до» второй — так их поёт ребёнок (сольфеджио). */
export const NOTE_NAMES = ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си', 'до'] as const;
/** Режимы пианино: свободная игра, «найди ноту ми», «какая нота прозвучала». */
export const PIANO_MODES = ['free', 'find', 'ear'] as const;
const musicRounds = z.number().int().min(2).max(12);
const keys = z.number().int().min(3).max(8);

// ─── Буквы (этап 15ж) ───
const letter = z.string().regex(/^[А-ЯЁ]$/u, 'одна заглавная буква');
/** Слово заглавными и эмодзи-картинка к нему (рисует сам телефон — файлы не нужны). */
const picWord = z.object({
  emoji: z.string().min(1).max(16),
  word: z.string().regex(/^[А-ЯЁ]{2,10}$/u, 'слово заглавными, 2–10 букв'),
});
const choices = z.number().int().min(2).max(4);
const letterRounds = z.number().int().min(2).max(12);

export const gameSpec = z.discriminatedUnion('kind', [
  /** Рисовалка: кисть, цвета, наклейки. */
  z.object({
    kind: z.literal('drawing'),
    stickerIds: z.array(uuid).max(12).default([]),
  }),
  /** Раскраска: касание области заливает её выбранным цветом. tasks — «Раскрась крышу красным». */
  z.object({
    kind: z.literal('coloring'),
    picture: z.enum(COLORING_PICTURES),
    tasks: z.boolean().default(false),
  }),
  /** Разложи предметы: перетащить каждый в свою корзину. */
  z
    .object({
      kind: z.literal('sorting'),
      prompt: phrase,
      bins: z
        .array(z.object({ imageId: uuid, name: phrase }))
        .min(1)
        .max(3),
      items: z
        .array(z.object({ imageId: uuid, bin: z.number().int().min(0) }))
        .min(2)
        .max(12),
    })
    .refine((g) => g.items.every((i) => i.bin < g.bins.length), {
      message: 'предмет ссылается на несуществующую корзину',
    }),
  /** Найди пару: карточки рубашкой вверх. */
  z.object({
    kind: z.literal('memory'),
    imageIds: z.array(uuid).min(2).max(10),
  }),
  /** Пазл: картинка режется на cols × rows частей. */
  z.object({
    kind: z.literal('puzzle'),
    imageIds: z.array(uuid).min(1).max(5),
    cols: z.number().int().min(1).max(4),
    rows: z.number().int().min(1).max(4),
  }),
  /** Обведи пальцем по точкам. */
  z.object({
    kind: z.literal('tracing'),
    shapes: z.array(z.enum(TRACE_SHAPES)).min(1).max(12),
  }),
  /** Лопни шарики; target — лопать только шарики этого цвета. */
  z.object({
    kind: z.literal('balloons'),
    count: z.number().int().min(3).max(20),
    target: z.enum(BALLOON_COLORS).nullable().default(null),
  }),
  /** Посчитай предметы и нажми цифру. */
  z.object({
    kind: z.literal('counting'),
    max: z.number().int().min(2).max(10),
    rounds: z.number().int().min(1).max(10),
    imageIds: z.array(uuid).min(1).max(10),
  }),
  /** Лабиринт: провести героя пальцем к цели; лабиринт size × size, каждый раунд новый. */
  z.object({
    kind: z.literal('maze'),
    heroId: uuid,
    goalId: uuid,
    size: z.number().int().min(3).max(9),
    rounds: z.number().int().min(1).max(5),
  }),
  /** Найди тень: перетащить картинку на её силуэт; perRound силуэтов за раз. */
  z.object({
    kind: z.literal('shadows'),
    imageIds: z.array(uuid).min(2).max(12),
    perRound: z.number().int().min(2).max(4),
  }),
  /** Фонарик: в темноте водить лучом и найти спрятанные предметы; name звучит при находке. */
  z.object({
    kind: z.literal('flashlight'),
    scene: z.enum(FLASHLIGHT_SCENES),
    items: z
      .array(z.object({ imageId: uuid, name: phrase.nullable().default(null) }))
      .min(1)
      .max(8),
  }),
  /** Кроты: зверьки выглядывают из норок; target — ловить только этого (номер картинки). */
  z
    .object({
      kind: z.literal('moles'),
      imageIds: z.array(uuid).min(1).max(4),
      target: z.number().int().min(0).nullable().default(null),
      /** Задание вслух, например «Лови только зайчиков!». */
      prompt: phrase.nullable().default(null),
      count: z.number().int().min(3).max(20),
      speed: z.enum(MOLE_SPEEDS).default('normal'),
    })
    .refine((g) => g.target === null || g.target < g.imageIds.length, {
      message: 'цель ссылается на несуществующую картинку',
    }),
  /** Повтори мелодию: колокольчики играют, ребёнок повторяет; мелодия растёт от start до goal. */
  z
    .object({
      kind: z.literal('melody'),
      bells: z.number().int().min(3).max(5),
      start: z.number().int().min(1).max(4),
      goal: z.number().int().min(2).max(8),
    })
    .refine((g) => g.goal >= g.start, { message: 'длина мелодии меньше начальной' }),
  /** Сортер: перетащить фигуры в отверстия; rotate — фигуры повёрнуты, касание поворачивает. */
  z.object({
    kind: z.literal('shapes'),
    shapes: z.array(z.enum(SORTER_SHAPES)).min(2).max(8),
    rotate: z.boolean().default(false),
  }),
  /** Что лишнее: в каждом раунде 3–4 картинки, одна лишняя; explain звучит после ответа. */
  z.object({
    kind: z.literal('odd'),
    rounds: z
      .array(
        z
          .object({
            imageIds: z.array(uuid).min(3).max(4),
            odd: z.number().int().min(0),
            explain: phrase.nullable().default(null),
          })
          .refine((r) => r.odd < r.imageIds.length, { message: 'лишняя — вне списка' }),
      )
      .min(1)
      .max(10),
  }),
  /** Продолжи ряд: ряд по закономерности, ребёнок выбирает, что дальше. */
  z
    .object({
      kind: z.literal('pattern'),
      imageIds: z.array(uuid).min(2).max(6),
      patterns: z.array(z.enum(PATTERNS)).min(1).max(PATTERNS.length),
      rounds: z.number().int().min(1).max(10),
    })
    .refine((g) => g.imageIds.length >= 3 || !g.patterns.includes('ABC'), {
      message: 'для ряда ABC нужно 3 картинки',
    }),
  /** Где больше / меньше: две группы предметов или два числа. */
  z
    .object({
      kind: z.literal('compare'),
      mode: z.enum(['objects', 'numbers']),
      ask: z.enum(['more', 'less', 'mixed']),
      max: z.number().int().min(2).max(10),
      rounds: z.number().int().min(1).max(10),
      imageIds: z.array(uuid).max(10).default([]),
    })
    .refine((g) => g.mode === 'numbers' || g.imageIds.length > 0, {
      message: 'выберите, что сравнивать',
    }),
  /** Сложи и вычти: предметы прилетают и улетают, ребёнок выбирает ответ. */
  z.object({
    kind: z.literal('arithmetic'),
    ops: z
      .array(z.enum(['plus', 'minus']))
      .min(1)
      .max(2),
    max: z.number().int().min(2).max(10),
    rounds: z.number().int().min(1).max(10),
    imageIds: z.array(uuid).min(1).max(10),
  }),
  /** По размеру: одна картинка в count размерах — расставить от маленького к большому. */
  z.object({
    kind: z.literal('size'),
    imageIds: z.array(uuid).min(1).max(5),
    count: z.number().int().min(3).max(5),
  }),
  /** По порядку: картинки разложить в правильном порядке (жизненный цикл, времена года). */
  z.object({
    kind: z.literal('sequence'),
    rounds: z
      .array(z.object({ prompt: phrase, imageIds: z.array(uuid).min(2).max(6) }))
      .min(1)
      .max(8),
  }),
  /** Собери слово: буквы перетащить в слово под картинкой; extra — лишние буквы. */
  z.object({
    kind: z.literal('word'),
    lang: z.enum(['ru', 'en']),
    words: z
      .array(
        z.object({
          imageId: uuid,
          word: z.string().trim().toUpperCase().regex(WORD_RE, 'только буквы, 2–10'),
        }),
      )
      .min(1)
      .max(10),
    extra: z.number().int().min(0).max(3).default(0),
  }),
  // ─── Музыка (этап 14б): звуки синтезирует телефон, картинки не нужны ───
  /** Высоко — низко: звучит нота, ребёнок выбирает птичку (высоко) или мишку (низко). gap — полутонов между ними. */
  z.object({
    kind: z.literal('pitch'),
    gap: z.number().int().min(12).max(36),
    rounds: musicRounds,
  }),
  /** Громко — тихо: слон или мышка. */
  z.object({ kind: z.literal('loudness'), rounds: musicRounds }),
  /** Быстро — медленно: зайчик или черепаха. */
  z.object({ kind: z.literal('tempo'), rounds: musicRounds }),
  /** Долго — коротко: паровоз «ту-у-у» или цыплёнок «пик». */
  z.object({ kind: z.literal('duration'), rounds: musicRounds }),
  /** Вверх или вниз: мелодия из notes нот идёт по лесенке вверх или вниз. */
  z.object({
    kind: z.literal('direction'),
    notes: z.number().int().min(3).max(5),
    rounds: musicRounds,
  }),
  /** Сколько звуков: барабан ударил несколько раз — выбрать число (до max). */
  z.object({ kind: z.literal('beats'), max: z.number().int().min(2).max(6), rounds: musicRounds }),
  /** Повтори ритм на барабане; timing — проверять и длительности («та» и «ти-ти»), а не только число. */
  z.object({
    kind: z.literal('rhythm'),
    beats: z.number().int().min(2).max(6),
    timing: z.boolean().default(false),
    rounds: musicRounds,
  }),
  /** Пианино с цветными клавишами до-ре-ми (keys клавиш от «до»). */
  z.object({
    kind: z.literal('piano'),
    mode: z.enum(PIANO_MODES),
    keys,
    rounds: musicRounds,
  }),
  /** Нотный стан: где живёт нота — выбрать её название. */
  z.object({ kind: z.literal('staff'), keys, rounds: musicRounds }),
  /** Сыграй песенку: светится нужная клавиша — ребёнок играет знакомую мелодию (по песенке на раунд). */
  z.object({ kind: z.literal('song'), songs: z.array(z.enum(SONG_IDS)).min(1).max(4) }),
  /** «Замри!»: под музыку танцуем, музыка стихла — замираем. */
  z.object({ kind: z.literal('freeze'), rounds: z.number().int().min(2).max(8) }),
  /** Звериный оркестр: у каждого зверька свой инструмент; дирижёр зовёт сыграть того, кто светится. */
  z.object({
    kind: z.literal('orchestra'),
    players: z.number().int().min(3).max(6),
    rounds: z.number().int().min(2).max(8),
  }),
  // ─── Буквы ───
  /** Найди букву: звучит буква — ребёнок выбирает её среди choices. */
  z.object({
    kind: z.literal('letter'),
    letters: z.array(letter).min(2).max(33),
    choices,
    rounds: letterRounds,
  }),
  /** Найди слог: звучит слог («ма») — выбрать написанный. */
  z.object({
    kind: z.literal('syllable'),
    syllables: z
      .array(z.string().regex(/^[А-ЯЁ]{2,3}$/u))
      .min(2)
      .max(60),
    choices,
    rounds: letterRounds,
  }),
  /** С какой буквы начинается слово: картинка и слово голосом — выбрать первую букву. */
  z.object({
    kind: z.literal('firstLetter'),
    words: z.array(picWord).min(2).max(30),
    choices,
    rounds: letterRounds,
  }),
  /** Прочитай слово: написано слово — найти его картинку. */
  z.object({
    kind: z.literal('readWord'),
    words: z.array(picWord).min(2).max(30),
    choices,
    rounds: letterRounds,
  }),
  // ─── Счёт и логика (этап 34) ───
  /** Который час: звучит время — найти часы со стрелками; half — и «половина пятого». */
  z.object({
    kind: z.literal('clock'),
    half: z.boolean().default(false),
    choices: z.number().int().min(2).max(4).default(3),
    rounds: z.number().int().min(2).max(10),
  }),
  /** Магазин: купить товар — положить монетки на нужную сумму (до max); coins — какие монеты есть. */
  z.object({
    kind: z.literal('shop'),
    imageIds: z.array(uuid).min(1).max(10),
    max: z.number().int().min(2).max(10),
    coins: z
      .array(z.union([z.literal(1), z.literal(2), z.literal(5)]))
      .min(1)
      .max(3)
      .default([1]),
    rounds: z.number().int().min(2).max(8),
  }),
  /** Совёнок-робот: стрелками составить путь по клеткам size × size до цели; rocks — с камнями. */
  z.object({
    kind: z.literal('robot'),
    size: z.number().int().min(3).max(6),
    steps: z.number().int().min(2).max(8),
    rocks: z.boolean().default(false),
    rounds: z.number().int().min(1).max(6),
  }),
  // ─── Посложнее, с управлением (этап 36) ───
  /**
   * Космос по порядку: ракета облетает планеты по порядку — цифры (через step) или буквы
   * (SPACE_LETTERS); reverse — с конца.
   */
  z.object({
    kind: z.literal('space'),
    order: z.enum(['numbers', 'letters']).default('numbers'),
    count: z.number().int().min(3).max(10),
    step: z.union([z.literal(1), z.literal(2)]).default(1),
    reverse: z.boolean().default(false),
    rounds: z.number().int().min(1).max(5),
  }),
  /**
   * Рыбалка: крючок ведут пальцем и отпускают у нужной рыбки — с цифрой (до max), с буквой
   * (первые max из FISHING_LETTERS) или с ответом примера (сумма до max).
   */
  z.object({
    kind: z.literal('fishing'),
    mode: z.enum(['numbers', 'letters', 'sums']).default('numbers'),
    max: z.number().int().min(3).max(10),
    fish: z.number().int().min(3).max(6),
    speed: z.enum(['slow', 'normal', 'fast']).default('slow'),
    rounds: z.number().int().min(2).max(10),
  }),
  /**
   * Совёнок летит: держи палец — совёнок поднимается, отпустил — плавно снижается. Собрать
   * stars звёздочек (их считают вслух), тучки облетать; проиграть нельзя.
   */
  z.object({
    kind: z.literal('flight'),
    stars: z.number().int().min(5).max(20),
    clouds: z.enum(['none', 'few', 'many']).default('few'),
    speed: z.enum(['slow', 'normal', 'fast']).default('slow'),
  }),
  /**
   * Строитель: построить башню из height деталей как на образце; детали — первые blocks из
   * BUILDER_BLOCKS; hide — образец прячется, башню строят по памяти (подсмотреть можно).
   */
  z.object({
    kind: z.literal('builder'),
    height: z.number().int().min(2).max(6),
    blocks: z.number().int().min(3).max(5),
    hide: z.boolean().default(false),
    rounds: z.number().int().min(1).max(5),
  }),
]);

/** Детали «Строителя»: кубик, брусок, крыша, арка, цилиндр. */
export const BUILDER_BLOCKS = ['cube', 'bar', 'roof', 'arch', 'drum'] as const;
export type BuilderBlock = (typeof BUILDER_BLOCKS)[number];

/** Буквы «Космоса по порядку» — начало алфавита (без Ё и Й: их трудно назвать по порядку). */
export const SPACE_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'] as const;
/** Буквы «Рыбалки» — те, что учат первыми. */
export const FISHING_LETTERS = [
  'А',
  'О',
  'У',
  'И',
  'М',
  'П',
  'Т',
  'К',
  'С',
  'Л',
  'Н',
  'Д',
] as const;
export type GameSpec = z.infer<typeof gameSpec>;
export type GameKind = GameSpec['kind'];

export const GAME_KINDS: Record<GameKind, string> = {
  drawing: 'Рисовалка',
  coloring: 'Раскраска',
  sorting: 'Разложи по местам',
  memory: 'Найди пару',
  puzzle: 'Пазл',
  tracing: 'Обведи по точкам',
  balloons: 'Лопни шарики',
  counting: 'Посчитай',
  maze: 'Лабиринт',
  shadows: 'Найди тень',
  flashlight: 'Фонарик',
  moles: 'Поймай зверька',
  melody: 'Повтори мелодию',
  shapes: 'Сортер фигур',
  odd: 'Что лишнее?',
  pattern: 'Продолжи ряд',
  compare: 'Где больше?',
  arithmetic: 'Сложи и вычти',
  size: 'По размеру',
  sequence: 'По порядку',
  word: 'Собери слово',
  pitch: 'Высоко — низко',
  loudness: 'Громко — тихо',
  tempo: 'Быстро — медленно',
  duration: 'Долго — коротко',
  direction: 'Вверх или вниз',
  beats: 'Сколько звуков',
  rhythm: 'Повтори ритм',
  piano: 'Пианино: ноты',
  staff: 'Нотный стан',
  song: 'Сыграй песенку',
  freeze: 'Замри!',
  orchestra: 'Звериный оркестр',
  letter: 'Найди букву',
  syllable: 'Найди слог',
  firstLetter: 'С какой буквы?',
  readWord: 'Прочитай слово',
  clock: 'Который час?',
  shop: 'Магазин',
  robot: 'Совёнок-робот',
  space: 'Космос по порядку',
  fishing: 'Рыбалка',
  flight: 'Совёнок летит',
  builder: 'Строитель',
};

/** id картинок в параметрах игры — для проверки, что они есть и готовы. */
export function gameImageIds(g: GameSpec): string[] {
  switch (g.kind) {
    case 'drawing':
      return g.stickerIds;
    case 'sorting':
      return [...g.bins.map((b) => b.imageId), ...g.items.map((i) => i.imageId)];
    case 'memory':
    case 'puzzle':
    case 'counting':
    case 'shadows':
    case 'moles':
    case 'pattern':
    case 'compare':
    case 'arithmetic':
    case 'size':
    case 'shop':
      return g.imageIds;
    case 'maze':
      return [g.heroId, g.goalId];
    case 'flashlight':
    case 'word':
      return (g.kind === 'flashlight' ? g.items : g.words).map((i) => i.imageId);
    case 'odd':
    case 'sequence':
      return g.rounds.flatMap((r) => r.imageIds);
    case 'coloring':
    case 'clock':
    case 'robot':
    case 'space':
    case 'fishing':
    case 'flight':
    case 'builder':
    case 'tracing':
    case 'balloons':
    case 'melody':
    case 'shapes':
    case 'pitch':
    case 'loudness':
    case 'tempo':
    case 'duration':
    case 'direction':
    case 'beats':
    case 'rhythm':
    case 'piano':
    case 'staff':
    case 'song':
    case 'freeze':
    case 'orchestra':
    case 'letter':
    case 'syllable':
    case 'firstLetter':
    case 'readWord':
      return [];
  }
}
