// Фразы самого приложения — в одном месте: их произносят экраны и игры, и их же приложение
// заранее просит озвучить на сервере (нейроголосом), когда серверная озвучка включена.
import { BATTERY_PHRASES } from '@kidsplus/shared/battery';
import type { KidCategory, KidPlaylist } from '@kidsplus/shared/api';
import type {
  BalloonColor,
  ColoringPicture,
  DotPicture,
  DressWeather,
  FigureShape,
  GameKind,
  GameSpec,
  TangramFigure,
  TraceShape,
} from '@kidsplus/shared/games';
import {
  BUILDER_BLOCKS,
  problemAnswer,
  DIVE_FISH,
  FISHING_LETTERS,
  ROCKET_COLORS,
  RACE_COLORS,
  NOTE_NAMES,
  PAINT_RECIPES,
  PAINT_TARGETS,
  PAINT_TUBES,
  SPACE_LETTERS,
  type BuilderBlock,
  type DiveFish,
  type PaintTarget,
  type PaintTube,
  type RaceColor,
  type RocketColor,
  type RocketPart,
} from '@kidsplus/shared/games';
import {
  bookAnnounce,
  bookOf,
  bookReads,
  chapterAnnounce,
  type BookCode,
  type BookGenre,
} from '@kidsplus/shared/books';
import { MAX_LEVEL, specAtLevel } from '@kidsplus/shared/levels';
import { lineStart, partSpeech, poemAnnounce, poemOf, type PoemCode } from '@kidsplus/shared/poems';
import { SONGS } from '@kidsplus/shared/songs';
import { soundPlace, syllablesIn, unstressed, wordScheme } from '@kidsplus/shared/sounds';
import { NUMBERS, paint, PALETTE, type SpecOf } from './games/common';
import { BUBBLE_COLORS, BUBBLE_DIGITS, COLOR_WORDS, type BubbleColor } from './games/bubblesLogic';
import { MARBLE_WORDS } from './games/marbleLogic';
import { DAY, type DayId, type Time } from './games/cuckooLogic';
import { needCount, OUTFITS, SLOT, WRONG_IN, type ItemId } from './games/dressLogic';
import { PAINT_OBJECTS } from './games/paintsLogic';
import { topOf } from './games/trainLogic';
import { SORTER } from './games/sorterShapes';
import { PICTURES } from './games/pictures';
import { TRACES } from './games/traceShapes';
import { checkAnswer, checkPrompt } from './quiz/engine';
import { STICKERS } from './stickers';

export const CATEGORY_LABELS: Record<KidCategory, string> = {
  video: 'Видео',
  english: 'Английский',
  math: 'Математика и геометрия',
  chinese: 'Китайский',
  geography: 'География',
  nature: 'Природа',
  music: 'Музыка',
  letters: 'Буквы',
  poems: 'Стихи и сказки',
  books: 'Книжки',
  games: 'Игры',
  other: 'Разное',
};

export const GREETING = 'Привет! Что будем делать?';
export const TODAY_GREETING = 'Привет! Вот твои занятия на сегодня.';
export const LESSON_DONE = 'Молодец, на сегодня этот урок закончен.';
export const FREE_TIME = 'Свободное время! Выбирай, что хочешь.';
export const DAY_OVER = 'На сегодня всё! Ты молодец. До завтра!';
export const CAMERA_ENOUGH = 'На сегодня снимков хватит! Завтра снимем ещё.';
export const PAUSED = 'Сделаем перерыв.';
export const CATEGORY_DONE = 'Молодец, выбирай, что дальше.';
export const COUNT_PROMPT = 'Сколько здесь? Посчитай и нажми цифру.';
export const categoryPhrase = (c: KidCategory) => `${CATEGORY_LABELS[c]}!`;

export const coloringTask = (picture: ColoringPicture, i: number) => {
  const r = PICTURES[picture].regions[i]!;
  return `Раскрась ${r.name} ${paint(r.target).with}.`;
};
export const needColor = (id: Parameters<typeof paint>[0]) => `Нужен ${paint(id).name} цвет.`;

export const tracePrompt = (shape: TraceShape) => `Обведи ${TRACES[shape].name}.`;
/** Ступень «сама» (этап 56): только точка начала и образец рядом. */
export const traceSelfPrompt = (shape: TraceShape) =>
  `Напиши ${TRACES[shape].name} по образцу. Начни с зелёной точки.`;
export const TRACE_HINT = 'Подскажу: веди вот так.';

export const BALLOON_NAMES: Record<BalloonColor, { name: string; plural: string }> = {
  red: { name: 'красный', plural: 'красные' },
  yellow: { name: 'жёлтый', plural: 'жёлтые' },
  blue: { name: 'синий', plural: 'синие' },
  green: { name: 'зелёный', plural: 'зелёные' },
};
export const balloonsPrompt = (target: BalloonColor | null) =>
  target ? `Лопни ${BALLOON_NAMES[target].plural} шарики!` : 'Лопай шарики!';
export const balloonsWrong = (color: BalloonColor, target: BalloonColor) =>
  `Это ${BALLOON_NAMES[color].name}. Ищи ${BALLOON_NAMES[target].plural}!`;
/** Ъ и Ь — знаки (этап 56): голос называет их «мягкий знак», а не «буква Ь». */
const SIGN_NAMES: Record<string, string> = { Ъ: 'твёрдый знак', Ь: 'мягкий знак' };
const SIGN_WITH: Record<string, string> = { Ъ: 'твёрдым знаком', Ь: 'мягким знаком' };
/** Шарики с буквами (этап 56): буква — заглавной, так голос читает её как букву. */
export const balloonLetterPrompt = (find: string, lower: boolean) => {
  const sign = SIGN_WITH[find];
  const what = sign ?? `буквой ${find}`;
  if (!lower) return `Лопни шарики с ${what}!`;
  return `Лопни шарики с ${what} — ${sign ? 'большим и маленьким' : 'большой и маленькой'}!`;
};
export const balloonLetterWrong = (letter: string, find: string) =>
  `Это ${SIGN_NAMES[letter] ?? `буква ${letter}`}. Ищи ${SIGN_NAMES[find] ?? `букву ${find}`}!`;

export const MAZE_PROMPT = 'Веди пальчиком по дорожке до цели!';
export const SHADOWS_PROMPT = 'Найди, чья это тень! Перетащи картинку на тень.';
export const FLASH_PROMPT = 'Темно! Посвети фонариком и найди, кто спрятался.';
export const MOLES_PROMPT = 'Лови зверят, пока не спрятались!';
export const MELODY_LISTEN = 'Послушай колокольчики!';
export const MELODY_AGAIN = 'Послушай ещё раз.';
export const MELODY_YOU = 'Теперь ты!';
export const MELODY_GUIDE = 'Нажимай на колокольчик, который светится!';
export const SORTER_PROMPT = 'Найди каждой фигуре её домик!';
export const SORTER_TURN = 'Поверни фигуру — нажми на неё.';
export const ODD_PROMPT = 'Что здесь лишнее?';
export const PATTERN_PROMPT = 'Что будет дальше?';
export const COMPARE_MORE = 'Где больше?';
export const COMPARE_LESS = 'Где меньше?';
export const MORE_THAN = 'больше, чем';
export const LESS_THAN = 'меньше, чем';
export const PLUS = 'плюс';
export const MINUS = 'минус';
export const WILL_BE = 'будет';
export const HOW_MANY = 'Сколько будет?';
export const SIZE_PROMPT = 'Поставь от маленького к большому!';
export const WORD_PROMPT = 'Собери слово!';

// ─── Музыка ──────────────────────────────────────────────────────────────────

/** Игры «что ты слышишь»: две картинки, у каждой — показ в начале и слово после ответа. */
export const MUSIC_CHOICE = {
  pitch: {
    prompt: 'Кто поёт — птичка или мишка?',
    a: { demo: 'Птичка поёт высоко.', name: 'Высоко!' },
    b: { demo: 'Мишка поёт низко.', name: 'Низко!' },
  },
  loudness: {
    prompt: 'Громко или тихо?',
    a: { demo: 'Слон трубит громко.', name: 'Громко!' },
    b: { demo: 'Мышка пищит тихо.', name: 'Тихо!' },
  },
  tempo: {
    prompt: 'Быстро или медленно?',
    a: { demo: 'Зайчик бежит быстро.', name: 'Быстро!' },
    b: { demo: 'Черепаха ползёт медленно.', name: 'Медленно!' },
  },
  duration: {
    prompt: 'Долгий звук или короткий?',
    a: { demo: 'Паровоз гудит долго.', name: 'Долго!' },
    b: { demo: 'Цыплёнок пищит коротко.', name: 'Коротко!' },
  },
  direction: {
    prompt: 'Куда идёт мелодия — вверх или вниз?',
    a: { demo: 'Мелодия идёт вверх.', name: 'Вверх!' },
    b: { demo: 'Мелодия идёт вниз.', name: 'Вниз!' },
  },
} as const;
export type MusicChoiceKind = keyof typeof MUSIC_CHOICE;
export const LISTEN = 'Послушай!';
export const BEATS_PROMPT = 'Сколько раз ударил барабан?';
export const RHYTHM_LISTEN = 'Послушай барабан!';
export const RHYTHM_YOU = 'Теперь ты! Стучи по барабану.';
export const RHYTHM_AGAIN = 'Почти! Послушай ещё раз.';
export const RHYTHM_EASY = 'Стучи столько раз, сколько огоньков!';
export const PIANO_FREE = 'Играй на пианино! Каждая клавиша — своя нота.';
export const PIANO_EAR = 'Какая это нота? Найди её на клавишах.';
export const STAFF_PROMPT = 'Как зовут эту ноту?';
export const pianoFind = (name: string) => `Найди ноту ${name}!`;
export const thisNote = (name: string) => `Это ${name}.`;
export const songIntro = (title: string) => `Сыграем песенку «${title}»!`;
export const SONG_TAP = 'Нажимай на клавишу, которая светится.';
export const SONG_LISTEN = 'Ура! Послушай, что у тебя получилось!';
export const FREEZE_DANCE = 'Танцуем! Хлопай по зверятам! А когда музыка стихнет — замри!';
export const FREEZE_GO = 'Отомри! Танцуем!';
export const FREEZE_STOP = 'Замри!';
export const FREEZE_MOVED = 'Ой, кто-то пошевелился! Замри!';
export const ORCHESTRA_INTRO = 'Это звериный оркестр! Нажимай на того, кто светится.';
export const orchestraNow = (name: string) => `Теперь играет ${name}!`;
/** Музыканты звериного оркестра — в том же порядке, что и в игре. */
export const PLAYER_NAMES = [
  'мишка с барабаном',
  'зайка с колокольчиком',
  'лягушка с дудочкой',
  'слон с трубой',
  'котик с ксилофоном',
  'птичка со свистком',
];

// ─── Буквы ───────────────────────────────────────────────────────────────────

