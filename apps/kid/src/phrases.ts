// Фразы самого приложения — в одном месте: их произносят экраны и игры, и их же приложение
// заранее просит озвучить на сервере (нейроголосом), когда серверная озвучка включена.
import { BATTERY_PHRASES } from '@kidsplus/shared/battery';
import type { KidCategory, KidPlaylist } from '@kidsplus/shared/api';
import type {
  BalloonColor,
  ColoringPicture,
  GameKind,
  GameSpec,
  TraceShape,
} from '@kidsplus/shared/games';
import { NOTE_NAMES } from '@kidsplus/shared/games';
import { SONGS } from '@kidsplus/shared/songs';
import { NUMBERS, paint, PALETTE } from './games/common';
import { SORTER } from './games/sorterShapes';
import { PICTURES } from './games/pictures';
import { TRACES } from './games/traceShapes';
import { checkPrompt } from './quiz/engine';

export const CATEGORY_LABELS: Record<KidCategory, string> = {
  video: 'Видео',
  english: 'Английский',
  math: 'Математика и геометрия',
  chinese: 'Китайский',
  geography: 'География',
  nature: 'Природа',
  music: 'Музыка',
  letters: 'Буквы',
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
export const findLetter = (l: string) => `Найди букву ${l}.`;
export const isLetter = (l: string) => `Буква ${l}!`;
export const findSyllable = (s: string) => `Найди слог ${low(s)}.`;
export const firstLetterAsk = (word: string) => `С какой буквы начинается слово ${low(word)}?`;
export const firstLetterIs = (word: string) => `${low(word)} — на букву ${word[0]}!`;
export const READ_WORD = 'Прочитай слово и найди картинку.';
export const sayWord = (word: string) => `${low(word)}!`;

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
};

/** Подсказки на экранах выбора — для тех, кто не читает. */
export const HINT_TODAY = 'Нажми на кружок — начнём!';
export const HINT_PICK = 'Нажми на любую картинку!';

/** Всё, что может прозвучать в игре. */
function gamePhrases(spec: GameSpec): string[] {
  switch (spec.kind) {
    case 'coloring':
      return spec.tasks
        ? PICTURES[spec.picture].regions.flatMap((r, i) => [
            coloringTask(spec.picture, i),
            needColor(r.target),
          ])
        : [];
    case 'tracing':
      return spec.shapes.map(tracePrompt);
    case 'sorting':
      return [spec.prompt, ...spec.bins.map((b) => b.name)];
    case 'balloons': {
      const { target } = spec;
      const wrong = target
        ? (Object.keys(BALLOON_NAMES) as BalloonColor[])
            .filter((c) => c !== target)
            .map((c) => balloonsWrong(c, target))
        : [];
      return [balloonsPrompt(target), ...wrong];
    }
    case 'counting':
      return [COUNT_PROMPT];
    case 'maze':
      return [MAZE_PROMPT];
    case 'shadows':
      return [SHADOWS_PROMPT];
    case 'flashlight':
      return [FLASH_PROMPT, ...spec.items.flatMap((i) => (i.name ? [i.name] : []))];
    case 'moles':
      return [spec.prompt ?? MOLES_PROMPT];
    case 'melody':
      return [MELODY_LISTEN, MELODY_AGAIN, MELODY_YOU, MELODY_GUIDE];
    case 'shapes':
      return [SORTER_PROMPT, SORTER_TURN, ...spec.shapes.map((s) => SORTER[s].name)];
    case 'odd':
      return [ODD_PROMPT, ...spec.rounds.flatMap((r) => (r.explain ? [r.explain] : []))];
    case 'pattern':
      return [PATTERN_PROMPT];
    case 'compare':
      return [COMPARE_MORE, COMPARE_LESS, MORE_THAN, LESS_THAN];
    case 'arithmetic':
      return [PLUS, MINUS, WILL_BE, HOW_MANY];
    case 'size':
      return [SIZE_PROMPT];
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
      return spec.letters.flatMap((l) => [findLetter(l), isLetter(l)]);
    case 'syllable':
      return spec.syllables.flatMap((s) => [findSyllable(s), sayWord(s)]);
    case 'firstLetter':
      return spec.words.flatMap((w) => [firstLetterAsk(w.word), firstLetterIs(w.word)]);
    case 'readWord':
      return [READ_WORD, ...spec.words.map((w) => sayWord(w.word))];
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
export const NIGHT_LULLABY = 'Пора спать! Ложись поудобнее и слушай колыбельную.';
export const NIGHT_QUIET = 'Пора спать! Закрывай глазки. Спокойной ночи!';
export const NIGHT_END = 'Спокойной ночи! Сладких снов.';
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
/** Пройденное отдыхает (этап 34): касание бледной плитки. */
export const REST_TODAY = 'Это уже пройдено сегодня! Выбери что-нибудь новое.';
export const REST_LEARNED = 'Это ты уже знаешь! Давай что-нибудь новое.';

export type Phrase = { text: string; lang: 'ru' | 'en' | 'zh' };

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
    NIGHT_LULLABY,
    NIGHT_QUIET,
    NIGHT_END,
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
    REST_TODAY,
    REST_LEARNED,
    CAMERA_ENOUGH,
    HINT_TODAY,
    HINT_PICK,
    ...Object.values(BATTERY_PHRASES),
    ...(Object.keys(CATEGORY_LABELS) as KidCategory[]).map(categoryPhrase),
    ...PALETTE.map((p) => p.name),
    ...NUMBERS.slice(1).flatMap((n) => [n, `${n}!`]),
  ]);
  const out: Phrase[] = [];
  for (const item of playlist.items) {
    if (item.kind === 'interactive') {
      gamePhrases(item.spec).forEach((t) => ru.add(t));
      ru.add(GAME_INTRO[item.spec.kind]);
      for (const p of gameForeign(item.spec)) {
        if (p.lang === 'ru') ru.add(p.text);
        else out.push(p);
      }
    }
    if (item.kind === 'deck') {
      for (const card of item.cards) {
        if (card.question) continue; // свой вопрос озвучен на сервере вместе с карточкой
        for (const s of checkPrompt(card.word, playlist.immersion)) {
          if (s.audioUrl) continue;
          if (s.lang === 'ru') ru.add(s.text);
          else out.push({ text: s.text, lang: s.lang });
        }
      }
    }
  }
  const seen = new Set<string>();
  return [...[...ru].map((text) => ({ text, lang: 'ru' as const })), ...out].filter((p) => {
    const key = `${p.lang}|${p.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
