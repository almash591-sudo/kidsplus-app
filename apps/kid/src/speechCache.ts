// Нейроголос для фраз самого приложения: ссылки на готовые файлы с сервера.
// Пока файла нет — фразу говорит голос телефона, а сервер её озвучивает к следующему разу.
import { API_PREFIX } from '@kidsplus/shared';
import type { Speech } from '@kidsplus/shared/api';
import { warmMedia } from './offline';
import type { Phrase } from './phrases';

/** Ссылки на озвученные фразы — переживают перезапуск: без сети файлы берутся из кэша (этап 15г). */
const STORE = 'kidsplus.speech';
/** Голос, которым озвучены сохранённые ссылки. */
const VOICE_STORE = 'kidsplus.speech.voice';
const urls = new Map<string, string>(loadUrls());
let voiceNow = storedVoice();

function storedVoice(): string | null {
  try {
    return localStorage.getItem(VOICE_STORE);
  } catch {
    return null;
  }
}

function loadUrls(): [string, string][] {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '[]') as [string, string][];
  } catch {
    return [];
  }
}
function saveUrls() {
  try {
    localStorage.setItem(STORE, JSON.stringify([...urls].slice(-3000)));
  } catch {
    // хранилище недоступно — просто без памяти между запусками
  }
}
const queued = new Map<string, Phrase>();
let enabled = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Сколько раз переспрашивать сервер о ещё не готовых фразах. */
let rechecks = 0;
const MAX_RECHECKS = 6;
const BATCH = 300;
/**
 * Следующая пачка — не сразу: у сервера не больше 30 запросов в минуту, а телефоны семьи
 * выходят в сеть с одного адреса. После смены голоса фраз — сотни, пачек несколько.
 */
const NEXT_BATCH_MS = 2500;
const RECHECK_MS = 8000;
/** Уже отправлены серверу в этом круге — ждут озвучки; сначала шлём ещё не отправленные. */
const asked = new Set<string>();

const key = (p: Phrase) => `${p.lang}|${p.text.trim()}`;

/**
 * Включается по плейлисту: только если сервер озвучивает сам. Голос сервера сменился (новая
 * модель, другой голос в кабинете) — сохранённые ссылки ведут на прежнюю озвучку: забываем их,
 * и фразы запрашиваются заново. Иначе задания игр звучали бы прежним голосом всегда.
 */
export function setServerVoice(on: boolean, voice: string | null = null) {
  enabled = on;
  if (!on || !voice || voiceNow === voice) return;
  voiceNow = voice;
  urls.clear();
  queued.clear();
  asked.clear();
  rechecks = 0;
  saveUrls();
  try {
    localStorage.setItem(VOICE_STORE, voice);
  } catch {
    // хранилище недоступно — при следующем запуске спросим заново
  }
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
  let fresh = [...queued.keys()].filter((k) => !asked.has(k));
  if (!fresh.length) {
    // Круг пройден — переспрашиваем всё, что ещё не готово.
    asked.clear();
    fresh = [...queued.keys()];
  }
  const keys = fresh.slice(0, BATCH);
  keys.forEach((k) => asked.add(k));
  const batch = keys.map((k) => queued.get(k)!);
  try {
    const res = await fetch(`${API_PREFIX}/kid/speech`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phrases: batch }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const result = (await res.json()) as Speech[];
    for (const s of result) {
      if (!s.audioUrl) continue;
      urls.set(key(s), s.audioUrl);
      queued.delete(key(s));
      asked.delete(key(s));
      // Файл — в кэш заранее, чтобы звучал и без сети.
      warmMedia([s.audioUrl]);
    }
    saveUrls();
  } catch {
    // Нет сети или сервер занят — фразы пока скажет голос телефона; попробуем позже.
    keys.forEach((k) => asked.delete(k));
    if (rechecks++ < MAX_RECHECKS) schedule(RECHECK_MS);
    return;
  }
  // Ещё не всё отправлено — следующая пачка; отправлено, но не готово — переспросим позже.
  if ([...queued.keys()].some((k) => !asked.has(k))) schedule(NEXT_BATCH_MS);
  else if (queued.size && rechecks++ < MAX_RECHECKS) schedule(RECHECK_MS);
}

/** Для тестов. */
export function resetSpeechCache() {
  urls.clear();
  voiceNow = null;
  try {
    localStorage.removeItem(STORE);
    localStorage.removeItem(VOICE_STORE);
  } catch {
    // нет хранилища
  }
  queued.clear();
  asked.clear();
  rechecks = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}