const low = (s: string) => s.toLowerCase();
export const findLetter = (l: string) =>
  SIGN_NAMES[l] ? `Найди ${SIGN_NAMES[l]}.` : `Найди букву ${l}.`;
export const isLetter = (l: string) => (SIGN_NAMES[l] ? `Это ${SIGN_NAMES[l]}!` : `Буква ${l}!`);
export const findSyllable = (s: string) => `Найди слог ${low(s)}.`;
export const firstLetterAsk = (word: string) => `С какой буквы начинается слово ${low(word)}?`;
export const firstLetterIs = (word: string) => `${low(word)} — на букву ${word[0]}!`;
export const READ_WORD = 'Прочитай слово и найди картинку.';
export const sayWord = (word: string) => `${low(word)}!`;

// Звуки и чтение (этап 49). Звук тянем буквой три раза — «ссс», «ммм»: так его слышно,
// а не название буквы «эс».
const sound = (l: string) => low(l).repeat(3);
const SYLLABLE_NUMS = ['', 'один слог', 'два слога', 'три слога', 'четыре слога'];
export const SYLLABLE_COUNT_INTRO = 'Хлопай на каждый слог и найди, сколько раз хлопнул.';
export const syllablesAsk = (word: string) => `Сколько слогов в слове ${low(word)}? Похлопай!`;
export const syllablesAre = (word: string, n: number) => `${low(word)} — ${SYLLABLE_NUMS[n]}!`;
export const SOUND_PLACE_INTRO = 'Слушай слово. Где звук: в начале, в середине или в конце?';
// Знак ударения (этап 56) нужен проверке слова, голосу — нет.
export const soundAsk = (letter: string, word: string) =>
  `Где звук ${sound(letter)} в слове ${low(unstressed(word))}?`;
const PLACE_NAMES = { start: 'в начале', middle: 'в середине', end: 'в конце' } as const;
export const soundIs = (letter: string, word: string, place: keyof typeof PLACE_NAMES) =>
  `${low(unstressed(word))} — звук ${sound(letter)} ${PLACE_NAMES[place]}!`;
export const WORD_SCHEME_INTRO = 'Красная фишка — гласный звук, синяя — согласный.';
export const schemeAsk = (word: string) => `Найди схему слова ${low(word)}.`;
export const schemeIs = (word: string, chips: readonly ('v' | 'c')[]) =>
  `${low(word)}: ${chips.map((c) => (c === 'v' ? 'гласный' : 'согласный')).join(', ')}!`;
export const PICK_WORD = 'Найди слово к картинке.';
export const READ_PHRASE = 'Прочитай и найди картинку.';

// Счёт: подготовка к школе (этап 49). Ответ закрепляем общими фразами чисел («семь», «семь!»):
// они озвучены у всех, а задание — короткими целыми фразами, чтобы звучало естественно.
export const NUMBER_HOUSE_INTRO = 'В домике два окошка. Вместе они — как число на крыше.';
export const houseRoof = (n: number) => `На крыше — ${NUMBERS[n]}.`;
export const houseWindow = (n: number) => `В окошке — ${NUMBERS[n]}.`;
export const HOUSE_ASK = 'Сколько в пустом окошке?';
export const NEIGHBORS_INTRO = 'Числа стоят по порядку — как когда считаем.';
export const NEIGHBOR_GAP = 'Какое число пропало?';
export const neighborBefore = (n: number) => `Какое число стоит перед числом ${NUMBERS[n]}?`;
export const neighborAfter = (n: number) => `Какое число стоит после числа ${NUMBERS[n]}?`;
export const COMPARE_SIGN_INTRO = 'Знак — как клювик: он всегда открыт к большему числу.';
export const COMPARE_SIGN_ASK = 'Какой знак поставим?';
export const SIGN_EQUAL = 'Числа одинаковые — значит, равно!';
export const WORD_PROBLEM_INTRO = 'Послушай задачу и найди ответ.';

// ─── Счёт и логика (этап 34) ───
const HOURS = [
  'двенадцать часов',
  'час',
  'два часа',
  'три часа',
  'четыре часа',
  'пять часов',
  'шесть часов',
  'семь часов',
  'восемь часов',
  'девять часов',
  'десять часов',
  'одиннадцать часов',
];
const OF_HOUR = [
  'первого',
  'второго',
  'третьего',
  'четвёртого',
  'пятого',
  'шестого',
  'седьмого',
  'восьмого',
  'девятого',
  'десятого',
  'одиннадцатого',
  'двенадцатого',
];
/** «Три часа» или «половина четвёртого» (h — 1…12 на циферблате). */
export const timeName = (h: number, half: boolean) =>
  half ? `половина ${OF_HOUR[h % 12]!}` : HOURS[h % 12]!;
export const clockFind = (h: number, half: boolean) => `Где ${timeName(h, half)}?`;
export const CLOCK_PROMPT = 'Найди часы, которые я называю.';

/** «Это стоит пять монеток». */
export const coinsWord = (n: number) =>
  n === 1
    ? 'одну монетку'
    : n === 2
      ? 'две монетки'
      : n === 3
        ? 'три монетки'
        : n === 4
          ? 'четыре монетки'
          : `${NUMBERS[n]} монеток`;
export const shopPrice = (n: number) => `Это стоит ${coinsWord(n)}. Положи монетки.`;
export const SHOP_PROMPT = 'Купи покупку — положи столько монеток, сколько на ценнике.';
export const SHOP_TOO_MUCH = 'Ой, многовато! Давай ещё раз.';
export const SHOP_BUY = 'Покупаем!';

// Этап 39: после верного ответа — сам ответ и почему (закрепить).
export const countAnswer = (n: number) => `Здесь ${NUMBERS[n]}!`;
export const clockAnswer = (h: number, half: boolean) => [
  `Сейчас ${timeName(h, half)}.`,
  half
    ? 'Большая стрелка внизу — значит, половина.'
    : `Большая стрелка наверху, маленькая показывает ${NUMBERS[h]}.`,
];
export const shopAnswer = (n: number) => `Положили ровно ${coinsWord(n)}!`;
export const SORTER_DONE = 'Все фигуры в своих домиках!';
export const SHADOWS_DONE = 'Каждая картинка нашла свою тень!';
export const SIZE_DONE = 'Вот так: от маленького к большому!';
export const PATTERN_DONE = 'Картинки повторяются по порядку!';

export const ROBOT_PROMPT =
  'Помоги совёнку дойти до звёздочки! Нажимай стрелки, потом — «Поехали».';
export const ROBOT_MISS = 'Не дошли. Попробуй другой путь!';
export const ROBOT_ROCK = 'Ой, камень! Обойди его.';

// ─── Этап 36: игры посложнее ───
export const SPACE_PROMPT = 'Облети планеты по порядку! Нажимай на них по очереди.';
/** Первая планета: «Начни с цифры один!» / «Начни с буквы А!». */
export const spaceStart = (v: string, letters: boolean) =>
  letters ? `Начни с буквы ${v}!` : `Начни с цифры ${v}!`;
export const SPACE_BACK = 'А теперь — с конца!';
export const SPACE_BY_TWO = 'Считай через одну: два, четыре, шесть!';

export const FISHING_PROMPT = 'Веди крючок пальчиком и отпусти у нужной рыбки.';
export const fishingFind = (v: string, letter: boolean) =>
  letter ? `Поймай рыбку с буквой ${v}!` : `Поймай рыбку с цифрой ${v}!`;
export const FISHING_SUM = 'Поймай рыбку с ответом!';

export const FLIGHT_PROMPT =
  'Держи пальчик — совёнок летит вверх, отпусти — вниз. Собирай звёздочки!';
export const FLIGHT_CLOUD = 'Ой, тучка! Облетай тучки.';

export const BUILDER_PROMPT = 'Построй такую же башню! Ставь детали снизу вверх.';
export const BUILDER_REMEMBER = 'Запомни башню — сейчас она спрячется!';
/** Названия деталей — звучат, когда деталь встала на место. */
export const BLOCK_NAMES: Record<BuilderBlock, string> = {
  cube: 'Красный кубик!',
  bar: 'Синий брусок!',
  roof: 'Жёлтая крыша!',
  arch: 'Зелёная арка!',
  drum: 'Фиолетовый цилиндр!',
};

// ─── Этап 41: чтение и логика ───
export const SYLLABLE_WORD_PROMPT = 'Собери слово из слогов!';
/** Лишние слоги «Слова из слогов» — простые, их легко прочитать. */
export const EXTRA_SYLLABLES = [
  'МА',
  'ПА',
  'ЛУ',
  'КО',
  'РЫ',
  'СИ',
  'НО',
  'ДЕ',
  'ТУ',
  'ВА',
  'ЗИ',
  'БО',
];
/** «МА-ШИ-НА» → «машина!». */
export const syllableWhole = (word: string) => sayWord(word.replace(/-/g, ''));

export const RIDDLE_PROMPT = 'Послушай загадку и найди отгадку!';
export const riddleAnswer = (name: string) => `Это ${name}!`;

export const SUDOKU_PROMPT =
  'Заполни пустые клеточки! В каждой строчке и в каждом столбике — все картинки по одному разу.';
export const SUDOKU_ROW = 'В этой строчке такая картинка уже есть!';
export const SUDOKU_COL = 'В этом столбике такая картинка уже есть!';
export const SUDOKU_DONE = 'Получилось! В каждой строчке и в каждом столбике все картинки по разу.';

export const DOTS_PROMPT = 'Соедини точки по порядку: один, два, три… Что получится?';
export const TANGRAM_PROMPT = 'Собери фигуру! Перетащи детали на свои места.';
export const COLOR_NUMBERS_PROMPT =
  'Раскрась по цифрам! Возьми краску с цифрой и нажми, где такая же цифра.';
export const COLOR_NUMBERS_DONE = 'Какая красивая картинка получилась!';
/** Не та краска: «Здесь цифра три. Возьми краску с цифрой три!» */
export const colorNumberWrong = (n: number) =>
  `Здесь цифра ${NUMBERS[n]}. Возьми краску с цифрой ${NUMBERS[n]}!`;
/** Что получилось в «Соедини точки» и «Танграме». */
export const DOT_NAMES: Record<DotPicture, string> = {
  star: 'звёздочка',
  house: 'домик',
  fish: 'рыбка',
  heart: 'сердечко',
  boat: 'кораблик',
  fir: 'ёлочка',
  rocket: 'ракета',
};
export const TANGRAM_NAMES: Record<TangramFigure, string> = {
  house: 'домик',
  tree: 'ёлочка',
  rocket: 'ракета',
  car: 'машинка',
  boat: 'кораблик',
  snowman: 'снеговик',
  fish: 'рыбка',
  castle: 'замок',
};
export const itIs = (name: string) => `Это ${name}!`;

