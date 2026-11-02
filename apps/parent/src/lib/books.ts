// Книжки (этап 52) в кабинете: список для выбора — в редакторе игры и в «Книжке на ночь».
import { BOOK_CODES, bookOf, type BookCode, type BookGenre } from '@kidsplus/shared/books';

const BOOK_GENRES: [BookGenre, string][] = [
  ['folk', 'Народные сказки'],
  ['tale', 'Сказки писателей'],
  ['story', 'Рассказы'],
];

/** «2 главы», «5 глав». */
export const chaptersLabel = (n: number) => `${n} ${n < 5 ? 'главы' : 'глав'}`;

/** Библиотека книжек по жанрам, с возрастом; для ночи — и сколько глав (ночь — одна глава). */
export function bookOptions({ chapters = false } = {}) {
  return BOOK_GENRES.map(([genre, group]) => ({
    group,
    items: BOOK_CODES.filter((c) => bookOf(c).genre === genre).map((c) => {
      const b = bookOf(c);
      const n = b.chapters.length;
      const more = chapters && n > 1 ? `, ${chaptersLabel(n)}` : '';
      return {
        value: c,
        label: `${b.title}${b.author ? ` — ${b.author}` : ''} (с ${b.fromAge} лет${more})`,
      };
    }),
  })).filter((g) => g.items.length);
}

/** «Глава 2 «Лебедь»» — для выбора главы. */
export const chapterLabel = (code: BookCode, i: number) => {
  const title = bookOf(code).chapters[i]?.title;
  return `Глава ${i + 1}${title ? ` «${title}»` : ''}`;
};
