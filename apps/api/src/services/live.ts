// Живой канал (SSE): к телефону ребёнка — «день изменился» (пауза, «+10 минут») и звонки;
// к кабинету родителя — звонки. Подписчики хранятся в памяти: api запущен в одном экземпляре.
// Ключ — id ребёнка (все его телефоны) или «p:<id родителя>».
import type { CallEvent } from '@kidsplus/shared/calls';
import type { MonitorEvent } from '@kidsplus/shared/monitor';

/** null — «день изменился»; иначе событие звонка. */
export type LiveEvent = CallEvent | MonitorEvent | null;
type Listener = (event: LiveEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(key: string, fn: Listener) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(key);
  };
}

/** Сообщить телефонам ребёнка, что день изменился. */
export function notify(childId: string) {
  listeners.get(childId)?.forEach((fn) => fn(null));
}

/** Событие звонка подписчикам ключа. */
export function send(key: string, event: CallEvent | MonitorEvent) {
  listeners.get(key)?.forEach((fn) => fn(event));
}

/** Строка SSE для события. */
export const sse = (event: LiveEvent) =>
  event === null
    ? 'event: day\ndata: {}\n\n'
    : `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
