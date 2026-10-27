// Перерыв для глаз (этап 50): телефон считает минуты у экрана; набралось — после текущего
// мультика или игры совёнок объявляет отдых. Начало, просьбу «ещё» и ответ родителя хранит
// сервер — телефон сверяется с ним. Счёт и идущий перерыв помнятся и после перезапуска.
import type { EyeBreak, EyeBreakAsk } from '@kidsplus/shared/schedule';

const KEY = 'kp-eye-break';
/** Промежуток между отсчётами длиннее — не экран (сон телефона, свёрнуто). */
export const MAX_TICK_MS = 10_000;
/** Набралось и ещё столько сверху (длинная игра без конца) — отдых сразу, не дожидаясь конца. */
export const OVERDUE_MS = 10 * 60_000;

/** Идущий перерыв. id — начало с сервера (ISO) или local-… без связи. */
export interface LocalBreak {
  id: string;
  until: number;
  ask: EyeBreakAsk | null;
}

export interface ScreenTime {
  /** Секунд у экрана с прошлого отдыха. */
  used: number;
  /** Последний отсчёт (мс). */
  at: number;
  brk: LocalBreak | null;
  /** Последний закончившийся перерыв: его не показываем снова. */
  ended: string | null;
}

const EMPTY: ScreenTime = { used: 0, at: 0, brk: null, ended: null };

/** Добавить время экрана к now. Долго без экрана (сколько длится отдых) — глаза уже отдохнули. */
export function addScreen(s: ScreenTime, now: number, restMin: number): ScreenTime {
  const gap = now - s.at;
  const rested = gap < 0 || gap >= restMin * 60_000;
  const used = (rested ? 0 : s.used) + (gap > 0 && gap <= MAX_TICK_MS ? gap / 1000 : 0);
  return { ...s, used, at: now };
}

/** Что сказать, когда перерыв сменился: разрешили, отказали, закончился. */
export type BreakNews = 'yes' | 'no' | 'end' | null;

/** Сверка с сервером: свой перерыв продлевается или кончается, чужой (после перезапуска) — подхватывается. */
export function syncBreak(
  s: ScreenTime,
  server: EyeBreak | null,
  now: number,
): { next: ScreenTime; news: BreakNews } {
  if (!server) return { next: { ...s, brk: null }, news: null };
  const cur = server.current;
  if (!cur) return { next: s, news: null };
  const until = now + cur.secondsLeft * 1000;
  const mine = s.brk?.id === cur.id;
  if (cur.secondsLeft > 0) {
    if (mine) {
      const news = s.brk!.ask !== 'no' && cur.ask === 'no' ? 'no' : null;
      return { next: { ...s, brk: { id: cur.id, until, ask: cur.ask } }, news };
    }
    if (cur.id === s.ended) return { next: s, news: null };
    return { next: { ...s, brk: { id: cur.id, until, ask: cur.ask } }, news: null };
  }
  if (mine) return { next: finish(s, now), news: cur.ask === 'yes' ? 'yes' : 'end' };
  return { next: s, news: null };
}

/** Перерыв кончился (время вышло или разрешили): счёт с нуля. */
export function finish(s: ScreenTime, now: number): ScreenTime {
  return { used: 0, at: now, brk: null, ended: s.brk?.id ?? s.ended };
}

export const screenTime = {
  get(): ScreenTime {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return EMPTY;
      const s = JSON.parse(raw) as Partial<ScreenTime>;
      return {
        used: typeof s.used === 'number' ? s.used : 0,
        at: typeof s.at === 'number' ? s.at : 0,
        brk: s.brk && typeof s.brk.until === 'number' ? s.brk : null,
        ended: typeof s.ended === 'string' ? s.ended : null,
      };
    } catch {
      return EMPTY;
    }
  },
  set(s: ScreenTime) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // без памяти — после перезапуска счёт начнётся заново
    }
  },
};
