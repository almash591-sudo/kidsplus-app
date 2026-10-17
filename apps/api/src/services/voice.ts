import { schema, type Db } from '@kidsplus/db';
import { providerVoice, voiceSettings, type VoiceSettings } from '@kidsplus/shared/voice';
import { eq, sql } from 'drizzle-orm';
import type { TtsSettings } from './media';

const { appSettings } = schema;
const KEY = 'tts';

/** Голос и скорость, выбранные родителем; null — не выбирали (действуют переменные окружения). */
export async function loadVoice(db: Pick<Db, 'select'>): Promise<VoiceSettings | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  const parsed = voiceSettings.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

export async function saveVoice(db: Pick<Db, 'insert'>, value: VoiceSettings) {
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: sql`now()` } });
}

/** Применить голос к настройкам озвучки (меняет объект на месте — его читают все маршруты). */
export function applyVoice(tts: TtsSettings, v: VoiceSettings) {
  if (tts.providerId === 'browser') return;
  tts.speed = v.speed;
  tts.voices = {
    ru: providerVoice(tts.providerId, 'ru', v.voice),
    en: providerVoice(tts.providerId, 'en', v.voice),
    zh: providerVoice(tts.providerId, 'zh', v.voice),
  };
}
