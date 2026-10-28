// Сбои приложения — на сервер (этап 51): родитель видит в «Устройствах», что сломалось на
// телефоне. Без имён и личных данных — только текст ошибки, экран и сборка. Без связи копятся
// (до 10 разных) и уходят, когда она появится.
import { API_PREFIX } from '@kidsplus/shared';
import {
  APP_ERROR_LIMITS,
  type AppErrorKind,
  type AppErrorReport,
} from '@kidsplus/shared/app-errors';

declare const __KID_BUILD__: string | undefined;

const KEY = 'kp-errors';
const MAX_QUEUE = 10;
/** Ошибки идут пачкой: одинаковые за эти секунды складываются в одну. */
const SEND_DELAY_MS = 3000;
/** Отправок за запуск — не больше: зациклившаяся ошибка не забьёт сеть. */
const MAX_SENDS = 20;

/** Шум, по которому ничего не понять или который не мешает ребёнку. */
const IGNORED = [
  /^Script error\.?$/,
  /ResizeObserver loop/,
  /interrupted by (a new load request|a call to pause)/,
];

const build = typeof __KID_BUILD__ === 'string' ? __KID_BUILD__ : null;
let screen: string | null = null;
let queue: AppErrorReport[] = load();
let timer: ReturnType<typeof setTimeout> | null = null;
let sends = 0;
let sending = false;

/** Где сейчас ребёнок (экран и вид игры) — приложение сообщает при каждой смене. */
export function setErrorScreen(s: string | null) {
  screen = s ? s.slice(0, APP_ERROR_LIMITS.screen) : null;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Текст и стек из того, что бросили: Error, строка или что угодно ещё. */
export function errorText(reason: unknown): { message: string; stack: string | null } {
  if (reason instanceof Error) {
    const message = reason.message ? `${reason.name}: ${reason.message}` : reason.name;
    return { message, stack: reason.stack ?? null };
  }
  if (typeof reason === 'string') return { message: reason, stack: null };
  try {
    return { message: JSON.stringify(reason) ?? String(reason), stack: null };
  } catch {
    return { message: String(reason), stack: null };
  }
}

/** Добавить в очередь: та же ошибка — +1 к счётчику, новая — в конец (не больше 10 разных). */
export function enqueue(list: AppErrorReport[], e: AppErrorReport): AppErrorReport[] {
  const i = list.findIndex((x) => x.kind === e.kind && x.message === e.message);
  if (i >= 0)
    return list.map((x, j) =>
      j === i ? { ...x, count: Math.min(10_000, x.count + e.count), screen: e.screen } : x,
    );
  return [...list, e].slice(-MAX_QUEUE);
}

/** Что осталось после отправки: пока она шла, те же ошибки могли повториться ещё. */
export function sent(list: AppErrorReport[], batch: AppErrorReport[]): AppErrorReport[] {
  return list.flatMap((e) => {
    const done = batch.find((b) => b.kind === e.kind && b.message === e.message);
    if (!done) return [e];
    return e.count > done.count ? [{ ...e, count: e.count - done.count }] : [];
  });
}

/** Сообщить о сбое. Ничего не бросает — сама отправка не должна ломать приложение. */
export function reportError(kind: AppErrorKind, reason: unknown, detail?: string) {
  try {
    const d = errorText(reason);
    const message = clip(d.message.trim() || 'Без текста', APP_ERROR_LIMITS.message);
    if (IGNORED.some((re) => re.test(message))) return;
    const stack = detail ?? d.stack;
    queue = enqueue(queue, {
      kind,
      message,
      stack: stack ? clip(stack, APP_ERROR_LIMITS.stack) : null,
      screen,
      build,
      count: 1,
      at: new Date().toISOString(),
    });
    save();
    schedule();
  } catch {
    // Отчёт не получился — не страшно.
  }
}

function schedule(delay = SEND_DELAY_MS) {
  if (timer || !queue.length) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

async function flush() {
  if (sending || !queue.length || sends >= MAX_SENDS) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  sending = true;
  sends++;
  const batch = queue;
  try {
    const res = await fetch(`${API_PREFIX}/kid/errors`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ errors: batch }),
      // Ошибка экрана — и через 10 с перезагрузка: отчёт не должен оборваться.
      keepalive: true,
    });
    // Ушло, телефон не привязан или сервер не принял — эти больше не шлём.
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      queue = sent(queue, batch);
      save();
    }
  } catch {
    // Нет связи — отправим, когда появится.
  } finally {
    sending = false;
  }
  schedule();
}

function load(): AppErrorReport[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as AppErrorReport[]) : [];
    return Array.isArray(list) ? list.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    if (queue.length) localStorage.setItem(KEY, JSON.stringify(queue));
    else localStorage.removeItem(KEY);
  } catch {
    // Хранилище недоступно — очередь живёт до перезапуска.
  }
}

/** Ловить всё, что не поймано, и отправить накопленное без связи. Один раз при запуске. */
export function startErrorReports() {
  addEventListener('error', (e) => reportError('error', e.error ?? e.message));
  addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
  addEventListener('online', () => schedule(0));
  schedule(0);
}
