// Выбранный ребёнок (этап 33) — один на весь кабинет: выбрали на «Главной» или на странице
// ребёнка — «План», «Привычки», «Сон», «Прогресс» открываются на нём же. Помнится между заходами.
import { useSyncExternalStore } from 'react';
import { useChildren } from '../queries';

const KEY = 'kp-child';
let current: string | null = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();

export function setCurrentChild(id: string | null) {
  current = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // без памяти — до перезагрузки
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Выбранный ребёнок (null — «все»), как он сохранён. */
export const useCurrentChildRaw = () => useSyncExternalStore(subscribe, () => current);

/**
 * Ребёнок для страниц про одного ребёнка: выбранный, если он ещё есть в семье, иначе первый.
 * Возвращает [id, выбрать].
 */
export function useCurrentChild(): [string | null, (id: string) => void] {
  const raw = useCurrentChildRaw();
  const kids = useChildren().data;
  const id = kids?.some((k) => k.id === raw) ? raw : (kids?.[0]?.id ?? null);
  return [id, setCurrentChild];
}
