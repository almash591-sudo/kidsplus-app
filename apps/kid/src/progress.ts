// Пройденные уроки (музыка) — на этом телефоне: у каждого ребёнка свой телефон.
// Хранилище может быть недоступно — тогда просто без звёздочек.

const KEY = 'kidsplus.done';

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
