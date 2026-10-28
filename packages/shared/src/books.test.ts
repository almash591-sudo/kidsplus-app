import { describe, expect, it } from 'vitest';
import {
  bookAnnounce,
  BOOK_CODES,
  bookPictures,
  bookReads,
  BOOKS,
  chapterAnnounce,
  type Book,
} from './books';
import { gameSpec } from './games';
import { POEMS } from './poems';
import { syllableSplit } from './sounds';

describe('библиотека книжек', () => {
  for (const code of BOOK_CODES) {
    const b: Book = BOOKS[code];
    it(`${code}: страницы, сцены и вопросы сходятся`, () => {
      expect(b.chapters.length).toBeGreaterThan(0);
      expect(b.art[b.cover], 'обложка — одна из сцен').toBeDefined();
      const used = new Set([b.cover]);
      for (const c of b.chapters) {
        expect(c.pages.length).toBeGreaterThan(0);
        for (const p of c.pages) {
          expect(p.text.length).toBeGreaterThanOrEqual(1);
          expect(p.text.length).toBeLessThanOrEqual(3);
          // Каждое предложение — одна фраза голосу, в пределах /kid/speech.
          for (const t of p.text) {
            expect(t.trim(), t).toBe(t);
            expect(t.length, t).toBeLessThanOrEqual(200);
          }
          expect(b.art[p.picture], p.picture).toBeDefined();
          used.add(p.picture);
        }
        // Две на главу — столько и спросим (bookPlan.ts).
        expect(c.questions.length).toBeGreaterThanOrEqual(2);
        for (const q of c.questions) {
          expect(q.wrong.length).toBeGreaterThanOrEqual(3);
          const words = [q.answer[0], ...q.wrong.map((w) => w[0])];
          const pics = [q.answer[1], ...q.wrong.map((w) => w[1])];
          expect(new Set(words).size).toBe(words.length);
          expect(new Set(pics).size).toBe(pics.length);
        }
      }
      // Лишних сцен нет: каждую придётся рисовать.
      expect([...used].sort()).toEqual(Object.keys(b.art).sort());
      // У длинной книжки — названия глав.
      if (b.chapters.length > 1) for (const c of b.chapters) expect(c.title).toBeTruthy();
      expect(b.source.wikisource).toBeTruthy();
      expect(b.source.note).toMatch(/общественное достояние/);
      if (b.genre === 'folk') expect(b.author).toBeNull();
      else expect(b.author).toBeTruthy();
    });

    it(`${code}: «Прочитай сам» — слово на каждой странице или нигде`, () => {
      const pages = b.chapters.flatMap((c) => c.pages);
      const reads = bookReads(b);
      if (!reads.length) return;
      expect(reads.length, 'слово на каждой странице').toBe(pages.length);
      // Читать по слогам — старшим, после «Букв».
      expect(b.fromAge).toBeGreaterThanOrEqual(5);
      for (const p of pages) {
        const w = p.read!;
        expect(w, w).toMatch(/^[А-ЯЁа-яё]+$/u);
        // Слово стоит в тексте страницы целиком (не кусок другого слова).
        const inText = new RegExp(`(?<![а-яё])${w}(?![а-яё])`, 'iu');
        expect(p.text.join(' '), w).toMatch(inText);
        const parts = syllableSplit(w);
        expect(parts.length, w).toBeLessThanOrEqual(4);
        for (const part of parts) expect(part.length, w).toBeLessThanOrEqual(5);
      }
    });
  }

  it('сцены книжек не совпадают между собой и со сценами стихов', () => {
    const scenes = BOOK_CODES.flatMap((c) => Object.keys(BOOKS[c].art));
    expect(new Set(scenes).size).toBe(scenes.length);
    const titles = new Set(Object.values(POEMS).map((p) => p.title));
    for (const c of BOOK_CODES) expect(titles.has(BOOKS[c].title), BOOKS[c].title).toBe(false);
  });

  it('объявление: народная — «Русская народная сказка», авторская — автор и название', () => {
    expect(bookAnnounce(BOOKS.kotPetuh)).toBe('Русская народная сказка «Кот, петух и лиса».');
    expect(bookAnnounce(BOOKS.hrabryZayac)).toBe(
      'Дмитрий Мамин-Сибиряк. «Сказка про храброго Зайца — длинные уши, косые глаза, короткий хвост».',
    );
  });

  it('глава: у короткой книжки не объявляется, у длинной — порядковым словом', () => {
    expect(chapterAnnounce(BOOKS.kotPetuh, 0)).toBeNull();
    const one = BOOKS.kotPetuh.chapters[0]!;
    const long: Book = {
      ...BOOKS.kotPetuh,
      chapters: [
        { ...one, title: 'Дом' },
        { ...one, title: 'Лес' },
      ],
    };
    expect(chapterAnnounce(long, 0)).toBe('Глава первая. «Дом».');
    expect(chapterAnnounce(long, 1)).toBe('Глава вторая. «Лес».');
  });

  it('картинки для работы без сети — только нарисованные, каждая один раз', () => {
    expect(bookPictures(BOOKS.kotPetuh)).toEqual([]);
    const drawn = bookPictures({ ...BOOKS.kotPetuh, drawn: true });
    expect(drawn[0]).toBe('/books/kot-happy.webp');
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.sort()).toEqual(
      Object.keys(BOOKS.kotPetuh.art)
        .map((s) => `/books/${s}.webp`)
        .sort(),
    );
  });

  it('игра «Книжка»: по умолчанию листает ребёнок, вопросы есть, 3 варианта', () => {
    expect(gameSpec.parse({ kind: 'book', book: 'kotPetuh' })).toEqual({
      kind: 'book',
      book: 'kotPetuh',
      autoTurn: false,
      questions: true,
      choices: 3,
      readSelf: false,
    });
    expect(() => gameSpec.parse({ kind: 'book', book: 'нет такой' })).toThrow();
  });
});
