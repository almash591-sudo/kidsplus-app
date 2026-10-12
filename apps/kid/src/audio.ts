// Озвучка для ребёнка: одна «дорожка» — новая фраза останавливает предыдущую.
// Фраза с audioUrl проигрывается файлом (серверная озвучка), без него — синтезом речи телефона
// (Web Speech API: на Android это голос Samsung/Google TTS, установленный на устройстве).
import type { Language, Speech } from '@kidsplus/shared/api';
import { cachedSpeechUrl, wantSpeech } from './speechCache';
import { withoutStress } from '@kidsplus/shared/voice';
import { cachedObjectUrl } from './offline';

const SPEECH_LANG: Record<Language, string> = { ru: 'ru-RU', en: 'en-US', zh: 'zh-CN' };
/** Медленнее обычного — для малышей. */
const SPEECH_RATE = 0.85;

let current: HTMLAudioElement | null = null;
let finishCurrent: (() => void) | null = null;
/** Увеличивается при каждой остановке — прерывает начатые последовательности. */
let generation = 0;

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/**
 * Список голосов в Chrome загружается асинхронно (событие voiceschanged). Пока он пуст, голос
 * нельзя задать явно, а на Android язык фразы без явного голоса игнорируется: после английского
 * слова русский перевод читался английским голосом. Поэтому перед озвучкой ждём голоса.
 */
let voicesReady: Promise<void> | null = null;
function waitForVoices(): Promise<void> {
  const speech = synth();
  if (!speech || speech.getVoices().length) return Promise.resolve();
  voicesReady ??= new Promise((resolve) => {
    const done = () => {
      speech.removeEventListener?.('voiceschanged', done);
      resolve();
    };
    speech.addEventListener?.('voiceschanged', done);
    // Голосов может не быть вовсе — не ждём бесконечно.
    setTimeout(done, 1500);
  });
  return voicesReady;
}
void waitForVoices();

const norm = (s: string) => s.toLowerCase().replace(/_/g, '-');

/**
 * Голос для языка: сначала точное совпадение (ru-RU), потом любой того же языка (ru-*);
 * среди подходящих — установленный на телефоне (localService), он работает и без интернета.
 */
export function voiceFor(
  lang: string,
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const base = norm(lang).split('-')[0];
  const exact = voices.filter((v) => norm(v.lang) === norm(lang));
  const sameLang = voices.filter((v) => norm(v.lang).split('-')[0] === base);
  const pool = exact.length ? exact : sameLang;
  return pool.find((v) => v.localService) ?? pool[0];
}

/** Язык последней произнесённой фразы — при смене языка движок сбрасывается. */
let lastLang: string | null = null;

function interrupt() {
  if (current) current.pause();
  synth()?.cancel();
  finishCurrent?.();
}

/** 'error' — файл не загрузился (например, нет сети): тогда фразу скажет голос телефона. */
function playFile(url: string, original = url): Promise<'done' | 'error'> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    // Исходный адрес (из кэша src становится blob:) — для отладки и тестов.
    audio.dataset.src = original;
    current = audio;
    const done = (result: 'done' | 'error' = 'done') => {
      audio.onended = audio.onerror = null;
      if (current === audio) current = null;
      finishCurrent = null;
      resolve(result);
    };
    finishCurrent = () => done();
    audio.onended = () => done();
    audio.onerror = () => done('error');
    // Запрет автовоспроизведения считаем окончанием — экран не должен зависнуть.
    audio.play().catch(() => done());
  });
}

async function speakText(s: Speech): Promise<void> {
  const speech = synth();
  if (!speech) return;
  await waitForVoices();
  const lang = SPEECH_LANG[s.lang];
  // Смена языка (английское слово → русский перевод): сбрасываем движок, чтобы он
  // переключился на голос нового языка. Предыдущая фраза к этому моменту уже договорена.
  if (lastLang && lastLang !== lang && !speech.speaking) speech.cancel();
  lastLang = lang;

  return new Promise((resolve) => {
    // Пометка ударения «здор+ово» — только для нейроголоса; голос телефона её прочитал бы.
    const u = new SpeechSynthesisUtterance(withoutStress(s.text));
    u.lang = lang;
    u.rate = SPEECH_RATE;
    const voice = voiceFor(lang, speech.getVoices());
    try {
      if (voice) u.voice = voice;
    } catch {
      // Браузер не принял голос — останется только язык фразы.
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      finishCurrent = null;
      resolve();
    };
    // Chrome на Android иногда не присылает onend — страховка по длине фразы (с запасом
    // на запуск движка, чтобы следующая фраза не начиналась раньше времени).
    const fallback = setTimeout(done, 3000 + s.text.length * 200);
    finishCurrent = done;
    u.onend = done;
    u.onerror = done;
    try {
      speech.speak(u);
    } catch {
      done();
    }
  });
}

/** Любая ошибка озвучки считается окончанием фразы — квиз и карточки не должны зависнуть. */
function say(s: Speech): Promise<void> {
  // Нет готового файла — ищем нейроголос фразы приложения; нет и его — говорит телефон,
  // а сервер озвучит фразу к следующему разу.
  const url = s.audioUrl ?? cachedSpeechUrl(s);
  if (!url) {
    wantSpeech([s]);
    return speakText(s).catch(() => {});
  }
  // Файл из кэша занятий — звучит и без сети (этап 15г); не скачался — говорит телефон.
  return cachedObjectUrl(url)
    .then(async (local) => {
      try {
        if ((await playFile(local ?? url, url)) === 'error' && !local) await speakText(s);
      } finally {
        if (local) URL.revokeObjectURL(local);
      }
    })
    .catch(() => {});
}

/** Произносит фразу и ждёт окончания (или остановки). */
export function playSpeech(s: Speech): Promise<void> {
  generation++;
  interrupt();
  return say(s);
}

/** Последовательно: например, слово, затем перевод. Прерывается stopAudio/playSpeech. */
export async function playSequence(items: (Speech | null)[]) {
  const mine = ++generation;
  interrupt();
  for (const s of items) {
    if (generation !== mine) return;
    if (s) await say(s);
  }
}

export function stopAudio() {
  generation++;
  interrupt();
}

/** Языки (ru, en, …), для которых на телефоне есть голос синтеза речи — сообщаются родителю. */
export async function speechLanguages(): Promise<string[]> {
  const speech = synth();
  if (!speech) return [];
  await waitForVoices();
  const langs = speech.getVoices().map((v) => norm(v.lang).split('-')[0] ?? '');
  return [...new Set(langs.filter((l) => /^[a-z]{2,3}$/.test(l)))].sort();
}
