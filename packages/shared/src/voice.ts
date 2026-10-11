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
export type VoiceName = (typeof VOICE_NAMES)[number];

/** Скорость речи: медленнее (для малышей), обычно, как в жизни. */
export const VOICE_SPEEDS = [0.85, 0.95, 1] as const;
export const VOICE_SPEED_LABELS: Record<(typeof VOICE_SPEEDS)[number], string> = {
  0.85: 'Медленнее',
  0.95: 'Обычно',
  1: 'Как в жизни',
};

const speed = z.union([z.literal(0.85), z.literal(0.95), z.literal(1)]);

export const voiceSettings = z.object({ voice: z.enum(VOICE_NAMES), speed });
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
/** Короткое имя из полного (ru-RU-Chirp3-HD-Kore → Kore); чужое имя — null. */
export const voiceShortName = (full: string | undefined): VoiceName | null => {
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
