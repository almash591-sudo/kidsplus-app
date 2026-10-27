// Вопросы после видео обязательны (этап 50): закрыли приложение посреди них — при следующем
// открытии сначала они. Помним сам пункт: в уроке «Сегодня» его может не быть в списке ребёнка.
import type { KidItem } from '@kidsplus/shared/api';
import type { Subject } from '@kidsplus/shared/schedule';

const KEY = 'kp-quiz-due';
/** Старше — не возвращаем: к давнему видео вопросы уже ни к чему. */
export const QUIZ_DUE_MS = 3 * 60 * 60_000;

export type QuizSegment = Extract<KidItem, { kind: 'segment' }>;
export interface QuizDue {
  item: QuizSegment;
  /** Урок «Сегодня», из которого было видео (null — сам выбрал). */
  lesson: Subject | null;
  at: number;
}

export const quizDue = {
  set(item: QuizSegment, lesson: Subject | null, now = Date.now()) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ item, lesson, at: now } satisfies QuizDue));
    } catch {
      // без памяти — после перезапуска вопросы не вернутся, не страшно
    }
  },
  get(now = Date.now()): QuizDue | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const due = JSON.parse(raw) as QuizDue;
      const fresh = typeof due.at === 'number' && now - due.at < QUIZ_DUE_MS && due.at <= now;
      const ok = due.item?.kind === 'segment' && Array.isArray(due.item.questions);
      return fresh && ok && due.item.questions.length > 0 ? due : null;
    } catch {
      return null;
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // нечего очищать
    }
  },
};
