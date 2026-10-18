// Автообновление PWA (2026-10-18): киоск не закрывается сутками, и новая версия с сервера до
// телефона не доходила. Приложение сверяет имя своего главного скрипта (в нём хэш сборки) с тем,
// что сейчас в index.html на сервере, и перезагружается, когда это безопасно.

const ENTRY = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** Главный скрипт сборки из HTML; в режиме разработки (Vite dev) его нет — null. */
export function entryFromHtml(html: string): string | null {
  return ENTRY.exec(html)?.[0] ?? null;
}

/** Главный скрипт открытой страницы. */
export function currentEntry(doc: Document): string | null {
  for (const s of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'))) {
    const m = ENTRY.exec(s.getAttribute('src') ?? '');
    if (m) return m[0];
  }
  return null;
}

/** На сервере другая сборка? Нет сети или ответа — false. */
export async function hasNewVersion(current: string, fetchFn: typeof fetch = fetch) {
  try {
    const res = await fetchFn('/', { cache: 'no-store', headers: { accept: 'text/html' } });
    if (!res.ok) return false;
    const latest = entryFromHtml(await res.text());
    return latest !== null && latest !== current;
  } catch {
    return false;
  }
}

export interface AutoUpdateOptions {
  /** Можно ли перезагрузить прямо сейчас (ребёнок не занят). */
  canReload: () => boolean;
  reload?: () => void;
  /** Как часто спрашивать сервер. */
  checkMs?: number;
  /** Нашли новую версию, но сейчас нельзя — как часто проверять, не стало ли можно. */
  waitMs?: number;
  fetchFn?: typeof fetch;
  doc?: Document;
}

/** Запускает проверку; возвращает функцию остановки. Без сборки (dev) ничего не делает. */
export function startAutoUpdate(o: AutoUpdateOptions): () => void {
  const doc = o.doc ?? document;
  const current = currentEntry(doc);
  if (!current) return () => {};
  const reload = o.reload ?? (() => window.location.reload());
  let pending = false;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!pending) pending = await hasNewVersion(current, o.fetchFn);
      if (pending && o.canReload()) {
        stop();
        reload();
      }
    } finally {
      busy = false;
    }
  };
  const check = setInterval(() => void tick(), o.checkMs ?? 5 * 60_000);
  const wait = setInterval(() => pending && void tick(), o.waitMs ?? 30_000);
  const onVisible = () => doc.visibilityState === 'visible' && void tick();
  doc.addEventListener('visibilitychange', onVisible);
  function stop() {
    clearInterval(check);
    clearInterval(wait);
    doc.removeEventListener('visibilitychange', onVisible);
  }
  return stop;
}
