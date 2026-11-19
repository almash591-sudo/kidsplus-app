import type { Speech } from '@kidsplus/shared/api';
import { APP_PHRASE_VARIANTS } from './phrases';
import { vary } from './variety';

/** Choose once per interaction: use this same line for speech and any companion bubble. */
export function voiceLine(base: string): Speech {
  const alternatives = APP_PHRASE_VARIANTS.get(base);
  const speech = (text: string): Speech => ({ text, lang: 'ru', audioUrl: null });
  if (!alternatives) return speech(base);
  return vary(`app:${base}`, alternatives.map(speech))!;
}
