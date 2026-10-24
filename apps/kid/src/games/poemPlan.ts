// Стихи и сказки (этап 45): из чего состоит одно занятие и что телефон помнит о выученном.
// Отдельно от Poem.tsx: чистые функции — для юнит-тестов.
import {
  blankPart,
  blanksFor,
  poemOf,
  poemWords,
  type Poem,
  type PoemBlank,
  type PoemChoice,
  type PoemCode,
  type PoemQuestion,
} from '@kidsplus/shared/poems';
import { shuffled } from './common';
import type { SpecOf } from './common';

/** «Договори» и вопросов за занятие — коротко, чтобы малыш не устал. */
export const BLANKS_PER_GAME = 3;
export const QUESTIONS_PER_GAME = 2;

export interface PoemRound {
  /** Верный ответ и варианты (с ним вместе) — по порядку на экране. */
  answer: PoemChoice;
  options: PoemChoice[];
}
export type BlankRound = PoemRound & { blank: PoemBlank; part: number };
export type QuestionRound = PoemRound & { question: PoemQuestion };

export type PoemStep =
  | { kind: 'listen' }
  /** Учим группу строк: голос — строчку, ребёнок — за ним. */
  | { kind: 'repeat'; group: number }
  /** Всё выучено: голос начинает строку, ребёнок продолжает. */
  | { kind: 'recall'; group: number }
  | { kind: 'blanks'; rounds: BlankRound[] }
  | { kind: 'questions'; rounds: QuestionRound[] };

const options = (answer: PoemChoice, wrong: readonly PoemChoice[], choices: number) =>
  shuffled([answer, ...shuffled(wrong).slice(0, Math.max(1, choices - 1))]);

/** Занятие: послушать, учить (или рассказать вместе), «Договори», вопросы — что включил родитель. */
export function poemPlan(spec: SpecOf<'poem'>, learned: number): PoemStep[] {
  const p = poemOf(spec.poem);
  const groups = p.learn.length;
  const steps: PoemStep[] = [{ kind: 'listen' }];
  if (spec.repeat && groups) {
    steps.push(
      learned < groups
        ? { kind: 'repeat', group: learned }
        : { kind: 'recall', group: Math.floor(Math.random() * groups) },
    );
  }
  if (spec.blanks) {
    // Не учим наизусть — спрашиваем по всему тексту; учим — только то, что уже начали.
    const pool = spec.repeat ? blanksFor(p, learned) : p.blanks;
    const picked = shuffled(pool).slice(0, BLANKS_PER_GAME);
    const rounds = p.blanks
      .filter((b) => picked.includes(b))
      .map((blank) => {
        const answer: PoemChoice = [blank.word, blank.picture];
        return {
          blank,
          part: blankPart(p, blank),
          answer,
          options: options(answer, blank.wrong, spec.choices),
        };
      });
    if (rounds.length) steps.push({ kind: 'blanks', rounds });
  }
  if (spec.questions && p.questions.length) {
    const rounds = shuffled(p.questions)
      .slice(0, QUESTIONS_PER_GAME)
      .map((question) => ({
        question,
        answer: question.answer,
        options: options(question.answer, question.wrong, spec.choices),
      }));
    steps.push({ kind: 'questions', rounds });
  }
  return steps;
}

/** Под какой картинкой звучит строка: часть, где она стоит (не нашли — первая). */
export function linePart(p: Poem, line: string): number {
  const want = poemWords(line).join(' ');
  const i = p.parts.findIndex((part) =>
    ` ${poemWords(part.lines.join(' ')).join(' ')} `.includes(` ${want} `),
  );
  return Math.max(0, i);
}

/** Сколько ребёнок ждёт своей очереди: по длине строки, 2,5–6 с. */
export const turnMs = (line: string) => Math.min(6000, Math.max(2500, 1200 + line.length * 90));

// ─── Что выучено (на телефоне ребёнка) ────────────────────────────────────────

const STORE = 'kidsplus.poems';

function read(): Partial<Record<PoemCode, number>> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return v && typeof v === 'object' ? (v as Partial<Record<PoemCode, number>>) : {};
  } catch {
    return {};
  }
}

/** Сколько групп строк стиха уже выучено. */
export const learnedOf = (code: PoemCode) => Math.max(0, Math.floor(read()[code] ?? 0));

/** Группа выучена — запомнить (не больше, чем групп в стихе). */
export function markLearned(code: PoemCode, n: number) {
  const all = read();
  all[code] = Math.min(poemOf(code).learn.length, Math.max(all[code] ?? 0, n));
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // нет хранилища — в следующий раз начнём с той же части
  }
}
