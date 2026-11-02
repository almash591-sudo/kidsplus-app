// Повтор пройденного (этап 55): бледная плитка открывается ещё раз — после пяти заданий по теме
// (вопросы видео, «Где …?» по карточкам, «Договори» и вопросы стиха или книжки). Открытое
// телефон помнит до конца дня. Игра без темы открывается сразу — на уровень сложнее.
import type { KidItem, KidPlaylist } from '@kidsplus/shared/api';
import { bookOf, type BookCode } from '@kidsplus/shared/books';
import type { GameKind } from '@kidsplus/shared/games';
import { MAX_LEVEL, specAtLevel } from '@kidsplus/shared/levels';
import { blankPart, poemOf, type PoemChoice, type PoemCode } from '@kidsplus/shared/poems';
import { markOf, today, type BookMark } from './games/bookPlan';
import { choiceOptions, type BlankRound, type QuestionRound } from './games/poemPlan';
import {
  deckCheckQuestions,
  fromKidQuestion,
  shuffle,
  type QuizItem,
  type Rng,
} from './quiz/engine';

/** Сколько заданий выполнить, чтобы открыть пройденное. */
export const REVIEW_TASKS = 5;
/** Вопросов по смыслу в повторе стиха — остальное «Договори». */
const POEM_QUESTIONS = 3;

/**
 * Что делать с пройденным: quiz — вопросы с картинками (видео, карточки), poem и book — «Договори»
 * и вопросы стиха или книжки, harder — игра на уровень сложнее, again — игра как есть
 * (сложнее не бывает). null — проверить нечем: отдыхает, как раньше.
 */
export type Review =
  | { kind: 'quiz'; questions: QuizItem[] }
  | { kind: 'poem'; poem: PoemCode; blanks: BlankRound[]; questions: QuestionRound[] }
  | { kind: 'book'; questions: QuestionRound[] }
  | { kind: 'harder'; level: number }
  | { kind: 'again' }
  | null;

/** count штук из pool: по кругу, каждый круг перемешан, одно и то же два раза подряд — нет. */
export function cycle<T>(pool: readonly T[], count: number, rng: Rng = Math.random): T[] {
  if (!pool.length) return [];
  const out: T[] = [];
  while (out.length < count) {
    let round = shuffle(pool, rng);
    if (round.length > 1 && round[0] === out.at(-1)) round = [...round.slice(1), round[0]!];
    out.push(...round);
  }
  return out.slice(0, count);
}

/** Уровень ребёнка в этой игре сейчас (этап 34); уровней нет — как задал родитель. */
export const levelOf = ({ levels }: Pick<KidPlaylist, 'levels'>, kind: GameKind) =>
  levels ? (levels.byKind[kind] ?? levels.start) : undefined;

/** Прочитанные главы: по закладке; закладки нет (другой телефон) — вся книжка. */
export function readChapters(chapters: number, mark: BookMark | undefined): number[] {
  const last = !mark
    ? chapters - 1
    : mark.day !== undefined
      ? mark.chapter
      : Math.max(0, mark.chapter - 1);
  return Array.from({ length: Math.min(chapters, last + 1) }, (_, i) => i);
}

function poemReview(code: PoemCode, choices: number, rng: Rng): Review {
  const p = poemOf(code);
  const asked = shuffle(p.questions, rng).slice(0, POEM_QUESTIONS);
  // Вопросов мало — больше «Договори», и наоборот; не хватает — по кругу.
  const blanks = cycle(p.blanks, REVIEW_TASKS - asked.length, rng);
  const questions = blanks.length ? asked : cycle(p.questions, REVIEW_TASKS, rng);
  if (!blanks.length && !questions.length) return null;
  return {
    kind: 'poem',
    poem: code,
    blanks: blanks.map((blank) => {
      const answer: PoemChoice = [blank.word, blank.picture];
      return {
        blank,
        part: blankPart(p, blank),
        answer,
        options: choiceOptions(answer, blank.wrong, choices),
      };
    }),
    questions: questions.map((question) => ({
      question,
      answer: question.answer,
      options: choiceOptions(question.answer, question.wrong, choices),
    })),
  };
}

function bookReview(code: BookCode, choices: number, rng: Rng): Review {
  const book = bookOf(code);
  const pool = readChapters(book.chapters.length, markOf(code)).flatMap(
    (i) => book.chapters[i]!.questions,
  );
  const questions = cycle(pool, REVIEW_TASKS, rng);
  if (!questions.length) return null;
  return {
    kind: 'book',
    questions: questions.map((question) => ({
      question,
      answer: question.answer,
      options: choiceOptions(question.answer, question.wrong, choices),
    })),
  };
}

/** Чем проверить пройденный пункт. Случайность — здесь, один раз: экран её не меняет. */
export function reviewOf(
  item: KidItem,
  playlist: Pick<KidPlaylist, 'levels' | 'immersion'>,
  rng: Rng = Math.random,
): Review {
  if (item.kind === 'segment') {
    const questions = item.questions.map(fromKidQuestion);
    return questions.length ? { kind: 'quiz', questions } : null;
  }
  if (item.kind === 'deck') {
    const { cards } = item;
    const questions = deckCheckQuestions(cards, cards, cards.length, rng, playlist.immersion);
    return questions.length ? { kind: 'quiz', questions } : null;
  }
  const { spec } = item;
  if (spec.kind === 'poem') return poemReview(spec.poem, spec.choices, rng);
  if (spec.kind === 'book') return bookReview(spec.book, spec.choices, rng);
  const level = levelOf(playlist, spec.kind) ?? 1;
  const up = Math.min(MAX_LEVEL, level + 1);
  const same = JSON.stringify(specAtLevel(spec, up)) === JSON.stringify(specAtLevel(spec, level));
  return same ? { kind: 'again' } : { kind: 'harder', level: up };
}

// ─── Что открыто сегодня (на телефоне ребёнка) ───────────────────────────────

const STORE = 'kidsplus.review';

interface Stored {
  date: string;
  keys: string[];
}

const keyOf = (item: Pick<KidItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;

function read(day: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Stored> | null;
    return v?.date === day && Array.isArray(v.keys) ? v.keys : [];
  } catch {
    return [];
  }
}

/** Пройденное, открытое после проверки: до конца дня по часам телефона. */
export const reviewed = {
  has: (item: Pick<KidItem, 'kind' | 'id'>, day = today()) => read(day).includes(keyOf(item)),
  add(item: Pick<KidItem, 'kind' | 'id'>, day = today()) {
    const keys = read(day);
    if (keys.includes(keyOf(item))) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ date: day, keys: [...keys, keyOf(item)] }));
    } catch {
      // нет хранилища — в следующий раз снова пять заданий
    }
  },
};
