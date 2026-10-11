// Копии снимков — в кабинет родителя, по одной, по порядку; без связи — позже.
import { kidApi } from '../api';
import { listCaptures, markUploaded } from './store';

let running = false;

/** Отправить всё, что ещё не на сервере. */
export async function flushCaptures() {
  if (running) return;
  running = true;
  try {
    const pending = (await listCaptures()).filter((c) => !c.uploaded).reverse();
    for (const c of pending) {
      const status = await kidApi.uploadCapture(c).catch(() => 0);
      // Принято — или сервер не примет никогда (лимит, тип, размер): больше не пытаемся.
      if (status === 201 || (status >= 400 && status < 500 && status !== 401 && status !== 403))
        await markUploaded(c.id);
      else break; // нет связи или камера сейчас закрыта — попробуем позже
    }
  } finally {
    running = false;
  }
}