// ─── Этап 43: зрелищные игры ───
export const DIVE_PROMPT = 'Веди батискаф пальчиком и лови рыбок!';
export const DIVE_JELLY = 'Ой, медуза! Проплывай мимо медуз.';
export const DIVE_DONE = 'Ура, сундук с жемчугом!';
/** Цвет рыбки: «одну красную», «две красные», «пять красных», «это красная». */
const FISH_COLOR: Record<DiveFish, [one: string, few: string, many: string, is: string]> = {
  red: ['красную', 'красные', 'красных', 'красная'],
  yellow: ['жёлтую', 'жёлтые', 'жёлтых', 'жёлтая'],
  blue: ['синюю', 'синие', 'синих', 'синяя'],
  green: ['зелёную', 'зелёные', 'зелёных', 'зелёная'],
  purple: ['фиолетовую', 'фиолетовые', 'фиолетовых', 'фиолетовая'],
  orange: ['оранжевую', 'оранжевые', 'оранжевых', 'оранжевая'],
};
/** Самое большее рыбок одного цвета за задание. */
export const DIVE_MAX_COUNT = 5;
const COUNT_WORD = ['', 'одну', 'две', 'три', 'четыре', 'пять'];
/** «Поймай три жёлтые рыбки!» */
export const diveCatch = (color: DiveFish, count: number) => {
  const [one, few, many] = FISH_COLOR[color];
  const words = count === 1 ? [one, 'рыбку'] : count < 5 ? [few, 'рыбки'] : [many, 'рыбок'];
  return `Поймай ${COUNT_WORD[count]} ${words.join(' ')}!`;
};
export const diveNumber = (n: number) => `Поймай рыбку с цифрой ${NUMBERS[n]}!`;
/** Не та рыбка — что поймали (потом звучит задание ещё раз). */
export const diveIsColor = (color: DiveFish) => `Это ${FISH_COLOR[color][3]} рыбка.`;
export const diveIsNumber = (n: number) => `Это цифра ${NUMBERS[n]}.`;
/** Все фразы «Подводного плавания» — уровни меняют цифры и смешивают задания. */
export const divePhrases = () => [
  DIVE_PROMPT,
  DIVE_JELLY,
  DIVE_DONE,
  ...DIVE_FISH.flatMap((c) => [
    diveIsColor(c),
    ...Array.from({ length: DIVE_MAX_COUNT }, (_, i) => diveCatch(c, i + 1)),
  ]),
  ...NUMBERS.slice(1, 11).flatMap((_, i) => [diveNumber(i + 1), diveIsNumber(i + 1)]),
];

export const ROCKET_PROMPT = 'Собери ракету как на чертеже! Перетаскивай детали на ракету.';
export const ROCKET_REMEMBER = 'Запомни ракету — сейчас чертёж спрячется!';
export const ROCKET_BUILT = 'Ракета готова!';
export const ROCKET_COUNTDOWN = 'Три! Два! Один! Пуск!';
export const ROCKET_ROCK = 'Ой, камень! Облетай камни.';
export const ROCKET_LANDED = 'Посадка! Мы на планете!';
/** Деталь с цветом на чертеже: «Нужен синий корпус.», «Нужны зелёные крылья.» */
const PART_NAME: Record<Exclude<RocketPart, 'window'>, [name: string, plural: boolean]> = {
  body: ['корпус', false],
  fins: ['крылья', true],
  nose: ['нос', false],
  engine: ['двигатель', false],
};
const ROCKET_COLOR: Record<RocketColor, [one: string, many: string]> = {
  red: ['красный', 'красные'],
  blue: ['синий', 'синие'],
  yellow: ['жёлтый', 'жёлтые'],
  green: ['зелёный', 'зелёные'],
  purple: ['фиолетовый', 'фиолетовые'],
};
export const rocketWrongColor = (part: Exclude<RocketPart, 'window'>, color: RocketColor) => {
  const [name, plural] = PART_NAME[part];
  return `${plural ? 'Нужны' : 'Нужен'} ${ROCKET_COLOR[color][plural ? 1 : 0]} ${name}.`;
};
export const rocketToNumber = (n: number) => `Лети на планету с цифрой ${NUMBERS[n]}!`;
export const rocketToLetter = (l: string) => `Лети на планету с буквой ${l}!`;
export const rocketToSum = (a: number, b: number) =>
  `Сколько будет ${NUMBERS[a]} плюс ${NUMBERS[b]}? Лети на планету с ответом!`;
/** Не та планета: «Здесь три.» / «Здесь буква М.» */
export const rocketIsNumber = (n: number) => `Здесь ${NUMBERS[n]}.`;
export const rocketIsLetter = (l: string) => `Здесь буква ${l}.`;
/** Все фразы «Ракеты» для вида заданий — уровни меняют число деталей и ответы до 10. */
export const rocketPhrases = (quiz: 'numbers' | 'sums' | 'letters') => {
  const tasks =
    quiz === 'letters'
      ? FISHING_LETTERS.flatMap((l) => [rocketToLetter(l), rocketIsLetter(l)])
      : [
          ...(quiz === 'numbers'
            ? NUMBERS.slice(1, 11).map((_, i) => rocketToNumber(i + 1))
            : Array.from({ length: 9 }, (_, a) =>
                Array.from({ length: 9 - a }, (_, b) => rocketToSum(a + 1, b + 1)),
              ).flat()),
          ...NUMBERS.slice(1, 11).map((_, i) => rocketIsNumber(i + 1)),
        ];
  return [
    ROCKET_PROMPT,
    ROCKET_REMEMBER,
    ROCKET_BUILT,
    ROCKET_COUNTDOWN,
    ROCKET_ROCK,
    ROCKET_LANDED,
    ...(['body', 'fins', 'nose', 'engine'] as const).flatMap((p) =>
      ROCKET_COLORS.map((c) => rocketWrongColor(p, c)),
    ),
    ...tasks,
  ];
};

// ─── «Гонки» (этап 43) ───
export const RACE_PROMPT = 'Гонка! Веди машинку пальцем и проезжай в нужные ворота.';
export const RACE_START = 'На старт! Внимание! Марш!';
export const RACE_CONE = 'Ой, конус! Объезжай конусы.';
export const RACE_FINISH = 'Финиш! Мы первые!';
/** Ворота «в … ворота»: множественное число. */
const RACE_COLOR: Record<RaceColor, string> = {
  red: 'красные',
  yellow: 'жёлтые',
  blue: 'синие',
  green: 'зелёные',
  purple: 'фиолетовые',
  orange: 'оранжевые',
};
export const raceToColor = (c: RaceColor) => `Проезжай в ${RACE_COLOR[c]} ворота!`;
export const raceToNumber = (n: number) => `Проезжай в ворота с цифрой ${NUMBERS[n]}!`;
export const raceToLetter = (l: string) => `Проезжай в ворота с буквой ${l}!`;
/** Не те ворота: «Это синие ворота.» / «Это цифра четыре.» / «Это буква К.» */
export const raceIsColor = (c: RaceColor) => `Это ${RACE_COLOR[c]} ворота.`;
export const raceIsNumber = (n: number) => `Это цифра ${NUMBERS[n]}.`;
export const raceIsLetter = (l: string) => `Это буква ${l}.`;
/** Все фразы «Гонок» для вида заданий — уровни меняют ответы до 10. */
export const racePhrases = (quiz: 'colors' | 'numbers' | 'letters') => [
  RACE_PROMPT,
  RACE_START,
  RACE_CONE,
  RACE_FINISH,
  ...(quiz === 'colors'
    ? RACE_COLORS.flatMap((c) => [raceToColor(c), raceIsColor(c)])
    : quiz === 'letters'
      ? FISHING_LETTERS.flatMap((l) => [raceToLetter(l), raceIsLetter(l)])
      : NUMBERS.slice(1, 11).flatMap((_, i) => [raceToNumber(i + 1), raceIsNumber(i + 1)])),
];

// ─── «Найди отличия» (этап 43) ───
export const DIFF_PROMPT = 'Найди отличия! Картинки почти одинаковые. Нажми, где по-другому.';
export const DIFF_NEXT = 'Все отличия нашли! Вот новая картинка.';
export const DIFF_SAME = 'Здесь одинаково. Ищи ещё!';
export const DIFF_HINT = 'Посмотри сюда, где лупа!';
/** Что нашли — по виду отличия. */
export const DIFF_FOUND = {
  gone: 'Здесь чего-то не хватает!',
  color: 'Другой цвет!',
  swap: 'Здесь другая картинка!',
  flip: 'Смотрит в другую сторону!',
  big: 'Здесь больше!',
} as const;
const LEFT = [
  '',
  'одно отличие',
  'два отличия',
  'три отличия',
  'четыре отличия',
  'пять отличий',
  'шесть отличий',
];
/** «Осталось два отличия.» */
export const diffLeft = (n: number) => `Осталось ${LEFT[n]}.`;
export const diffPhrases = () => [
  DIFF_PROMPT,
  DIFF_NEXT,
  DIFF_SAME,
  DIFF_HINT,
  ...Object.values(DIFF_FOUND),
  ...LEFT.slice(1).map((_, i) => diffLeft(i + 1)),
];

// ─── «Смешай краски» (этап 57) ───
export const PAINTS_PROMPT = 'Смешай краски! Нажимай на тюбики — краска капнет в баночку.';
export const PAINTS_OTHER = 'Ой, получился совсем другой цвет!';
/** Цвет: какой (м. и ж. род), какую краску, какой краски добавить. */
const PAINT_WORD: Record<PaintTarget | PaintTube, readonly [string, string, string, string]> = {
  red: ['красный', 'красная', 'красную', 'красной'],
  yellow: ['жёлтый', 'жёлтая', 'жёлтую', 'жёлтой'],
  blue: ['синий', 'синяя', 'синюю', 'синей'],
  white: ['белый', 'белая', 'белую', 'белой'],
  orange: ['оранжевый', 'оранжевая', 'оранжевую', 'оранжевой'],
  green: ['зелёный', 'зелёная', 'зелёную', 'зелёной'],
  purple: ['фиолетовый', 'фиолетовая', 'фиолетовую', 'фиолетовой'],
  pink: ['розовый', 'розовая', 'розовую', 'розовой'],
  lightblue: ['голубой', 'голубая', 'голубую', 'голубой'],
  brown: ['коричневый', 'коричневая', 'коричневую', 'коричневой'],
};
const capital = (w: string) => w[0]!.toUpperCase() + w.slice(1);
const listOf = (ws: string[]) =>
  ws.length > 1 ? `${ws.slice(0, -1).join(', ')} и ${ws.at(-1)}` : (ws[0] ?? '');
/** «Тыква оранжевая. Сделай оранжевую краску!» */
export const paintsTask = (o: { name: string; fem: boolean }, t: PaintTarget) =>
  `${o.name} ${PAINT_WORD[t][o.fem ? 1 : 0]}. Сделай ${PAINT_WORD[t][2]} краску!`;
/** «Смешай красную и жёлтую!» */
export const paintsRecipe = (t: PaintTarget) =>
  `Смешай ${listOf(PAINT_RECIPES[t].map((c) => PAINT_WORD[c][2]))}!`;
