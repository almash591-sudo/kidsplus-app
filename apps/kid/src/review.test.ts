// Этап 55: повтор пройденного — какие пять заданий, какие главы книжки, что открыто сегодня.
import type { KidCard, KidItem, KidPlaylist } from '@kidsplus/shared/api';
import { BOOK_CODES, bookOf } from '@kidsplus/shared/books';
import { POEM_CODES, poemOf } from '@kidsplus/shared/poems';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restingIn } from './categories';
import { saveMark } from './games/bookPlan';
import { appPhrases, reviewAsk, reviewHarder, reviewPhrases } from './phrases';
import { cycle, readChapters, REVIEW_TASKS, reviewed, reviewOf } from './review';

const speech = (text: string) => ({ text, lang: 'ru' as const, audioUrl: null });
const segment = (id: string, questions = 2): KidItem => ({
  kind: 'segment',
  id,
  provider: 'youtube',
  externalId: 'x',
  startSec: 0,
  endSec: 60,
  thumbnailUrl: null,
  rest: 'today',
  questions: Array.from({ length: questions }, (_, i) => ({
    id: `q${i}`,
    prompt: speech(`Вопрос ${i}`),
    options: [
      { id: `a${i}`, imageUrl: `/a${i}.webp`, isCorrect: true },
      { id: `b${i}`, imageUrl: `/b${i}.webp`, isCorrect: false },
    ],
  })),
});
const card = (id: string): KidCard => ({
  id,
  imageUrl: `/${id}.webp`,
  word: speech(id),
  translation: null,
  question: null,
});
const deck = (cards: number): KidItem => ({
  kind: 'deck',
  id: 'd',
  category: 'nature',
  coverUrl: '/c.webp',
  cards: Array.from({ length: cards }, (_, i) => card(`c${i}`)),
  rest: 'learned',
});
const game = (spec: Extract<KidItem, { kind: 'interactive' }>['spec']): KidItem => ({
  kind: 'interactive',
  id: 'g',
  category: 'games',
  spec,
  rest: 'today',
});
const maze = { kind: 'maze', heroId: 'h', goalId: 'g', size: 4, rounds: 2 } as const;
const plain: Pick<KidPlaylist, 'levels' | 'immersion'> = { immersion: false };

/** Хранилище телефона в памяти. */
function stubStore() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('по кругу', () => {
  it('сколько нужно, по кругу, одно и то же два раза подряд — нет', () => {
    for (let n = 0; n < 50; n++) {
      const out = cycle([1, 2], 5);
      expect(out).toHaveLength(5);
      expect(out.every((x, i) => i === 0 || x !== out[i - 1])).toBe(true);
    }
    expect(cycle([7], 3)).toEqual([7, 7, 7]);
    expect(cycle([], 5)).toEqual([]);
  });
});

describe('книжка: какие главы прочитаны', () => {
  it('закладки нет — вся; глава дочитана — с ней; читает — до неё', () => {
    expect(readChapters(3, undefined)).toEqual([0, 1, 2]);
    expect(readChapters(3, { chapter: 1, page: 0, day: '2026-11-01' })).toEqual([0, 1]);
    expect(readChapters(3, { chapter: 2, page: 4 })).toEqual([0, 1]);
    // Первая глава ещё читается — спрашиваем по ней: пройдено ведь «на сегодня».
    expect(readChapters(3, { chapter: 0, page: 4 })).toEqual([0]);
    expect(readChapters(1, { chapter: 5, page: 0, day: '2026-11-01' })).toEqual([0]);
  });

  it('вопросы — только по прочитанным главам', () => {
    stubStore();
    // Книжка, где глав больше всего: читает первую — спрашиваем только по ней.
    const code = [...BOOK_CODES].sort(
      (a, b) => bookOf(b).chapters.length - bookOf(a).chapters.length,
    )[0]!;
    const book = bookOf(code);
    saveMark(code, { chapter: 0, page: 2 });
    const r = reviewOf(game({ kind: 'book', book: code, choices: 3 } as never), plain);
    expect(r?.kind).toBe('book');
    if (r?.kind !== 'book') return;
    expect(r.questions).toHaveLength(REVIEW_TASKS);
    const read = book.chapters[0]!.questions;
    expect(r.questions.every((q) => read.includes(q.question))).toBe(true);
  });
});

