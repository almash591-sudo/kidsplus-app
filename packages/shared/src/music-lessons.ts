// 100 уроков музыки и сольфеджио (этап 14б): 40 для малышей (2–3 года) и 60 для дошкольников
// (4–6 лет). Уроки идут дорожкой от простого к сложному: каждые пять — маленькая тема,
// темы чередуются (слух, ритм, ноты), чтобы ребёнку не надоедало.
import { NOTE_NAMES, gameSpec, type GameSpec } from './games';
import { SONGS, type SongId } from './songs';

export type MusicAge = 'young' | 'old';

export interface MusicLesson {
  /** Порядковый номер в дорожке своего возраста, с 1. */
  n: number;
  age: MusicAge;
  title: string;
  spec: GameSpec;
}

const range = (keys: number) => (keys >= 8 ? 'вся октава' : `до–${NOTE_NAMES[keys - 1]}`);

function topic(spec: GameSpec): string {
  switch (spec.kind) {
    case 'pitch':
      return 'Птичка и мишка: высоко и низко';
    case 'loudness':
      return 'Слон и мышка: громко и тихо';
    case 'tempo':
      return 'Зайчик и черепаха: быстро и медленно';
    case 'duration':
      return 'Паровоз и цыплёнок: долго и коротко';
    case 'direction':
      return 'Лесенка: мелодия вверх и вниз';
    case 'beats':
      return `Сколько раз ударил барабан (до ${spec.max})`;
    case 'rhythm':
      return spec.timing ? `Ритм «та» и «ти-ти» (${spec.beats} удара)` : 'Повтори ритм на барабане';
    case 'melody':
      return `Колокольчики: повтори мелодию (до ${spec.goal} нот)`;
    case 'piano':
      return spec.mode === 'free'
        ? `Пианино: играем сами (${range(spec.keys)})`
        : spec.mode === 'find'
          ? `Пианино: найди ноту (${range(spec.keys)})`
          : `Пианино: угадай ноту на слух (${range(spec.keys)})`;
    case 'staff':
      return `Нотный стан: где живёт нота (${range(spec.keys)})`;
    default:
      return 'Музыка';
  }
}

// Краткая запись уроков: вид и параметры.
const pitch = (gap: number, rounds: number): GameSpec => ({ kind: 'pitch', gap, rounds });
const loud = (rounds: number): GameSpec => ({ kind: 'loudness', rounds });
const tempo = (rounds: number): GameSpec => ({ kind: 'tempo', rounds });
const long = (rounds: number): GameSpec => ({ kind: 'duration', rounds });
const dir = (notes: number, rounds: number): GameSpec => ({ kind: 'direction', notes, rounds });
const beats = (max: number, rounds: number): GameSpec => ({ kind: 'beats', max, rounds });
const rhythm = (n: number, rounds: number, timing = false): GameSpec => ({
  kind: 'rhythm',
  beats: n,
  timing,
  rounds,
});
const bells = (count: number, start: number, goal: number): GameSpec => ({
  kind: 'melody',
  bells: count,
  start,
  goal,
});
const free = (keys: number, rounds: number): GameSpec => ({
  kind: 'piano',
  mode: 'free',
  keys,
  rounds,
});
const find = (keys: number, rounds: number): GameSpec => ({
  kind: 'piano',
  mode: 'find',
  keys,
  rounds,
});
const ear = (keys: number, rounds: number): GameSpec => ({
  kind: 'piano',
  mode: 'ear',
  keys,
  rounds,
});
const staff = (keys: number, rounds: number): GameSpec => ({ kind: 'staff', keys, rounds });

/** Малыши: различать звуки (высоко, громко, быстро, долго), стучать, играть на пианино. */
// prettier-ignore
const YOUNG: GameSpec[] = [
  pitch(36, 4), loud(4), tempo(4), free(5, 2), beats(2, 4),
  long(4), pitch(30, 5), rhythm(2, 3), bells(3, 1, 2), free(8, 2),
  loud(5), tempo(5), beats(2, 5), pitch(30, 5), rhythm(3, 3),
  long(5), bells(3, 1, 3), free(8, 3), pitch(24, 5), beats(3, 4),
  loud(6), tempo(6), rhythm(3, 4), long(6), dir(5, 4),
  pitch(24, 6), beats(3, 5), bells(3, 2, 3), find(3, 4), rhythm(3, 4),
  dir(5, 5), loud(6), tempo(6), free(8, 3), beats(3, 6),
  pitch(24, 6), long(6), rhythm(4, 4), bells(3, 2, 4), dir(5, 6),
];