/** «Что получится, если смешать красную и жёлтую?» */
export const paintsGuess = (t: PaintTarget) =>
  `Что получится, если смешать ${listOf(PAINT_RECIPES[t].map((c) => PAINT_WORD[c][2]))}?`;
export const paintsYes = (t: PaintTarget) =>
  `Правильно, ${PAINT_WORD[t][1]}! Проверим — капай краски.`;
/** Первая капля: «Красная!» */
export const paintsIs = (c: PaintTube) => `${capital(PAINT_WORD[c][1])}!`;
export const paintsGot = (t: PaintTarget) => `Получилась ${PAINT_WORD[t][1]}!`;
export const paintsNeed = (t: PaintTarget) =>
  `А нужна ${PAINT_WORD[t][1]}. Выльем и попробуем ещё!`;
export const paintsMore = (c: PaintTube) => `Добавь ${PAINT_WORD[c][3]}!`;
export const paintsOver = (c: PaintTube) =>
  `Ой, много ${PAINT_WORD[c][3]}! Выльем и попробуем ещё.`;
/** Название цвета для «Что получится?» — на кнопке. */
export const paintName = (c: PaintTarget | PaintTube) => PAINT_WORD[c][1];
export function paintsPhrases(spec: SpecOf<'paints'>) {
  return [
    PAINTS_PROMPT,
    PAINTS_OTHER,
    ...spec.colors.flatMap((t) => [
      ...PAINT_OBJECTS[t].map((o) => paintsTask(o, t)),
      paintsRecipe(t),
      paintsNeed(t),
      ...(spec.guess ? [paintsGuess(t), paintsYes(t)] : []),
    ]),
    ...PAINT_TARGETS.map(paintsGot),
    ...PAINT_TUBES.flatMap((c) => [paintsIs(c), paintsMore(c), paintsOver(c)]),
  ];
}

// ─── «Поезд» (этап 57) ───
export const TRAIN_PROMPT =
  'Поезд приехал! Посади зверят в вагоны: у вагона такой же номер, как на билете.';
export const TRAIN_NEXT = 'Новая станция! Кто поедет дальше?';
export const TRAIN_LOST = 'Ой, один вагон потерялся! Найди его на запасном пути.';
export const TRAIN_WHICH = 'А какой вагон дальше?';
export const TRAIN_GO = 'Ту-ту! Поехали!';
export const TRAIN_END = 'Приехали! Все зверята довольны.';
export const trainTicket = (n: number) => `На билете — ${NUMBERS[n]}.`;
export const trainWagon = (n: number) => `Это вагон ${NUMBERS[n]}.`;
export const trainFind = (n: number) => `Найди вагон ${NUMBERS[n]}!`;
/** Счёт вагонов до потерявшегося: «Один!», «Два!» */
export const trainCount = (n: number) => `${NUMBERS[n]![0]!.toUpperCase()}${NUMBERS[n]!.slice(1)}!`;
export function trainPhrases(spec: SpecOf<'train'>) {
  const top = topOf(spec);
  const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const tickets = spec.task !== 'missing';
  const missing = spec.task !== 'tickets';
  return [
    TRAIN_GO,
    TRAIN_END,
    ...(tickets
      ? [TRAIN_PROMPT, TRAIN_NEXT, ...upTo(top).flatMap((n) => [trainTicket(n), trainFind(n)])]
      : []),
    ...(missing ? [TRAIN_LOST, TRAIN_WHICH, ...upTo(top).map(trainCount)] : []),
    // На запасном пути бывают вагоны и с номерами больше самого большого.
    ...upTo(missing ? 10 : top).map(trainWagon),
  ];
}

// ─── «Весы» (этап 57) ───
export const SCALES_COMPARE = 'Какая чаша тяжелее? Нажми на неё — и весы покажут!';
export const SCALES_COMPARE_AGAIN = 'А здесь какая чаша тяжелее?';
export const SCALES_COUNT = 'Посчитай: где больше — та чаша и тяжелее.';
export const SCALES_NUMBERS = 'Посмотри на числа: где больше — та чаша и тяжелее.';
export const SCALES_OVER = 'Ой, перевесило! Уберём лишнее.';
export const SCALES_LIGHT = 'Легковато! Нужно тяжелее.';
export const SCALES_HEAVY = 'Тяжеловато! Нужно полегче.';
export const SCALES_EVEN = 'Поровну!';
export const SCALES_END = 'Всё взвесили! Спасибо, помощник!';
type ScalesLook = SpecOf<'scales'>['look'];
export const scalesBalance = (look: ScalesLook) =>
  `Уравновесь весы! Клади ${look === 'cubes' ? 'кубики' : 'гирьки'} на пустую чашу, пока стрелка не встанет посередине.`;
export const SCALES_BALANCE_AGAIN = 'Уравновесь ещё раз!';
export const scalesSum = (look: ScalesLook) =>
  `Поставь на пустую чашу ${look === 'cubes' ? 'одну башенку' : 'одну гирю'} — чтобы стало поровну!`;
export const scalesSumAgain = (look: ScalesLook) =>
  look === 'cubes' ? 'Какую башенку поставим?' : 'Какую гирю поставим?';
export function scalesPhrases(spec: SpecOf<'scales'>) {
  const has = (t: SpecOf<'scales'>['tasks'][number]) => spec.tasks.includes(t);
  return [
    SCALES_END,
    SCALES_EVEN,
    ...(has('compare')
      ? [
          SCALES_COMPARE,
          SCALES_COMPARE_AGAIN,
          spec.look === 'digits' ? SCALES_NUMBERS : SCALES_COUNT,
          MORE_THAN,
        ]
      : []),
    ...(has('balance') ? [scalesBalance(spec.look), SCALES_BALANCE_AGAIN, SCALES_OVER] : []),
    ...(has('sum')
      ? [scalesSum(spec.look), scalesSumAgain(spec.look), SCALES_LIGHT, SCALES_HEAVY, PLUS, WILL_BE]
      : []),
  ];
}

// ─── «Шестерёнки» (этап 57) ───
type GearsMachine = 'mill' | 'wheel' | 'pinwheel';
const GEARS_MACHINES: GearsMachine[] = ['mill', 'wheel', 'pinwheel'];
const GEARS_BROKEN: Record<GearsMachine, string> = {
  mill: 'Мельница не крутится!',
  wheel: 'Колесо обозрения не едет!',
  pinwheel: 'Вертушка не крутится!',
};
const GEARS_WORKS: Record<GearsMachine, string> = {
  mill: 'Мельница закрутилась!',
  wheel: 'Колесо обозрения поехало!',
  pinwheel: 'Вертушка закрутилась!',
};
const GEARS_WHICH: Record<GearsMachine, string> = {
  mill: 'закрутится мельница',
  wheel: 'поедет колесо',
  pinwheel: 'закрутится вертушка',
};
export const gearsBuild = (m: GearsMachine) =>
  `${GEARS_BROKEN[m]} Поставь шестерёнки на пустые места — чтобы зубчики сцепились.`;
export const gearsBuildAgain = (m: GearsMachine) => `${GEARS_BROKEN[m]} Поставь шестерёнки!`;
/** Машина заработала. */
export const gearsWorks = (m: GearsMachine) => GEARS_WORKS[m];
export const gearsWhich = (m: GearsMachine) =>
  `Ручку крутят по стрелке. А в какую сторону ${GEARS_WHICH[m]}? Нажми на стрелку!`;
export const gearsWhichAgain = (m: GearsMachine) => `А здесь в какую сторону ${GEARS_WHICH[m]}?`;
export const GEARS_BIG = 'Великовата! Не помещается.';
export const GEARS_SMALL = 'Маловата! Не достаёт до соседок.';
export const GEARS_TURN = 'Готово! Покрути ручку!';
export const GEARS_GAP = 'Не дотягивается! Поставь шестерёнку на пустое место.';
export const GEARS_RIGHT = 'Соседние шестерёнки крутятся в разные стороны.';
export const GEARS_LOOK = 'Посмотри: каждая шестерёнка крутит соседку в обратную сторону!';
/** Куда закрутилась машина: 1 — по часовой стрелке. */
export const gearsDir = (dir: 1 | -1) =>
  dir === 1 ? 'По часовой стрелке!' : 'Против часовой стрелки!';
export const GEARS_END = 'Все машины работают! Ты настоящий механик!';
export function gearsPhrases(spec: SpecOf<'gears'>) {
  const build = spec.tasks.includes('build');
  const direction = spec.tasks.includes('direction');
  return [
    GEARS_END,
    ...(build
      ? [
          ...GEARS_MACHINES.flatMap((m) => [gearsBuild(m), gearsBuildAgain(m), gearsWorks(m)]),
          GEARS_TURN,
          GEARS_GAP,
          ...(spec.sizes ? [GEARS_BIG, GEARS_SMALL] : []),
        ]
      : []),
    ...(direction
      ? [
          ...GEARS_MACHINES.flatMap((m) => [gearsWhich(m), gearsWhichAgain(m)]),
          gearsDir(1),
          gearsDir(-1),
          GEARS_RIGHT,
          GEARS_LOOK,
        ]
      : []),
  ];
}

// ─── «Одень мишку» (этап 58) ───
const DRESS_OUTSIDE: Record<DressWeather, string> = {
  rain: 'На улице дождик!',
  snow: 'На улице снег!',
  sun: 'На улице солнышко и жара!',
  wind: 'На улице сильный ветер!',
};
const DRESS_COUNT = ['', 'одна вещь', 'две вещи', 'три вещи', 'четыре вещи'];
/** Задание «Одень»: сколько вещей нужно. */
export const dressTask = (w: DressWeather, n: number) =>
  n === 1
    ? `${DRESS_OUTSIDE[w]} Что нужно мишке на прогулку?`
    : `${DRESS_OUTSIDE[w]} Одень мишку на прогулку! Нужны ${DRESS_COUNT[n]}.`;
