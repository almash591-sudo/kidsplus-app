// Книжки (этап 52): с какой главы и страницы читать и что телефон помнит о прочитанном.
// Отдельно от Book.tsx: чистые функции — для юнит-тестов.
import { bookOf, type Book, type BookCode } from '@kidsplus/shared/books';
import type { PoemChoice } from '@kidsplus/shared/poems';
import { shuffled } from './common';
import type { QuestionRound } from './poemPlan';

/** Вопросов в конце главы — коротко: малыш уже долго слушал. */
export const QUESTIONS_PER_CHAPTER = 2;

/**
 * Закладка книжки. Без day — читаем: глава chapter, страница page. С day — глава chapter
 * дочитана в этот день: сегодня откроют снова — перечитаем её, завтра — следующую.
 */
export interface BookMark {
  chapter: number;
  page: number;
  day?: string;
}

/** Сегодняшний день по часам телефона: «2026-10-28». */
export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** С чего начать: закладка — с неё; глава дочитана сегодня — она же; вчера — следующая (после последней — снова первая). */
export function startOf(
  book: Book,
  mark: BookMark | undefined,
  day = today(),
): { chapter: number; page: number } {
  const chapters = book.chapters;
  if (!mark) return { chapter: 0, page: 0 };
  const chapter = Math.min(Math.max(0, Math.floor(mark.chapter)), chapters.length - 1);
  if (mark.day === undefined) {
    const pages = chapters[chapter]!.pages.length;
    return { chapter, page: Math.min(Math.max(0, Math.floor(mark.page)), pages - 1) };
  }
  if (mark.day === day) return { chapter, page: 0 };
  return { chapter: (chapter + 1) % chapters.length, page: 0 };
}

/** Что на полке: новая (не открывали), читаем (закладка) или прочитана. */
export function shelfState(book: Book, mark: BookMark | undefined): 'new' | 'reading' | 'read' {
  if (!mark) return 'new';
  if (mark.day === undefined) return 'reading';
  // Длинная книжка, дочитана не последняя глава, — читаем дальше.
  return mark.chapter + 1 < book.chapters.length ? 'reading' : 'read';
}

const options = (answer: PoemChoice, wrong: readonly PoemChoice[], choices: number) =>
  shuffled([answer, ...shuffled(wrong).slice(0, Math.max(1, choices - 1))]);

/** Вопросы в конце главы — по порядку сюжета, варианты вперемешку. */
export function chapterQuestions(
  code: BookCode,
  chapter: number,
  choices: number,
): QuestionRound[] {
  const all = bookOf(code).chapters[chapter]?.questions ?? [];
  const picked = shuffled(all).slice(0, QUESTIONS_PER_CHAPTER);
  return all
    .filter((q) => picked.includes(q))
    .map((question) => ({
      question,
      answer: question.answer,
      options: options(question.answer, question.wrong, choices),
    }));
}

// ─── Закладки (на телефоне ребёнка) ─────────────────────────────────────────

const STORE = 'kidsplus.books';

function read(): Partial<Record<BookCode, BookMark>> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return v && typeof v === 'object' ? (v as Partial<Record<BookCode, BookMark>>) : {};
  } catch {
    return {};
  }
}

export const markOf = (code: BookCode): BookMark | undefined => {
  const m = read()[code];
  return m && typeof m.chapter === 'number' && typeof m.page === 'number' ? m : undefined;
};

export function saveMark(code: BookCode, mark: BookMark) {
  const all = read();
  all[code] = mark;
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // нет хранилища — в следующий раз начнём с начала главы
  }
}