/** Дошкольники: ноты до-ре-ми на пианино и на нотном стане, ритм «та» и «ти-ти», слух. */
// prettier-ignore
const OLD: GameSpec[] = [
  pitch(24, 6), dir(5, 5), beats(4, 5), free(8, 3), rhythm(3, 4),
  find(3, 5), staff(3, 5), rhythm(3, 4, true), pitch(19, 6), bells(4, 2, 5),
  dir(4, 6), beats(5, 5), find(5, 6), staff(3, 6), loud(6),
  tempo(6), rhythm(4, 4, true), ear(3, 5), staff(5, 5), long(6),
  pitch(14, 6), dir(3, 6), find(8, 6), bells(4, 2, 6), beats(6, 5),
  staff(5, 6), ear(3, 6), rhythm(4, 5, true), dir(4, 8), pitch(12, 6),
  find(8, 8), staff(8, 5), beats(6, 6), rhythm(5, 4, true), bells(5, 2, 6),
  ear(4, 5), dir(3, 8), staff(8, 6), tempo(8), pitch(12, 8),
  rhythm(5, 5, true), ear(5, 5), staff(5, 8), bells(5, 3, 7), beats(6, 8),
  find(8, 10), dir(3, 10), rhythm(6, 4, true), staff(8, 8), loud(8),
  ear(5, 6), bells(5, 3, 8), pitch(12, 10), staff(8, 10), rhythm(6, 5, true),
  ear(8, 5), dir(3, 12), beats(6, 10), staff(8, 12), bells(5, 4, 8),
];

const lessons = (age: MusicAge, specs: GameSpec[]): MusicLesson[] =>
  specs.map((s, i) => {
    const spec = gameSpec.parse(s);
    const n = i + 1;
    const prefix = age === 'young' ? 'Музыка для малышей' : 'Музыка';
    return { n, age, title: `${prefix} ${String(n).padStart(2, '0')} · ${topic(spec)}`, spec };
  });

/** Все 100 уроков: сначала малышам, потом дошкольникам. */
export const MUSIC_LESSONS: MusicLesson[] = [...lessons('young', YOUNG), ...lessons('old', OLD)];

// ─── Весёлая музыка (этап 18б): песенки, «Замри!», оркестр — между упражнениями ───

const song = (...songs: SongId[]): GameSpec => ({ kind: 'song', songs });
const freeze = (rounds: number): GameSpec => ({ kind: 'freeze', rounds });
const band = (players: number, rounds: number): GameSpec => ({
  kind: 'orchestra',
  players,
  rounds,
});

function funTopic(spec: GameSpec): string {
  switch (spec.kind) {
    case 'song':
      return `Сыграй песенку: ${spec.songs.map((s) => `«${SONGS[s].title}»`).join(', ')}`;
    case 'freeze':
      return 'Танцуем и замираем';
    case 'orchestra':
      return 'Звериный оркестр';
    default:
      return 'Музыка';
  }
}

// prettier-ignore
const YOUNG_FUN: GameSpec[] = [
  song('vorobey'), freeze(4), band(3, 3), song('yakov'),
  freeze(4), band(4, 3), song('zvezdochka'), freeze(5),
  band(4, 4), song('vorobey', 'yakov'), freeze(5), band(5, 4),
  song('barashek'), freeze(6), band(5, 5), song('zvezdochka', 'vorobey'),
];

// prettier-ignore
const OLD_FUN: GameSpec[] = [
  song('zvezdochka'), freeze(5), band(4, 4), song('barashek'), freeze(5),
  band(5, 4), song('yakov', 'bubentsy'), freeze(6), band(5, 5), song('radost'),
  freeze(6), band(6, 5), song('kolybelnaya'), freeze(7), band(6, 6),
  song('radost', 'bubentsy'), freeze(8), band(6, 6), song('zvezdochka', 'kolybelnaya'), song('barashek', 'radost'),
];

const funLessons = (age: MusicAge, specs: GameSpec[]): MusicLesson[] =>
  specs.map((s, i) => {
    const spec = gameSpec.parse(s);
    const n = i + 1;
    const prefix = age === 'young' ? 'Весёлая музыка для малышей' : 'Весёлая музыка';
    return { n, age, title: `${prefix} ${String(n).padStart(2, '0')} · ${funTopic(spec)}`, spec };
  });

/** Песенки, «Замри!» и оркестр: импорт расставляет их между упражнениями дорожки. */
export const MUSIC_FUN_LESSONS: MusicLesson[] = [
  ...funLessons('young', YOUNG_FUN),
  ...funLessons('old', OLD_FUN),
];

/** Возраст, с которого — уроки для дошкольников. */
export const MUSIC_OLD_FROM_AGE = 4;
