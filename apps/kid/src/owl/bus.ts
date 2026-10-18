// Большие события для живого совёнка: урок пройден, все дела сделаны. Совёнок живёт поверх меню —
// если событие случилось внутри урока или «Моих дел», он похвалит, когда ребёнок вернётся в меню.

let pending = false;
const listeners = new Set<() => void>();

export const owlBus = {
  /** Похвалить: подлететь почти во весь экран. */
  praise() {
    pending = true;
    listeners.forEach((l) => l());
  },
  /** Забрать отложенную похвалу (true — была). */
  take(): boolean {
    const was = pending;
    pending = false;
    return was;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