describe('чем проверить пройденное', () => {
  it('видео — его вопросы; без вопросов — проверить нечем, отдыхает', () => {
    const r = reviewOf(segment('v'), plain);
    expect(r?.kind).toBe('quiz');
    if (r?.kind === 'quiz') expect(r.questions.map((q) => q.id)).toEqual(['q0', 'q1']);
    expect(reviewOf(segment('v', 0), plain)).toBeNull();
  });

  it('карточки — «Где …?» по карточкам набора; одна карточка — нечем', () => {
    const r = reviewOf(deck(3), plain);
    expect(r?.kind).toBe('quiz');
    if (r?.kind === 'quiz')
      expect(r.questions.map((q) => q.cardId).sort()).toEqual(['c0', 'c1', 'c2']);
    expect(reviewOf(deck(1), plain)).toBeNull();
  });

  it('у каждого стиха и каждой книжки — пять заданий, варианты с верным ответом', () => {
    stubStore();
    for (const poem of POEM_CODES) {
      const r = reviewOf(game({ kind: 'poem', poem, choices: 3 } as never), plain);
      expect(r?.kind, poem).toBe('poem');
      if (r?.kind !== 'poem') continue;
      expect(r.blanks.length + r.questions.length, poem).toBe(REVIEW_TASKS);
      expect(r.questions.length, poem).toBeLessThanOrEqual(poemOf(poem).blanks.length ? 3 : 5);
      for (const round of [...r.blanks, ...r.questions]) {
        expect(
          round.options.map((o) => o[0]),
          poem,
        ).toContain(round.answer[0]);
        expect(round.options.length, poem).toBeGreaterThanOrEqual(2);
      }
    }
    for (const book of BOOK_CODES) {
      const r = reviewOf(game({ kind: 'book', book, choices: 3 } as never), plain);
      expect(r?.kind, book).toBe('book');
      if (r?.kind === 'book') expect(r.questions, book).toHaveLength(REVIEW_TASKS);
    }
  });

  it('игра с уровнями — на уровень выше нынешнего, но не выше четвёртого', () => {
    expect(reviewOf(game(maze), plain)).toEqual({ kind: 'harder', level: 2 });
    const levels = { start: 1, byKind: { maze: 3 } };
    expect(reviewOf(game(maze), { ...plain, levels })).toEqual({ kind: 'harder', level: 4 });
    const top = { start: 1, byKind: { maze: 4 } };
    expect(reviewOf(game(maze), { ...plain, levels: top })).toEqual({ kind: 'again' });
  });

  it('игра без уровней — просто ещё раз', () => {
    expect(reviewOf(game({ kind: 'tracing', shapes: ['1'] } as never), plain)).toEqual({
      kind: 'again',
    });
  });
});

describe('открыто после проверки — до конца дня', () => {
  const v = segment('v');
  const fresh: KidItem = { ...segment('n'), rest: undefined };

  it('сегодня — не отдыхает, завтра — снова пять заданий', () => {
    stubStore();
    expect(restingIn([v, fresh], v)).toBe(true);
    reviewed.add(v, '2026-11-01');
    reviewed.add(v, '2026-11-01');
    expect(reviewed.has(v, '2026-11-01')).toBe(true);
    expect(reviewed.has(v, '2026-11-02')).toBe(false);
    reviewed.add(v);
    expect(restingIn([v, fresh], v)).toBe(false);
    // Другой пункт с тем же id, но другого вида, — сам по себе.
    expect(reviewed.has({ kind: 'deck', id: 'v' })).toBe(false);
  });

  it('открыл одно — остальное пройденное по-прежнему отдыхает', () => {
    stubStore();
    const w = segment('w');
    reviewed.add(v);
    // Всё пройдено, кроме открытого: «новое» считается по пройденному, не по открытому.
    expect(restingIn([v, w], w)).toBe(false);
    expect(restingIn([v, w, fresh], w)).toBe(true);
  });

  it('без хранилища — без ошибок, открыть снова можно только через задания', () => {
    expect(() => reviewed.add(v)).not.toThrow();
    expect(reviewed.has(v)).toBe(false);
  });
});

describe('фразы совёнка', () => {
  it('по полу ребёнка и заранее нейроголосом', () => {
    expect(reviewAsk('f')).toBe(
      'Ты это уже прошла! Если интересно ещё раз — выполни пять заданий.',
    );
    expect(reviewHarder('m')).toBe('Ты уже это прошёл — давай посложнее!');
    const playlist = {
      quiz: { options: 2, questions: 3 },
      items: [],
      phrases: {},
      gender: 'f',
    } as unknown as KidPlaylist;
    const said = appPhrases(playlist).map((s) => s.text);
    for (const p of reviewPhrases('f')) expect(said).toContain(p);
  });
});