export const DRESS_MORE = 'Что ещё?';
/** Задание «Что не так?». */
export const dressOdd = (w: DressWeather) => `${DRESS_OUTSIDE[w]} Мишка оделся сам. Что не так?`;
export const DRESS_INSTEAD = 'Что надеть вместо?';
export const DRESS_FITS = 'Это подходит! Найди, что не так.';
/** Мишка одет. */
export const DRESS_DONE: Record<DressWeather, string> = {
  rain: 'Теперь мишка не промокнет!',
  snow: 'Теперь мишке тепло!',
  sun: 'Теперь мишке не жарко!',
  wind: 'Теперь ветер не страшен!',
};
/** Почему вещь подходит — после похвалы. */
export const DRESS_GOOD: Record<DressWeather, Partial<Record<ItemId, string>>> = {
  rain: {
    umbrella: 'Зонтик — от дождя!',
    boots: 'Сапожки — по лужам!',
    raincoat: 'Дождевик не промокнет!',
  },
  snow: {
    hat: 'Шапка — чтобы ушки не замёрзли!',
    furcoat: 'Шуба тёплая!',
    mittens: 'Варежки греют лапки!',
    valenki: 'Валенки — по снегу!',
  },
  sun: {
    panama: 'Панамка — от солнышка!',
    glasses: 'Очки — от яркого солнца!',
    tshirt: 'В футболке не жарко!',
    sandals: 'Сандалики — по песочку!',
  },
  wind: {
    scarf: 'Шарф — от ветра!',
    jacket: 'Куртка — от ветра!',
    hat: 'Шапка — чтобы ушки не продуло!',
    shoes: 'Ботинки — по дорожке!',
  },
};
/** Почему вещь не годится — после «попробуй ещё». */
export const DRESS_WHY: Record<DressWeather, Partial<Record<ItemId, string>>> = {
  rain: {
    panama: 'Панамка промокнет!',
    hat: 'Шапка промокнет!',
    tshirt: 'В футболке мишка промокнет!',
    furcoat: 'Шуба промокнет!',
    sandals: 'В сандаликах ноги промокнут!',
    valenki: 'Валенки промокнут!',
    shoes: 'Ботинки промокнут!',
    glasses: 'Очки от дождя не спасут!',
    mittens: 'Варежки промокнут!',
  },
  snow: {
    panama: 'В панамке холодно!',
    tshirt: 'В футболке холодно!',
    raincoat: 'В дождевике холодно!',
    sandals: 'В сандаликах холодно!',
    boots: 'В резиновых сапогах холодно!',
    shoes: 'В ботинках по снегу холодно!',
    umbrella: 'Зонтик не нужен — это снег, а не дождь!',
  },
  sun: {
    hat: 'В шапке жарко!',
    raincoat: 'В дождевике жарко!',
    furcoat: 'В шубе жарко!',
    jacket: 'В куртке жарко!',
    boots: 'В сапогах жарко!',
    valenki: 'В валенках жарко!',
    shoes: 'В ботинках жарко!',
    umbrella: 'Зонтик не нужен — дождя нет!',
    mittens: 'В варежках жарко!',
    scarf: 'В шарфе жарко!',
  },
  wind: {
    panama: 'Панамку унесёт ветром!',
    tshirt: 'В футболке холодно!',
    sandals: 'В сандаликах холодно!',
    umbrella: 'Зонтик сломает ветром!',
  },
};
export const dressGood = (w: DressWeather, id: ItemId) => DRESS_GOOD[w][id] ?? '';
export const dressWhy = (w: DressWeather, id: ItemId) => DRESS_WHY[w][id] ?? '';
export const DRESS_END = 'Мишка оделся и идёт гулять! Спасибо за помощь!';
export function dressPhrases(spec: SpecOf<'dress'>) {
  const odd = spec.tasks.includes('odd');
  const dress = spec.tasks.includes('dress');
  const fixable = (w: DressWeather) =>
    OUTFITS[w].filter((id) => ['head', 'body', 'feet'].includes(SLOT[id]));
  return [
    DRESS_END,
    ...spec.weathers.flatMap((w) => [
      DRESS_DONE[w],
      ...WRONG_IN[w].map((id) => dressWhy(w, id)),
      ...(dress
        ? [dressTask(w, needCount(w, spec.items)), ...OUTFITS[w].map((id) => dressGood(w, id))]
        : []),
      ...(odd ? [dressOdd(w), ...fixable(w).map((id) => dressGood(w, id))] : []),
    ]),
    ...(dress && spec.items > 1 ? [DRESS_MORE] : []),
    ...(odd ? [DRESS_INSTEAD, DRESS_FITS] : []),
  ].filter((t, i, all) => all.indexOf(t) === i);
}

// ─── «Сложи фигуру» (этап 58) ───
const FIGURE_BUILD: Record<FigureShape, string> = {
  house: 'Собери домик!',
  fish: 'Собери рыбку!',
  cat: 'Собери кошку!',
  boat: 'Собери кораблик!',
};
/** Задание: какую фигуру собрать; с поворотами — как повернуть детальку. */
export const figureTask = (f: FigureShape, turn: boolean) =>
  `${FIGURE_BUILD[f]} Перетащи детальки на свои места.${turn ? ' Нажми на детальку — она повернётся.' : ''}`;
export const FIGURE_TURN = 'Почти! Поверни детальку: нажми на неё.';
export const FIGURE_NOT_HERE = 'Эта деталька не отсюда. Найди, где её место!';
/** Фигура собрана — и ожила. */
export const FIGURE_DONE: Record<FigureShape, string> = {
  house: 'Получился домик! В окошке зажёгся свет.',
  fish: 'Получилась рыбка! Плыви, рыбка!',
  cat: 'Получилась кошка! Мяу!',
  boat: 'Получился кораблик! Счастливого плавания!',
};
export const FIGURE_END = 'Все фигуры собраны! Ты настоящий мастер!';
export function figurePhrases(spec: SpecOf<'figure'>) {
  return [
    FIGURE_END,
    FIGURE_NOT_HERE,
    ...(spec.turn ? [FIGURE_TURN] : []),
    ...spec.figures.flatMap((f) => [figureTask(f, spec.turn), FIGURE_DONE[f]]),
  ];
}

// ─── «Робот и батарейка» (этап 58) ───
export const BOT_GO =
  'Помоги роботу доехать до батарейки! Нажимай на стрелки, потом — на зелёную кнопку «Пуск».';
export const BOT_FIX_INTRO = 'Робот сам составил программу, но в ней ошибка. Смотри!';
export const BOT_FIX_FIND = 'Найди неправильную стрелку и нажми на неё.';
export const BOT_BUMP = 'Ой! Робот упёрся. Поправь программу!';
export const BOT_SHORT = 'Робот не доехал до батарейки. Поправь программу!';
export const BOT_RIGHT_ARROW = 'Эта стрелка правильная. Ищи другую!';
export const BOT_WHICH = 'Какая стрелка нужна здесь?';
export const BOT_EMPTY = 'Сначала нажми на стрелки!';
export const BOT_FIND_FIRST = 'Сначала найди неправильную стрелку и нажми на неё.';
export const BOT_FULL = 'Места больше нет. Нажми на стрелку в ленте — она уберётся.';
export const BOT_WIN = 'Робот доехал и зарядился!';
export const BOT_END = 'Все батарейки собраны! Ты настоящий программист!';
export function botPhrases(spec: SpecOf<'bot'>) {
  return [
    BOT_BUMP,
    BOT_SHORT,
    BOT_WIN,
    BOT_END,
    ...(spec.tasks.includes('go') ? [BOT_GO, BOT_EMPTY, BOT_FULL] : []),
    ...(spec.tasks.includes('fix')
      ? [BOT_FIX_INTRO, BOT_FIX_FIND, BOT_RIGHT_ARROW, BOT_WHICH, BOT_FIND_FIRST]
      : []),
  ];
}

// ─── «Часы с кукушкой» (этап 58) ───
export const CUCKOO_GO = 'Это часы с кукушкой! Ответишь правильно — кукушка выглянет.';
export const CUCKOO_READ = 'Который час?';
export const CUCKOO_READ_INTRO =
  'Который час? Посмотри на маленькую стрелку и нажми на число, куда она показывает.';
export const CUCKOO_BIG_HAND = 'Большая стрелка показывает минуты. Смотри на маленькую стрелку!';
export const CUCKOO_LOOK = 'Посмотри, куда показывает маленькая стрелка.';
export const CUCKOO_SET_INTRO = 'Двигай пальцем маленькую стрелку.';
export const CUCKOO_SET_HALF_INTRO =
  'Маленькая стрелка показывает часы, большая — минуты. Двигай их пальцем.';
/** «Покажи три часа!», «Покажи половину четвёртого!» */
export const cuckooShow = (t: Time) =>
  `Покажи ${t.m ? `половину ${OF_HOUR[t.h % 12]!}` : HOURS[t.h % 12]!}!`;
export const CUCKOO_NOW_BIG = 'А теперь большую стрелку!';
export const CUCKOO_NOW_SMALL = 'А теперь маленькую стрелку!';
export const CUCKOO_HALF_HINT = 'Половина — большая стрелка внизу, на шести.';
export const CUCKOO_WHOLE_HINT = 'Ровно — большая стрелка наверху, на двенадцати.';
export const CUCKOO_DAY_INTRO = 'Это день мишки. Помоги ему — покажи время на часах!';
/** Режим дня: что делает мишка и что скажем, когда часы покажут это время. */
export const CUCKOO_DAY: Record<DayId, readonly [string, string]> = {
  wake: ['В семь часов утра мишка просыпается.', 'Доброе утро!'],
  exercise: ['В половине восьмого мишка делает зарядку.', 'Раз-два, раз-два! Зарядка!'],
  breakfast: ['В восемь часов утра мишка завтракает.', 'Приятного аппетита!'],
  walk: ['В одиннадцать часов мишка идёт гулять.', 'Гулять — здорово!'],
  lunch: ['В час дня мишка обедает.', 'Вкусный суп!'],
  draw: ['В половине пятого мишка рисует.', 'Какой красивый цветок!'],
  bath: ['В восемь часов вечера мишка купается.', 'Чистый мишка!'],
  teeth: ['В половине девятого мишка чистит зубы.', 'Зубки чистые!'],
  sleep: ['В девять часов вечера мишка ложится спать.', 'Спокойной ночи, мишка!'],
};
export const CUCKOO_END = 'Ку-ку! Теперь ты знаешь, который час!';
export function cuckooPhrases(spec: SpecOf<'cuckoo'>) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const times: Time[] = hours.flatMap((h) => [
    { h, m: 0 as const },
    ...(spec.half ? [{ h, m: 30 as const }] : []),
  ]);
  const show = spec.tasks.includes('set') || spec.tasks.includes('day');
  return [
    CUCKOO_GO,
    CUCKOO_END,
    ...times.flatMap((t) => clockAnswer(t.h, t.m === 30)),
    ...(spec.tasks.includes('read')
      ? [CUCKOO_READ, CUCKOO_READ_INTRO, CUCKOO_BIG_HAND, CUCKOO_LOOK]
      : []),
    ...(show ? [CUCKOO_SET_INTRO, ...times.map(cuckooShow)] : []),
    ...(show && spec.half
      ? [
          CUCKOO_SET_HALF_INTRO,
          CUCKOO_NOW_BIG,
          CUCKOO_NOW_SMALL,
          CUCKOO_HALF_HINT,
          CUCKOO_WHOLE_HINT,
        ]
      : []),
    ...(spec.tasks.includes('day')
      ? [
          CUCKOO_DAY_INTRO,
          ...DAY.filter((e) => spec.half || e.t.m === 0).flatMap((e) => CUCKOO_DAY[e.id]),
        ]
      : []),
  ];
}

