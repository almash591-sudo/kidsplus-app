// Нейроголос для фраз самого приложения: ссылки на готовые файлы с сервера.
// Пока файла нет — фразу говорит голос телефона, а сервер её озвучивает к следующему разу.
import { API_PREFIX } from '@kidsplus/shared';
import type { Speech } from '@kidsplus/shared/api';
import type { Phrase } from './phrases';

const urls = new Map<string, string>();
const queued = new Map<string, Phrase>();
let enabled = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Сколько раз переспрашивать сервер о ещё не готовых фразах. */
let rechecks = 0;
const MAX_RECHECKS = 6;
const BATCH = 300;

const key = (p: Phrase) => `${p.lang}|${p.text.trim()}`;

/** Включается по плейлисту: только если сервер озвучивает сам. */
export function setServerVoice(on: boolean) {
  enabled = on;
}

/** Ссылка на нейроголос, если сервер уже озвучил фразу. */
export function cachedSpeechUrl(s: Speech): string | null {
  return enabled ? (urls.get(key(s)) ?? null) : null;
}

/** Попросить сервер озвучить фразы (пачкой, с небольшой задержкой). */
export function wantSpeech(phrases: readonly Phrase[]) {
  if (!enabled) return;
  for (const p of phrases)
    if (!urls.has(key(p))) queued.set(key(p), { text: p.text, lang: p.lang });
  schedule(300);
}

function schedule(ms: number) {
  if (timer || !queued.size) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, ms);
}

async function flush() {
  const batch = [...queued.values()].slice(0, BATCH);
  try {
    const res = await fetch(`${API_PREFIX}/kid/speech`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phrases: batch }),
    });
    if (!res.ok) return;
    const result = (await res.json()) as Speech[];
    for (const s of result) {
      if (!s.audioUrl) continue;
      urls.set(key(s), s.audioUrl);
      queued.delete(key(s));
    }
  } catch {
    // нет сети — фразы скажет голос телефона
    return;
  }
  // Готово не всё — сервер озвучивает; переспросим чуть позже (и следующую пачку).
  if (queued.size && rechecks++ < MAX_RECHECKS) schedule(8000);
}

/** Для тестов. */
export function resetSpeechCache() {
  urls.clear();
  queued.clear();
  rechecks = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}
