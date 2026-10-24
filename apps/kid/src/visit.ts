// Что нравится ребёнку (этап 44): открыл ли сам, сколько пробыл, где бросил — для «Прогресса».
import { useEffect, useRef } from 'react';

/** Откуда открыт пункт: урок «Сегодня» или сам выбрал в разделе. */
export type From = 'lesson' | 'free';

/** `{ from }` для события — у экрана малыша и в превью источника нет. */
export const fromPayload = (from: From | undefined): { from?: From } => (from ? { from } : {});

/**
 * Открытие экрана: `start` звучит один раз после монтирования (в разработке StrictMode
 * монтирует дважды — первый раз отменяется). Возвращает «сколько секунд открыт экран».
 */
export function useVisit(start: () => void): () => number {
  const began = useRef<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      began.current = Date.now();
      start();
    }, 0);
    return () => clearTimeout(t);
    // Экран живёт с одними параметрами — старт только при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return () => (began.current === null ? 0 : Math.round((Date.now() - began.current) / 1000));
}