// ─── «Катись, шарик» (этап 59) ───
export const MARBLE_GO = 'Держи телефон двумя руками и наклоняй. Шарик покатится!';
export const MARBLE_HOLE = 'Докати шарик до лунки с флажком!';
export const MARBLE_COUNT = 'Собери числа по порядку: один, два, три…';
export const marbleWord = (word: string) => `Собери слово «${word}»!`;
export const MARBLE_TILT = 'Наклони телефон — шарик покатится сам!';
export const MARBLE_FINGER = 'Кати шарик пальцем: нажми и веди.';
export const MARBLE_PIT = 'Ой, ямка! Шарик вернулся на старт.';
export const MARBLE_ORDER = 'По порядку! Ищи то, что светится.';
export const MARBLE_WIN = 'Шарик в лунке!';
export const MARBLE_END = 'Все дощечки пройдены! Ловкие руки!';
export const MARBLE_ASK =
  'Нажми на зелёную кнопку. Если телефон спросит, попроси взрослого разрешить.';
// ─── «Волшебные пузыри» (этап 59) ───
export const BUBBLES_GO = 'Посмотри, это ты! Маши рукой, и пузыри лопнут.';
export const BUBBLES_FINGER = 'Лопай пузыри пальцем!';
export const BUBBLES_ALL = 'Лопай все пузыри!';
export const bubblesColor = (color: BubbleColor) => `Лопай только ${COLOR_WORDS[color]} пузыри!`;
export const bubblesDigit = (digit: number) => `Лопай пузыри с цифрой ${NUMBERS[digit]}!`;
export const BUBBLES_WAVE = 'Помаши рукой прямо по пузырю!';
export const BUBBLES_WIN = 'Вот это да, сколько пузырей!';
export const BUBBLES_END = 'Все пузыри лопнули! Какие ловкие руки!';
export const BUBBLES_ASK = 'Если телефон спросит про камеру, попроси взрослого разрешить.';
export function bubblesPhrases(spec: SpecOf<'bubbles'>) {
  return [
    BUBBLES_GO,
    BUBBLES_FINGER,
    BUBBLES_WAVE,
    BUBBLES_WIN,
    BUBBLES_END,
    BUBBLES_ASK,
    ...(spec.tasks.includes('all') ? [BUBBLES_ALL] : []),
    ...(spec.tasks.includes('color') ? BUBBLE_COLORS.map(bubblesColor) : []),
    ...(spec.tasks.includes('digit') ? BUBBLE_DIGITS.map(bubblesDigit) : []),
  ];
}

export function marblePhrases(spec: SpecOf<'marble'>) {
  return [
    MARBLE_GO,
    MARBLE_TILT,
    MARBLE_FINGER,
    MARBLE_END,
    MARBLE_ASK,
    ...(spec.pits ? [MARBLE_PIT] : []),
    ...(spec.tasks.includes('hole') ? [MARBLE_HOLE, MARBLE_WIN] : []),
    ...(spec.tasks.some((t) => t !== 'hole') ? [MARBLE_ORDER] : []),
    ...(spec.tasks.includes('count') ? [MARBLE_COUNT, ...NUMBERS.slice(1, 6)] : []),
    ...(spec.tasks.includes('word')
      ? MARBLE_WORDS.flatMap((word) => [marbleWord(word), word])
      : []),
  ];
}

// ─── Этап 45: стихи и сказки ───
export const POEM_INTRO = 'Послушай и повторяй за мной!';
export const POEM_REPEAT = 'Повторяй за мной!';
export const POEM_YOUR_TURN = 'Теперь ты!';
export const POEM_TOGETHER = 'А теперь всё вместе!';
export const POEM_RECALL = 'Расскажи вместе со мной! Я начну, а ты продолжай.';
export const POEM_BLANKS = 'Договори словечко!';
export const POEM_QUESTIONS = 'А теперь вопросы!';
export const POEM_PART_DONE = 'Молодец! Эту часть выучили.';
export const POEM_LEARNED = 'Ура! Выучили всё до конца!';
/** Голос замолкает перед словом: «Петушок, петушок, золотой…» */
export const poemCue = (cue: string) => `${cue.replace(/[,—\s]+$/u, '')}…`;
/** Верный ответ на вопрос: «В тёплые края!» */
export const poemAnswer = (word: string) => `${word[0]!.toUpperCase()}${word.slice(1)}!`;
/** Всё, что может прозвучать в стихе или сказке. */
export function poemPhrases(code: PoemCode): string[] {
  const p = poemOf(code);
  return [
    poemAnnounce(p),
    ...[POEM_REPEAT, POEM_YOUR_TURN, POEM_TOGETHER, POEM_RECALL, POEM_BLANKS, POEM_QUESTIONS],
    ...[POEM_PART_DONE, POEM_LEARNED],
    ...p.parts.flatMap((part) => partSpeech(part)),
    ...p.learn.flat().flatMap((line) => [line, lineStart(line)]),
    ...p.blanks.map((b) => poemCue(b.cue)),
    ...p.questions.flatMap((q) => [q.text, poemAnswer(q.answer[0])]),
  ];
}

// ─── Книжки (этап 52) ─────────────────────────────────────────────────────────
export const BOOK_INTRO = 'Слушай и смотри картинки!';
export const BOOK_TURN = 'Нажми на стрелку — что там дальше?';
export const BOOK_RESUME = 'Продолжаем с закладки!';
export const BOOK_TOMORROW = 'Продолжение — завтра!';
/** «Прочитай сам»: слово по слогам — прочитать и нажать. */
export const BOOK_READ = 'Прочитай слово сам — и нажми на него!';
/** Как голос говорит слово «Прочитай сам» после нажатия. */
export const bookWord = (word: string) => word.toLowerCase();
/** Конец книжки — как в народной сказке; у рассказа — проще. */
export const BOOK_END: Record<BookGenre, string> = {
  folk: 'Вот и сказке конец, а кто слушал — молодец!',
  tale: 'Вот и сказке конец, а кто слушал — молодец!',
  story: 'Вот и всё! Спасибо, что послушали вместе со мной.',
};
/** Всё, что может прозвучать в книжке. */
export function bookPhrases(code: BookCode): string[] {
  const b = bookOf(code);
  return [
    bookAnnounce(b),
    ...b.chapters.map((_, i) => chapterAnnounce(b, i)).filter((t) => t !== null),
    ...[BOOK_TURN, BOOK_RESUME, BOOK_TOMORROW, BOOK_END[b.genre], POEM_QUESTIONS],
    ...(bookReads(b).length ? [BOOK_READ, ...bookReads(b).map(bookWord)] : []),
    ...b.chapters.flatMap((c) => [
      ...c.pages.flatMap((page) => page.text),
      ...c.questions.flatMap((q) => [q.text, poemAnswer(q.answer[0])]),
    ]),
  ];
}

/** Как играть — для игр без своего задания и для «ушка», если задание ещё не звучало. */
export const GAME_INTRO: Record<GameKind, string> = {
  drawing: 'Рисуй пальчиком! Краски — внизу.',
  coloring: 'Раскрась картинку! Выбери краску и нажми на картинку.',
  sorting: 'Перетащи каждую картинку в свой домик.',
  memory: 'Открывай по две картинки и найди одинаковые!',
  puzzle: 'Собери картинку! Перетащи кусочки на свои места.',
  tracing: 'Веди пальчиком по точкам.',
  balloons: 'Лопай шарики — нажимай на них!',
  counting: 'Посчитай и нажми нужную цифру.',
  maze: MAZE_PROMPT,
  shadows: SHADOWS_PROMPT,
  flashlight: FLASH_PROMPT,
  moles: MOLES_PROMPT,
  melody: 'Послушай колокольчики и нажми их так же.',
  shapes: SORTER_PROMPT,
  odd: 'Что здесь лишнее? Нажми на эту картинку.',
  pattern: 'Что будет дальше? Нажми на картинку внизу.',
  compare: 'Нажми, где больше.',
  arithmetic: 'Посчитай и нажми ответ.',
  size: SIZE_PROMPT,
  sequence: 'Разложи картинки по порядку.',
  word: 'Собери слово из букв.',
  pitch: MUSIC_CHOICE.pitch.prompt,
  loudness: MUSIC_CHOICE.loudness.prompt,
  tempo: MUSIC_CHOICE.tempo.prompt,
  duration: MUSIC_CHOICE.duration.prompt,
  direction: MUSIC_CHOICE.direction.prompt,
  beats: BEATS_PROMPT,
  rhythm: 'Послушай барабан и постучи так же.',
  piano: 'Нажимай на клавиши — это ноты до, ре, ми.',
  staff: STAFF_PROMPT,
  song: SONG_TAP,
  freeze: FREEZE_DANCE,
  orchestra: ORCHESTRA_INTRO,
  letter: 'Найди букву, которую я называю.',
  syllable: 'Найди слог, который я называю.',
  firstLetter: 'С какой буквы начинается слово?',
  readWord: READ_WORD,
  syllableCount: SYLLABLE_COUNT_INTRO,
  soundPlace: SOUND_PLACE_INTRO,
  wordScheme: WORD_SCHEME_INTRO,
  pickWord: PICK_WORD,
  readPhrase: READ_PHRASE,
  numberHouse: NUMBER_HOUSE_INTRO,
  numberNeighbors: NEIGHBORS_INTRO,
  compareSign: COMPARE_SIGN_INTRO,
  wordProblem: WORD_PROBLEM_INTRO,
  clock: CLOCK_PROMPT,
  shop: SHOP_PROMPT,
  robot: ROBOT_PROMPT,
  space: SPACE_PROMPT,
  fishing: FISHING_PROMPT,
  flight: FLIGHT_PROMPT,
  builder: BUILDER_PROMPT,
  syllableWord: SYLLABLE_WORD_PROMPT,
  riddle: RIDDLE_PROMPT,
  sudoku: SUDOKU_PROMPT,
  dots: DOTS_PROMPT,
  tangram: TANGRAM_PROMPT,
  colorNumbers: COLOR_NUMBERS_PROMPT,
  dive: DIVE_PROMPT,
  rocket: ROCKET_PROMPT,
  race: RACE_PROMPT,
  differences: DIFF_PROMPT,
  paints: PAINTS_PROMPT,
  train: TRAIN_PROMPT,
  scales: SCALES_COMPARE,
  gears: gearsBuild('mill'),
  dress: dressTask('rain', 1),
  figure: figureTask('house', false),
  bot: BOT_GO,
  cuckoo: CUCKOO_GO,
  marble: MARBLE_GO,
  bubbles: BUBBLES_GO,
  poem: POEM_INTRO,
  book: BOOK_INTRO,
};

/** Подсказки на экранах выбора — для тех, кто не читает. */
export const HINT_TODAY = 'Нажми на кружок — начнём!';
export const HINT_PICK = 'Нажми на любую картинку!';

