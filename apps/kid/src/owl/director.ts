// Живой совёнок (этап 32): какую сценку показать сейчас — по тому, что происходит с ребёнком.
// Чистая логика без DOM: слой LiveOwl спрашивает раз в несколько секунд.

export type PerchTarget = 'lesson' | 'habits';

export type OwlScene =
  /** Прилетает и садится на кнопку, к которой зовёт. */
  | { kind: 'perch'; target: PerchTarget }
  /** Подлетает близко и стучит по стеклу: ребёнок вернулся или долго молчит. */
  | { kind: 'knock' }
  /** Прячется за плиткой и выглядывает; касание — «ку-ку!». */
  | { kind: 'peek' }
  /** Почти во весь экран: большое событие (урок пройден, дела сделаны). */
  | { kind: 'praise' }
  /** Вечером зевает. */
  | { kind: 'yawn' };

export interface OwlContext {
  now: number;
  /** Когда ребёнок последний раз касался экрана. */
  touchedAt: number;
  /** Когда закончилась прошлая сценка (0 — ещё не было). */
  lastSceneAt: number;
  /** Ребёнок только что вернулся в приложение после долгого перерыва. */
  returned: boolean;
  /** На экране есть урок, к которому можно позвать. */
  hasLesson: boolean;
  /** Есть несделанные дела этого времени дня. */
  habitsDue: boolean;
  /** Вечер: скоро спать. */
  evening: boolean;
  random: () => number;
}

/** Сценки сами по себе — не чаще раза в минуту. */
export const SCENE_GAP_MS = 60_000;
/** Сколько ребёнок ничего не нажимает, прежде чем совёнок позовёт к уроку. */
export const IDLE_LESSON_MS = 45_000;
/** …и прежде чем постучит по стеклу. */
export const IDLE_KNOCK_MS = 2 * 60_000;
/** Перерыв, после которого возвращение встречают стуком. */
export const AWAY_KNOCK_MS = 2 * 60_000;
/** Прятки — когда ребёнок спокойно смотрит на меню. */
export const IDLE_PEEK_MS = 20_000;

export function pickScene(c: OwlContext): OwlScene | null {
  if (c.returned) return { kind: 'knock' };
  if (c.lastSceneAt && c.now - c.lastSceneAt < SCENE_GAP_MS) return null;
  const idle = c.now - c.touchedAt;
  if (idle >= IDLE_KNOCK_MS) return { kind: 'knock' };
  if (idle >= IDLE_LESSON_MS) {
    if (c.habitsDue) return { kind: 'perch', target: 'habits' };
    if (c.hasLesson) return { kind: 'perch', target: 'lesson' };
  }
  if (idle >= IDLE_PEEK_MS) {
    if (c.evening && c.random() < 0.4) return { kind: 'yawn' };
    if (c.random() < 0.5) return { kind: 'peek' };
  }
  return null;
}

/** Случайная фраза из списка. */
export const pick = <T>(list: readonly T[], random: () => number = Math.random): T =>
  list[Math.floor(random() * list.length) % list.length]!;
