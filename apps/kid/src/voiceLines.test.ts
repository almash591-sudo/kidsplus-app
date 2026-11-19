import type { KidPlaylist } from '@kidsplus/shared/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_PHRASE_VARIANTS, appPhrases, HINT_PICK, ROOM_PHRASES } from './phrases';
import { resetVariety } from './variety';
import { voiceLine } from './voiceLines';

beforeEach(() => resetVariety());
afterEach(() => vi.restoreAllMocks());

describe('varied app speech', () => {
  it('avoids recent repeats, even when the random source keeps returning the same value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const options = APP_PHRASE_VARIANTS.get(ROOM_PHRASES.bunny)!;
    const remembered = Math.min(6, Math.floor(options.length / 2));
    const said = Array.from({ length: 20 }, () => voiceLine(ROOM_PHRASES.bunny));
    for (let i = 0; i < said.length; i++) {
      expect(options).toContain(said[i]!.text);
      expect(said.slice(Math.max(0, i - remembered), i).map((line) => line.text)).not.toContain(
        said[i]!.text,
      );
    }
    expect(new Set(said.map((line) => line.text)).size).toBeGreaterThan(remembered);
  });

  it('keeps separate interaction histories and preserves exact task instructions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(voiceLine(ROOM_PHRASES.bunny).text).toBe(ROOM_PHRASES.bunny);
    expect(voiceLine(HINT_PICK).text).toBe(HINT_PICK);
    expect(voiceLine(ROOM_PHRASES.bunny).text).not.toBe(ROOM_PHRASES.bunny);
    const instruction = 'Найди три красных кружка.';
    expect(voiceLine(instruction)).toEqual({ text: instruction, lang: 'ru', audioUrl: null });
  });

  it('prepares every possible variant for the neural voice, without duplicate requests', () => {
    const playlist: KidPlaylist = {
      quiz: { options: 2, questions: 3 },
      items: [],
      phrases: { correct: [], retry: [], done: [] },
      phrasesEn: { correct: [], retry: [], done: [] },
      immersion: false,
      serverVoice: true,
    };
    const warmed = appPhrases(playlist).map((line) => `${line.lang}:${line.text}`);
    for (const [base, options] of APP_PHRASE_VARIANTS) {
      expect(options).toContain(base);
      for (const text of options) expect(warmed).toContain(`ru:${text}`);
    }
    expect(new Set(warmed).size).toBe(warmed.length);
  });
});