/** Всё, что может прозвучать в игре. */
export function gamePhrases(spec: GameSpec): string[] {
  switch (spec.kind) {
    case 'coloring':
      return spec.tasks
        ? PICTURES[spec.picture].regions.flatMap((r, i) => [
            coloringTask(spec.picture, i),
            needColor(r.target),
          ])
        : [];
    case 'tracing':
      return [
        ...spec.shapes.map(tracePrompt),
        ...(spec.guides?.includes('start')
          ? [...spec.shapes.map(traceSelfPrompt), TRACE_HINT]
          : []),
      ];
    case 'sorting':
      return [spec.prompt, ...spec.bins.map((b) => b.name)];
    case 'balloons': {
      const { target, letters } = spec;
      if (letters)
        return [
          balloonLetterPrompt(letters.find, letters.lower),
          ...letters.others.map((l) => balloonLetterWrong(l, letters.find)),
        ];
      const wrong = target
        ? (Object.keys(BALLOON_NAMES) as BalloonColor[])
            .filter((c) => c !== target)
            .map((c) => balloonsWrong(c, target))
        : [];
      return [balloonsPrompt(target), ...wrong];
    }
    case 'counting':
      return [COUNT_PROMPT, ...Array.from({ length: spec.max }, (_, i) => countAnswer(i + 1))];
    case 'maze':
      return [MAZE_PROMPT];
    case 'shadows':
      return [SHADOWS_PROMPT, SHADOWS_DONE];
    case 'flashlight':
      return [FLASH_PROMPT, ...spec.items.flatMap((i) => (i.name ? [i.name] : []))];
    case 'moles':
      return [spec.prompt ?? MOLES_PROMPT];
    case 'melody':
      return [MELODY_LISTEN, MELODY_AGAIN, MELODY_YOU, MELODY_GUIDE];
    case 'shapes':
      return [SORTER_PROMPT, SORTER_TURN, SORTER_DONE, ...spec.shapes.map((s) => SORTER[s].name)];
    case 'odd':
      return [ODD_PROMPT, ...spec.rounds.flatMap((r) => (r.explain ? [r.explain] : []))];
    case 'pattern':
      return [PATTERN_PROMPT, PATTERN_DONE];
    case 'compare':
      return [COMPARE_MORE, COMPARE_LESS, MORE_THAN, LESS_THAN];
    case 'arithmetic':
      return [PLUS, MINUS, WILL_BE, HOW_MANY];
    case 'size':
      return [SIZE_PROMPT, SIZE_DONE];
    case 'sequence':
      return spec.rounds.map((r) => r.prompt);
    case 'word':
      return [WORD_PROMPT];
    case 'pitch':
    case 'loudness':
    case 'tempo':
    case 'duration':
    case 'direction': {
      const c = MUSIC_CHOICE[spec.kind];
      return [c.prompt, c.a.demo, c.a.name, c.b.demo, c.b.name];
    }
    case 'beats':
      return [BEATS_PROMPT];
    case 'rhythm':
      return [RHYTHM_LISTEN, RHYTHM_YOU, RHYTHM_AGAIN, RHYTHM_EASY];
    case 'piano': {
      const names = [...new Set(NOTE_NAMES.slice(0, spec.keys))];
      return spec.mode === 'free'
        ? [PIANO_FREE, ...names]
        : spec.mode === 'find'
          ? names.flatMap((n) => [pianoFind(n), thisNote(n)])
          : [PIANO_EAR, ...names.flatMap((n) => [n, thisNote(n)])];
    }
    case 'staff':
      return [STAFF_PROMPT, ...new Set(NOTE_NAMES.slice(0, spec.keys))];
    case 'song':
      return [...spec.songs.map((s) => songIntro(SONGS[s].title)), SONG_TAP, SONG_LISTEN];
    case 'freeze':
      return [FREEZE_DANCE, FREEZE_GO, FREEZE_STOP, FREEZE_MOVED];
    case 'orchestra':
      return [ORCHESTRA_INTRO, ...PLAYER_NAMES.slice(0, spec.players).map(orchestraNow)];
    case 'letter':
      // Остальные буквы (этап 56: ask) — только на кнопках, их не называют.
      return (spec.ask ?? spec.letters).flatMap((l) => [findLetter(l), isLetter(l)]);
    case 'syllable':
      return spec.syllables.flatMap((s) => [findSyllable(s), sayWord(s)]);
    case 'firstLetter':
      return spec.words.flatMap((w) => [firstLetterAsk(w.word), firstLetterIs(w.word)]);
    case 'readWord':
      return [READ_WORD, ...spec.words.map((w) => sayWord(w.word))];
    case 'syllableCount':
      return [
        SYLLABLE_COUNT_INTRO,
        ...spec.words.flatMap((w) => [
          syllablesAsk(w.word),
          syllablesAre(w.word, syllablesIn(w.word)),
        ]),
      ];
    case 'soundPlace':
      return [
        SOUND_PLACE_INTRO,
        ...spec.words.flatMap((w) => {
          const place = soundPlace(w.word, spec.sound);
          return [
            soundAsk(spec.sound, w.word),
            ...(place ? [soundIs(spec.sound, w.word, place)] : []),
          ];
        }),
      ];
    case 'wordScheme':
      return [
        WORD_SCHEME_INTRO,
        ...spec.words.flatMap((w) => [
          schemeAsk(w.word),
          schemeIs(w.word, wordScheme(w.word) ?? []),
        ]),
      ];
    case 'pickWord':
      return [PICK_WORD, ...spec.items.map((i) => sayWord(i.word))];
    case 'readPhrase':
      return [READ_PHRASE, ...spec.items.map((i) => sayWord(i.text))];
    case 'numberHouse': {
      const max = Math.max(...spec.numbers);
      return [
        NUMBER_HOUSE_INTRO,
        HOUSE_ASK,
        PLUS,
        WILL_BE,
        ...spec.numbers.map(houseRoof),
        ...Array.from({ length: max - 1 }, (_, i) => houseWindow(i + 1)),
      ];
    }
    case 'numberNeighbors': {
      const { from, to, modes } = spec;
      const span = (lo: number, hi: number) =>
        Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      return [
        NEIGHBORS_INTRO,
        ...(modes.includes('gap') ? [NEIGHBOR_GAP] : []),
        ...(modes.includes('before') ? span(from + 1, to).map(neighborBefore) : []),
        ...(modes.includes('after') ? span(from, to - 1).map(neighborAfter) : []),
      ];
    }
    case 'compareSign':
      return [COMPARE_SIGN_INTRO, COMPARE_SIGN_ASK, MORE_THAN, LESS_THAN, SIGN_EQUAL];
    case 'wordProblem':
      return [
        WORD_PROBLEM_INTRO,
        PLUS,
        MINUS,
        WILL_BE,
        ...spec.problems.flatMap((p) => [p.text, `${NUMBERS[problemAnswer(p)]}!`]),
      ];
    // Уровни (этап 34) могут включить половины и цены до 10 — озвучиваем всё заранее.
    case 'clock':
      return [
        CLOCK_PROMPT,
        ...Array.from({ length: 12 }, (_, i) => [
          clockFind(i + 1, false),
          clockFind(i + 1, true),
          ...clockAnswer(i + 1, false),
          ...clockAnswer(i + 1, true),
        ]).flat(),
      ];
    case 'shop':
      return [
        SHOP_PROMPT,
        SHOP_TOO_MUCH,
        SHOP_BUY,
        ...Array.from({ length: 10 }, (_, i) => [shopPrice(i + 1), shopAnswer(i + 1)]).flat(),
      ];
    case 'robot':
      return [ROBOT_PROMPT, ROBOT_MISS, ROBOT_ROCK];
    // Уровни могут включить буквы до К, «через одну» и «с конца» — озвучиваем всё заранее.
    case 'space':
      return [
        SPACE_PROMPT,
        SPACE_BACK,
        SPACE_BY_TWO,
        ...(spec.order === 'letters'
          ? SPACE_LETTERS.flatMap((l) => [spaceStart(l, true), isLetter(l)])
          : NUMBERS.slice(1).map((n) => spaceStart(n, false))),
      ];
    case 'fishing':
      return [
        FISHING_PROMPT,
        ...(spec.mode === 'letters'
          ? FISHING_LETTERS.flatMap((l) => [fishingFind(l, true), isLetter(l)])
          : spec.mode === 'sums'
            ? [FISHING_SUM, PLUS]
            : NUMBERS.slice(1, 11).map((n) => fishingFind(n, false))),
      ];
    // Звёздочки считают вслух (числа — общие фразы).
    case 'flight':
      return [FLIGHT_PROMPT, FLIGHT_CLOUD];
    case 'builder':
      return [BUILDER_PROMPT, BUILDER_REMEMBER, ...BUILDER_BLOCKS.map((b) => BLOCK_NAMES[b])];
    case 'syllableWord':
      return [
        SYLLABLE_WORD_PROMPT,
        ...EXTRA_SYLLABLES.map(sayWord),
        ...spec.words.flatMap((w) => [syllableWhole(w.word), ...w.word.split('-').map(sayWord)]),
      ];
    case 'riddle':
      return [RIDDLE_PROMPT, ...spec.riddles.flatMap((r) => [r.text, riddleAnswer(r.name)])];
    case 'sudoku':
      return [SUDOKU_PROMPT, SUDOKU_ROW, SUDOKU_COL, SUDOKU_DONE];
    // Номера точек — общие фразы (счёт).
    case 'dots':
      return [DOTS_PROMPT, ...spec.pictures.map((p) => itIs(DOT_NAMES[p]))];
    case 'tangram':
      return [TANGRAM_PROMPT, ...spec.figures.map((f) => itIs(TANGRAM_NAMES[f]))];
    case 'colorNumbers':
      return [
        COLOR_NUMBERS_PROMPT,
        COLOR_NUMBERS_DONE,
        ...Array.from({ length: 7 }, (_, i) => colorNumberWrong(i + 1)),
      ];
    case 'dive':
      return divePhrases();
    case 'rocket':
      return rocketPhrases(spec.quiz);
    case 'race':
      return racePhrases(spec.quiz);
    case 'differences':
      return diffPhrases();
    case 'paints':
      return paintsPhrases(spec);
    case 'train':
      return trainPhrases(spec);
    case 'scales':
      return scalesPhrases(spec);
    case 'gears':
      return gearsPhrases(spec);
    case 'dress':
      return dressPhrases(spec);
    case 'figure':
      return figurePhrases(spec);
    case 'bot':
      return botPhrases(spec);
    case 'cuckoo':
      return cuckooPhrases(spec);
    case 'marble':
      return marblePhrases(spec);
    case 'bubbles':
      return bubblesPhrases(spec);
    case 'poem':
      return poemPhrases(spec.poem);
    case 'book':
      return bookPhrases(spec.book);
    case 'drawing':
    case 'puzzle':
    case 'memory':
      return [];
  }
}

/** Иностранные фразы игры: слова и буквы «Собери слово». */
function gameForeign(spec: GameSpec): Phrase[] {
  if (spec.kind !== 'word') return [];
  return spec.words.flatMap((w) => [
    { text: w.word.toLowerCase(), lang: spec.lang },
    ...[...w.word].map((l) => ({ text: l, lang: spec.lang })),
  ]);
}

