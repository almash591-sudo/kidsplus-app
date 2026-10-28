// Этап 52: книжки — с какой страницы читать, полка, вопросы, озвучка заранее, картинки.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { KidPlaylist } from '@kidsplus/shared/api';
import { BOOK_CODES, bookOf, bookPictures, type Book } from '@kidsplus/shared/books';
import { gameSpec } from '@kidsplus/shared/games';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appPhrases, bookPhrases } from '../phrases';
import { playlistMedia } from '../offline';
import {
  chapterQuestions,
  markOf,
  QUESTIONS_PER_CHAPTER,
  saveMark,
  shelfState,
  startOf,
  today,
  wordAt,
} from './bookPlan';

const kot = bookOf('kotPetuh');
/** Длинная книжка из трёх глав — для правил «по главе в день». */
const long: Book = {
  ...kot,
  chapters: [0, 1, 2].map((i) => ({ ...kot.chapters[0]!, title: `Глава ${i + 1}` })),
};
const pages = kot.chapters[0]!.pages.length;

describe('закладка: с какой страницы читать', () => {
  it('не открывали — с начала; ушёл посреди — с той же страницы', () => {
    expect(startOf(kot, undefined)).toEqual({ chapter: 0, page: 0 });
    expect(startOf(kot, { chapter: 0, page: 5 })).toEqual({ chapter: 0, page: 5 });
    // Испорченная закладка — в пределах книжки.
    expect(startOf(kot, { chapter: 7, page: 999 })).toEqual({ chapter: 0, page: pages - 1 });
    expect(startOf(kot, { chapter: -1, page: -3 })).toEqual({ chapter: 0, page: 0 });
  });

  it('глава дочитана: сегодня — она же сначала, завтра — следующая, после последней — первая', () => {
    const day = '2026-10-28';
    expect(startOf(long, { chapter: 1, page: 0, day }, day)).toEqual({ chapter: 1, page: 0 });
    expect(startOf(long, { chapter: 1, page: 0, day }, '2026-10-29')).toEqual({
      chapter: 2,
      page: 0,
    });
    expect(startOf(long, { chapter: 2, page: 0, day }, '2026-10-29')).toEqual({
      chapter: 0,
      page: 0,
    });
    // Короткая книжка на другой день — снова с начала.
    expect(startOf(kot, { chapter: 0, page: 0, day }, '2026-10-29')).toEqual({
      chapter: 0,
      page: 0,
    });
  });

  it('сегодняшний день — по часам телефона', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('полка: новая, читаем, прочитана', () => {
    expect(shelfState(kot, undefined)).toBe('new');
    expect(shelfState(kot, { chapter: 0, page: 3 })).toBe('reading');
    expect(shelfState(kot, { chapter: 0, page: 0, day: '2026-10-28' })).toBe('read');
    expect(shelfState(long, { chapter: 1, page: 0, day: '2026-10-28' })).toBe('reading');
    expect(shelfState(long, { chapter: 2, page: 0, day: '2026-10-28' })).toBe('read');
  });
});

describe('закладки — на телефоне', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('у каждой книжки своя; мусор в хранилище не ломает', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(markOf('kotPetuh')).toBeUndefined();
    saveMark('kotPetuh', { chapter: 0, page: 4 });
    saveMark('hrabryZayac', { chapter: 0, page: 0, day: '2026-10-28' });
    expect(markOf('kotPetuh')).toEqual({ chapter: 0, page: 4 });
    expect(markOf('hrabryZayac')).toEqual({ chapter: 0, page: 0, day: '2026-10-28' });
    store.set('kidsplus.books', '{"kotPetuh":{"page":"x"}}');
    expect(markOf('kotPetuh')).toBeUndefined();
    store.set('kidsplus.books', 'не json');
    expect(markOf('kotPetuh')).toBeUndefined();
  });

  it('без хранилища — с начала, без ошибок', () => {
    expect(markOf('kotPetuh')).toBeUndefined();
    expect(() => saveMark('kotPetuh', { chapter: 0, page: 1 })).not.toThrow();
  });
});

describe('вопросы в конце главы', () => {
  it('две, по порядку сюжета; вариантов — сколько задано, ответ среди них', () => {
    const all = kot.chapters[0]!.questions;
    for (const choices of [2, 3, 4]) {
      const rounds = chapterQuestions('kotPetuh', 0, choices);
      expect(rounds).toHaveLength(QUESTIONS_PER_CHAPTER);
      const order = rounds.map((r) => all.indexOf(r.question));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      for (const r of rounds) {
        expect(r.options).toHaveLength(choices);
        expect(r.options).toContainEqual(r.answer);
      }
    }
    expect(chapterQuestions('kotPetuh', 5, 3)).toEqual([]);
  });
});

describe('«Прочитай сам»: слово в тексте страницы', () => {
  it('целое слово без учёта регистра; часть другого слова — не оно', () => {
    const text = ['Жила-была лягушка.', 'Утки летели на юг, а Лягушка смотрела.'];
    expect(wordAt(text, 'Лягушка')).toEqual({ line: 0, from: 10, to: 17 });
    expect(wordAt(text, 'юг')).toEqual({ line: 1, from: 15, to: 17 });
    expect(wordAt(['Лягушка-путешественница!'], 'лягушка')).toEqual({ line: 0, from: 0, to: 7 });
    expect(wordAt(text, 'ут')).toBeNull();
    expect(wordAt(text, 'кот')).toBeNull();
  });
});

describe('книжки: озвучка и картинки', () => {
  const spec = gameSpec.parse({ kind: 'book', book: 'kotPetuh' });

  it('всё, что прозвучит, — заранее нейроголосом', () => {
    const playlist: KidPlaylist = {
      quiz: { options: 2, questions: 3 },
      items: [{ kind: 'interactive', id: 'b1', category: 'books', spec }],
      phrases: { correct: [], retry: [], done: [] },
      phrasesEn: { correct: [], retry: [], done: [] },
      immersion: false,
      serverVoice: true,
    };
    const texts = appPhrases(playlist).map((p) => p.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        'Книжки!',
        'Русская народная сказка «Кот, петух и лиса».',
        'Нажми на стрелку — что там дальше?',
        'Продолжаем с закладки!',
        'Вот и сказке конец, а кто слушал — молодец!',
        ...kot.chapters[0]!.pages.flatMap((p) => p.text),
        'Кто пел песенку под окошком?',
      ]),
    );
    for (const code of BOOK_CODES)
      for (const t of bookPhrases(code)) expect(t.length, t).toBeLessThanOrEqual(200);
  });

  it('нарисованная книжка — каждая сцена лежит файлом; скачивается заранее целиком', () => {
    const file = (url: string) => fileURLToPath(new URL(`../../public${url}`, import.meta.url));
    for (const code of BOOK_CODES)
      for (const url of bookPictures(bookOf(code))) expect(existsSync(file(url)), url).toBe(true);
    // Ещё не нарисована — качать нечего.
    const playlist = {
      items: [{ kind: 'interactive', id: 'b1', category: 'books', spec }],
      phrases: { correct: [], retry: [], done: [] },
      phrasesEn: { correct: [], retry: [], done: [] },
    } as unknown as KidPlaylist;
    expect(playlistMedia(playlist)).toEqual(bookPictures(kot));
  });
});
