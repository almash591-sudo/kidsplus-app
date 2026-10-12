// Пройденные уроки (музыка, буквы) — на этом телефоне: у каждого ребёнка свой телефон.
// Хранилище может быть недоступно — тогда просто без звёздочек.

const KEY = 'kidsplus.done';
const TRIED_KEY = 'kidsplus.tried';

/** Столько раз ушёл из урока, не пройдя его, — дорожка зовёт дальше, урок подождёт. */
export const STUCK_AFTER = 2;

export function doneIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markDone(id: string) {
  try {
    const ids = doneIds();
    ids.add(id);
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // нет хранилища — не страшно
  }
}

/** Сколько раз ребёнок уходил из урока, не пройдя его. */
export function triedCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TRIED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function markTried(id: string) {
  try {
    const all = triedCounts();
    all[id] = (all[id] ?? 0) + 1;
    localStorage.setItem(TRIED_KEY, JSON.stringify(all));
  } catch {
    // нет хранилища — не страшно
  }
}