/** «Выключить экран с поводом» (этап 29): что говорит совёнок. */
export const REST_PHRASES = {
  sleep: 'Совёнок уже спит. Пора и тебе в кроватку. Спокойной ночи!',
  eat: 'Совёнок пошёл кушать — и тебе пора! Приятного аппетита!',
  walk: 'Ура, гулять! Совёнок полетел на улицу, догоняй!',
  bath: 'Пора купаться! Совёнок уже взял мыло и уточку.',
  book: 'Давай почитаем книжку вместе с мамой!',
  rest: 'Глазки устали. Давай отдохнём и подвигаемся!',
} as const;
/** Родитель позвал ребёнка (этап 29). */
export const CALLED = 'Тебя зовут! Беги скорей!';

/** «Мои дела» (этап 30). */
export const HABITS_INTRO = 'Мои дела! Сделал дело — нажми на картинку.';
export const HABIT_DONE = [
  'Молодец! Звёздочка в копилку!',
  'Ура! Ещё одна звёздочка!',
  'Отлично! Лови звёздочку!',
  'Так держать! Звёздочка твоя!',
  'Вот это помощь! Звёздочка в копилку!',
];
export const HABITS_ALL_DONE = 'Все дела сделаны! Совёнок тобой гордится!';
export const HABIT_ALREADY = 'Это дело уже сделано!';
export const HABIT_GOAL = 'Копим звёздочки на награду:';
export const HABIT_GRANT = 'Ура! Награда!';
export const HABIT_SLOT_SAY = { morning: 'Утро!', day: 'День!', evening: 'Вечер!' } as const;
/** Таймер чистки зубов: что говорит совёнок и на какой секунде. */
export const TEETH_STEPS = [
  { at: 0, text: 'Чистим зубки вместе с совёнком! Сначала верхние.' },
  { at: 30, text: 'Теперь нижние зубки!' },
  { at: 60, text: 'Теперь с другой стороны — вжик-вжик!' },
  { at: 90, text: 'Ещё немножко! Почисти передние зубки.' },
] as const;
export const TEETH_DONE = 'Готово! Какие чистые зубки!';

/** «Пора спать» (этап 31). */
export const BEDTIME_SOON = 'Скоро спать! Давай сделаем вечерние дела.';
export const BEDTIME_SOON_PLAIN = 'Скоро спать! Пора заканчивать игры.';
export const NIGHT_STORY = 'Пора спать! Ложись поудобнее, сейчас будет сказка.';
/** «Книжка на ночь» (этап 52). */
export const NIGHT_BOOK = 'Пора спать! Ложись поудобнее и слушай книжку.';
export const NIGHT_LULLABY = 'Пора спать! Ложись поудобнее и слушай колыбельную.';
export const NIGHT_QUIET = 'Пора спать! Закрывай глазки. Спокойной ночи!';
export const NIGHT_HUSH = [
  'Ш-ш-ш. Ночь, все спят. Закрывай глазки.',
  'Совёнок охраняет твой сон. Спи, малыш.',
  'Тихо-тихо. Утром поиграем!',
  'Звёздочки уже спят. И тебе пора.',
];
export const MORNING = 'Доброе утро! Совёнок проснулся. Давай сделаем утренние дела!';
export const MORNING_PLAIN = 'Доброе утро! Новый день начинается!';

/** Живой совёнок (этап 32): сценки поверх меню. */
export const OWL_KNOCK = ['Тук-тук! Эй, ты тут?', 'Тук-тук! Я соскучился!', 'Тук-тук! Поиграем?'];
export const OWL_LESSON = ['Смотри сюда! Давай позанимаемся.', 'Вот что у нас дальше!'];
export const OWL_HABITS = 'Загляни в мои дела! Звёздочки ждут.';
export const OWL_PEEK = 'Ку-ку!';
export const OWL_FOUND = ['Ха-ха, нашёл меня!', 'Ой, ты меня нашёл!'];
export const OWL_PRAISE = ['Ты молодец!', 'Вот это да! Ты умничка!', 'Ура! Здорово получилось!'];
export const OWL_TAP = ['Ух-ух!', 'Щекотно!', 'Привет-привет!', 'Хи-хи!'];
export const OWL_YAWN = 'А-а-ах… Что-то я устал. Скоро спать.';

/** Видео подряд не открываются (этап 34) — на полчаса без видео. */
export const VIDEOS_REST = 'Видео сейчас отдыхают. Давай поиграем в игры или посмотрим карточки!';
/** Вопросы после видео обязательны (этап 50): вышел посреди мультика — сначала вопросы. */
export const QUIZ_FIRST = 'Сначала ответим на вопросы про мультик!';

/** Перерыв для глаз (этап 50): совёнок объясняет, зовёт подвигаться и может спросить родителей. */
export const BREAK_START =
  'Глазки устали смотреть на экран. Пусть отдохнут! Попрыгай, побегай, посмотри в окошко. Я позову, когда можно.';
export const BREAK_HINT = 'Очень хочется ещё? Нажми на кнопку — я спрошу у мамы и папы.';
export const BREAK_ASKED = 'Я спросил у мамы и папы. Подождём, что скажут!';
export const BREAK_YES = 'Разрешили! Можно ещё немножко.';
export const BREAK_NO = 'Сказали: пусть глазки отдохнут. Отдыхаем!';
export const BREAK_END = 'Глазки отдохнули! Можно играть дальше.';
export const BREAK_ASK_FAILED = 'Не получилось спросить. Отдохнём немножко!';

/** Пройденное отдыхает (этап 34): касание бледной плитки. */
export const REST_TODAY = 'Это уже пройдено сегодня! Выбери что-нибудь новое.';
export const REST_LEARNED = 'Это ты уже знаешь! Давай что-нибудь новое.';

/**
 * Повтор пройденного (этап 55): бледная плитка открывается ещё раз после пяти заданий по теме;
 * игра без темы — сразу, на уровень сложнее. Обращение — по полу ребёнка из профиля.
 */
export type Gender = 'f' | 'm';
const passed = (g: Gender) => (g === 'f' ? 'прошла' : 'прошёл');
export const reviewAsk = (g: Gender) =>
  `Ты это уже ${passed(g)}! Если интересно ещё раз — выполни пять заданий.`;
export const reviewHarder = (g: Gender) => `Ты уже это ${passed(g)} — давай посложнее!`;
export const reviewAgain = (g: Gender) => `Ты уже это ${passed(g)} — давай ещё раз!`;
export const REVIEW_DONE = 'Все пять заданий! Открываю ещё раз.';
export const reviewPhrases = (g: Gender) => [
  reviewAsk(g),
  reviewHarder(g),
  reviewAgain(g),
  REVIEW_DONE,
];

/** Наклейка за задание (этап 17) и её имя в альбоме. */
export const stickerNew = (name: string) => `Новая наклейка — ${name}!`;
export const stickerAgain = (name: string) => `Ещё ${name}!`;
export const stickerName = (name: string) => `${name}!`;

export type Phrase = { text: string; lang: 'ru' | 'en' | 'zh' };

const levelsOf = (spec: GameSpec) =>
  Array.from({ length: MAX_LEVEL }, (_, i) => specAtLevel(spec, i + 1));

/** Фразы приложения для этого списка ребёнка — чтобы озвучить их заранее. */
export function appPhrases(playlist: KidPlaylist): Phrase[] {
  const ru = new Set<string>([
    GREETING,
    CATEGORY_DONE,
    TODAY_GREETING,
    LESSON_DONE,
    FREE_TIME,
    DAY_OVER,
    PAUSED,
    CALLED,
    ...Object.values(REST_PHRASES),
    HABITS_INTRO,
    ...HABIT_DONE,
    HABITS_ALL_DONE,
    HABIT_ALREADY,
    HABIT_GOAL,
    HABIT_GRANT,
    ...Object.values(HABIT_SLOT_SAY),
    ...TEETH_STEPS.map((s) => s.text),
    TEETH_DONE,
    BEDTIME_SOON,
    BEDTIME_SOON_PLAIN,
    NIGHT_STORY,
    NIGHT_BOOK,
    BOOK_TOMORROW,
    ...Object.values(BOOK_END),
    NIGHT_LULLABY,
    NIGHT_QUIET,
    ...NIGHT_HUSH,
    MORNING,
    MORNING_PLAIN,
    ...OWL_KNOCK,
    ...OWL_LESSON,
    OWL_HABITS,
    OWL_PEEK,
    ...OWL_FOUND,
    ...OWL_PRAISE,
    ...OWL_TAP,
    OWL_YAWN,
    VIDEOS_REST,
    QUIZ_FIRST,
    BREAK_START,
    BREAK_HINT,
    BREAK_ASKED,
    BREAK_YES,
    BREAK_NO,
    BREAK_END,
    BREAK_ASK_FAILED,
    REST_TODAY,
    REST_LEARNED,
    ...reviewPhrases(playlist.gender ?? 'm'),
    CAMERA_ENOUGH,
    HINT_TODAY,
    HINT_PICK,
    ...Object.values(BATTERY_PHRASES),
    ...(Object.keys(CATEGORY_LABELS) as KidCategory[]).map(categoryPhrase),
    ...PALETTE.map((p) => p.name),
    ...NUMBERS.slice(1).flatMap((n) => [n, `${n}!`]),
  ]);
  /** Нужное реже — в конце: сервер озвучивает пачками, первым — главное. */
  const later = new Set<string>(
    STICKERS.flatMap((s) => [stickerNew(s.name), stickerAgain(s.name), stickerName(s.name)]),
  );
  const out: Phrase[] = [];
  for (const item of playlist.items) {
    if (item.kind === 'interactive') {
      gamePhrases(item.spec).forEach((t) => ru.add(t));
      // Уровень ребёнка (этап 34) меняет задание (больше рыбок, другие цифры) — озвучиваем все.
      for (const spec of levelsOf(item.spec)) gamePhrases(spec).forEach((t) => later.add(t));
      ru.add(GAME_INTRO[item.spec.kind]);
      for (const p of gameForeign(item.spec)) {
        if (p.lang === 'ru') ru.add(p.text);
        else out.push(p);
      }
    }
    if (item.kind === 'segment')
      for (const s of item.questions.flatMap((q) => q.answer ?? []))
        if (s.lang === 'ru') ru.add(s.text);
        else out.push({ text: s.text, lang: s.lang });
    if (item.kind === 'deck') {
      for (const card of item.cards) {
        const said = [
          ...(card.question ? [] : checkPrompt(card.word, playlist.immersion)), // свой вопрос озвучен на сервере
          ...checkAnswer(card, playlist.immersion),
        ];
        for (const s of said) {
          if (s.audioUrl) continue;
          if (s.lang === 'ru') ru.add(s.text);
          else out.push({ text: s.text, lang: s.lang });
        }
      }
    }
  }
  const seen = new Set<string>();
  const rus = (texts: Set<string>) => [...texts].map((text) => ({ text, lang: 'ru' as const }));
  return [...rus(ru), ...out, ...rus(later)].filter((p) => {
    const key = `${p.lang}|${p.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
