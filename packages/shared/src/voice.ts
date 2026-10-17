// Голос озвучки (этап 14в): родитель выбирает нейроголос и скорость в кабинете, прослушав их.
import { z } from 'zod';

/**
 * Женские голоса Google Chirp 3 HD. Имя одно для всех языков (ru-RU-Chirp3-HD-Kore,
 * en-US-Chirp3-HD-Kore…) — ребёнок слышит один и тот же «характер» по-русски и по-английски.
 */
export const VOICE_NAMES = [
  'Aoede',
  'Kore',
  'Leda',
  'Zephyr',
  'Despina',
  'Callirrhoe',
  'Autonoe',
  'Erinome',
  'Laomedeia',
  'Achernar',
  'Gacrux',
  'Pulcherrima',
  'Sulafat',
  'Vindemiatrix',
] as const;
/**
 * Голоса ElevenLabs (этап 26): живые, с хорошими русскими ударениями. Голос многоязычный —
 * один id на все языки. Имя для кабинета → id голоса.
 */
export const ELEVEN_VOICES = {
  Matilda: 'XrExE9yKIg1WjnnlVkGX',
  Jessica: 'cgSgspJ2msm6clMCkdW9',
  Lily: 'pFZP5JQG7iQjIQuC4Bku',
  Alice: 'Xb7hH8MSUJpSbSDYk0k2',
  Laura: 'FGY2WhTYpPnrIDTdsKH5',
  Sarah: 'EXAVITQu4vr4xnSDxMaL',
  Charlotte: 'XB0fDUnXU5powFXDhCwa',
  Aria: '9BWtsMINqrJLrRacOk9x',
} as const;
export const ELEVEN_VOICE_NAMES = Object.keys(ELEVEN_VOICES) as (keyof typeof ELEVEN_VOICES)[];

export type VoiceName = (typeof VOICE_NAMES)[number] | keyof typeof ELEVEN_VOICES;
export type VoiceProvider = 'google' | 'elevenlabs' | 'proxyapi';

/** Голоса ElevenLabs, которые ProxyAPI знает по имени (этап 28; charlotte, aria — нет). */
export const PROXY_VOICE_NAMES = ['Lily', 'Matilda', 'Jessica', 'Alice', 'Laura', 'Sarah'] as const;
/**
 * Модель озвучки ProxyAPI. Пишется в голос («matilda@elevenlabs/eleven-v3»): так она входит
 * в ключ кэша, и смена модели переозвучивает всё.
 */
export const PROXY_TTS_MODEL = 'elevenlabs/eleven-v3';
export const proxyVoice = (name: string) => `${name.toLowerCase()}@${PROXY_TTS_MODEL}`;
export const PROXY_VOICE_DEFAULT = proxyVoice('lily');

/** Голоса, из которых выбирает родитель, — у каждого провайдера свои. */
export const voiceNames = (provider: string): readonly VoiceName[] =>
  provider === 'elevenlabs'
    ? ELEVEN_VOICE_NAMES
    : provider === 'proxyapi'
      ? PROXY_VOICE_NAMES
      : VOICE_NAMES;

/** Скорость речи: медленнее (для малышей), обычно, как в жизни. */
export const VOICE_SPEEDS = [0.85, 0.95, 1] as const;
export const VOICE_SPEED_LABELS: Record<(typeof VOICE_SPEEDS)[number], string> = {
  0.85: 'Медленнее',
  0.95: 'Обычно',
  1: 'Как в жизни',
};

const speed = z.union([z.literal(0.85), z.literal(0.95), z.literal(1)]);

export const voiceSettings = z.object({
  voice: z.enum([...VOICE_NAMES, ...ELEVEN_VOICE_NAMES] as [VoiceName, ...VoiceName[]]),
  speed,
});
export type VoiceSettings = z.infer<typeof voiceSettings>;

export const voicePreviewRequest = voiceSettings.extend({
  text: z.string().trim().min(1, 'введите фразу').max(200),
});
export type VoicePreviewRequest = z.infer<typeof voicePreviewRequest>;

export interface VoiceInfo {
  /** Озвучивает сервер (нейроголос); false — голос телефона, выбор недоступен. */
  serverVoice: boolean;
  voice: VoiceName;
  speed: number;
  voices: readonly VoiceName[];
}

export interface VoicePreview {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  url: string | null;
}

/** Фраза для сравнения голосов: вопрос, похвала, слово — то, что ребёнок слышит чаще всего. */
export const VOICE_SAMPLE = 'Привет! Посмотри, это кошка. А где собачка? Молодец, правильно!';

const GOOGLE_LANG = { ru: 'ru-RU', en: 'en-US', zh: 'cmn-CN' } as const;
/** Полное имя голоса Google для языка. */
export const googleVoice = (lang: keyof typeof GOOGLE_LANG, name: string) =>
  `${GOOGLE_LANG[lang]}-Chirp3-HD-${name}`;
/** Голос провайдера для языка: у Google — полное имя, у ElevenLabs — id (одинаковый для языков). */
export const providerVoice = (provider: string, lang: keyof typeof GOOGLE_LANG, name: VoiceName) =>
  provider === 'elevenlabs'
    ? (ELEVEN_VOICES[name as keyof typeof ELEVEN_VOICES] ?? name)
    : provider === 'proxyapi'
      ? proxyVoice(name)
      : googleVoice(lang, name);

/** Короткое имя из полного (ru-RU-Chirp3-HD-Kore → Kore, id ElevenLabs → Matilda); чужое — null. */
export const voiceShortName = (full: string | undefined): VoiceName | null => {
  const eleven = Object.entries(ELEVEN_VOICES).find(([, id]) => id === full)?.[0];
  if (eleven) return eleven as VoiceName;
  const proxy = PROXY_VOICE_NAMES.find((n) => proxyVoice(n) === full);
  if (proxy) return proxy;
  const name = full?.split('-').at(-1);
  return (VOICE_NAMES as readonly string[]).includes(name ?? '') ? (name as VoiceName) : null;
};

// ─── Ударения ───────────────────────────────────────────────────────────────

const VOWELS = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
const STRESS = new RegExp(`\\+([${VOWELS}])`, 'g');

/** «здор+ово» → «здорово»: так текст показывается на экране и читается голосом телефона. */
export const withoutStress = (s: string) => s.replace(STRESS, '$1');
/** «здор+ово» → «здоро́во» (знак ударения над гласной) — для нейроголоса. */
export const withAcuteStress = (s: string) => s.replace(STRESS, '$1́');
