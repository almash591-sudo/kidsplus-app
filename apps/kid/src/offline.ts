// Работа без интернета (этап 15г): пока сеть есть — заранее скачиваем картинки и озвучку
// занятий (их кэширует service worker), а события прогресса без сети копим и отправляем потом.
import { API_PREFIX } from '@kidsplus/shared';
import type { KidEventRequest, KidPlaylist, Speech } from '@kidsplus/shared/api';
import { bookOf, bookPictures } from '@kidsplus/shared/books';
import { mediaUrl } from '@kidsplus/shared/api';
import { gameImageIds } from '@kidsplus/shared/games';

/** Все файлы занятий: картинки карточек, вопросов и игр, озвучка слов, вопросов и похвалы. */
export function playlistMedia(p: KidPlaylist): string[] {
  const out = new Set<string>();
  const speech = (s: Speech | null | undefined) => s?.audioUrl && out.add(s.audioUrl);
  for (const item of p.items) {
    if (item.kind === 'deck') {
      out.add(item.coverUrl);
      for (const c of item.cards) {
        out.add(c.imageUrl);
        speech(c.word);
        speech(c.translation);
        speech(c.question);
      }
    } else if (item.kind === 'segment') {
      for (const q of item.questions) {
        speech(q.prompt);
        for (const o of q.options) out.add(o.imageUrl);
      }
    } else {
      for (const id of gameImageIds(item.spec)) out.add(mediaUrl(id));
      // Книжка (этап 52): её сцены не в сборке приложения — качаем заранее всю книжку.
      if (item.spec.kind === 'book')
        for (const u of bookPictures(bookOf(item.spec.book))) out.add(u);
    }
  }
  // Колыбельные мамы (малыш) — в машине без интернета нужнее всего.
  for (const l of p.lullabies ?? []) out.add(l.url);
  for (const list of [p.phrases, p.phrasesEn])
    for (const kind of ['correct', 'retry', 'done'] as const) list[kind].forEach(speech);
  // Только свои файлы (сторонние картинки — например, обложки YouTube — не кэшируем).
  return [...out].filter((u) => u.startsWith(`${API_PREFIX}/media/`) || u.startsWith(BOOKS_PATH));
}

/** Кэш файлов — тот же, что у service worker в браузере (vite.config.ts). */
export const MEDIA_CACHE = 'kidsplus-media';
/** Сцены книжек — свой кэш (vite.config.ts): статика приложения, а не файлы сервера. */
export const BOOKS_CACHE = 'kidsplus-books';
const BOOKS_PATH = '/books/';
const hasCaches = () => typeof caches !== 'undefined';

const warmed = new Set<string>();
let queue: string[] = [];
let running = 0;
const PARALLEL = 3;

/** Скачать один файл в кэш (если его там ещё нет). */
async function warmOne(url: string) {
  const book = url.startsWith(BOOKS_PATH);
  const cache = await caches.open(book ? BOOKS_CACHE : MEDIA_CACHE);
  if (await cache.match(url)) return;
  const r = await fetch(url, { credentials: 'same-origin' });
  // Нет такой сцены — веб-сервер отдаёт index.html с кодом 200: такое не кладём.
  if (r.ok && (!book || r.headers.get('content-type')?.startsWith('image/')))
    await cache.put(url, r);
}

/** Скачать файлы в фоне по три за раз. Уже скачанные — пропуск; без сети — в следующий раз. */
export function warmMedia(urls: readonly string[]) {
  // Без Cache API (не https, тесты) — не прогреваем: положить файлы некуда.
  if (typeof fetch === 'undefined' || !hasCaches()) return;
  for (const u of urls)
    if (!warmed.has(u)) {
      warmed.add(u);
      queue.push(u);
    }
  while (running < PARALLEL && queue.length) {
    const u = queue.shift()!;
    running++;
    void warmOne(u)
      .catch(() => warmed.delete(u))
      .finally(() => {
        running--;
        warmMedia([]);
      });
  }
}

/**
 * Файл из кэша как ссылка blob: (вызвавший освобождает её через URL.revokeObjectURL);
 * нет в кэше — null. Так картинки и звук работают и без сети, если были скачаны заранее.
 */
export async function cachedObjectUrl(url: string): Promise<string | null> {
  if (!hasCaches() || !url.startsWith(`${API_PREFIX}/media/`)) return null;
  try {
    const hit = await (await caches.open(MEDIA_CACHE)).match(url);
    return hit ? URL.createObjectURL(await hit.blob()) : null;
  } catch {
    return null;
  }
}

/** Для тестов. */
export function resetWarm() {
  warmed.clear();
  queue = [];
  running = 0;
}

// ─── Очередь событий ─────────────────────────────────────────────────────────

const OUTBOX = 'kidsplus.outbox';
const OUTBOX_MAX = 500;

function readOutbox(): KidEventRequest[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]') as KidEventRequest[];
  } catch {
    return [];
  }
}
function writeOutbox(events: KidEventRequest[]) {
  try {
    if (events.length) localStorage.setItem(OUTBOX, JSON.stringify(events.slice(-OUTBOX_MAX)));
    else localStorage.removeItem(OUTBOX);
  } catch {
    // хранилище недоступно
  }
}

const post = (event: KidEventRequest) =>
  fetch(`${API_PREFIX}/kid/events`, {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });

/** Отправить событие; без сети (или сервер не ответил) — в очередь до следующей связи. */
export function sendEventQueued(event: KidEventRequest): Promise<void> {
  return post(event)
    .then((r) => {
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      void flushOutbox();
    })
    .catch(() => writeOutbox([...readOutbox(), event]));
}

let flushing = false;
/** Отправить накопленное по порядку; на первой ошибке — остановиться до следующего раза. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let pending = readOutbox();
    while (pending.length) {
      const r = await post(pending[0]!);
      if (r.status >= 500) break;
      pending = pending.slice(1);
      writeOutbox(pending);
    }
  } catch {
    // нет сети — в следующий раз
  } finally {
    flushing = false;
  }
}

/** Связь вернулась — отправить очередь; и раз в минуту на всякий случай. */
export function startOutbox() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => void flushOutbox());
  void flushOutbox();
  setInterval(() => void flushOutbox(), 60_000);
}
