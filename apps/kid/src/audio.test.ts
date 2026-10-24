import type { Speech } from '@kidsplus/shared/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSequence, playSpeech, stopAudio, voiceFor } from './audio';

const v = (name: string, lang: string, localService = true) =>
  ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

// Как на Samsung: часть голосов с подчёркиванием (ru_RU), часть сетевые.
const VOICES = [
  v('Samsung English', 'en_US'),
  v('Google русский (сеть)', 'ru-RU', false),
  v('Samsung русский', 'ru_RU'),
  v('Google 中文', 'zh-CN'),
  v('English UK', 'en-GB'),
];

describe('voiceFor', () => {
  it('русская фраза — русский голос, установленный на телефоне', () => {
    expect(voiceFor('ru-RU', VOICES)?.name).toBe('Samsung русский');
  });

  it('английская — американский голос (точное совпадение важнее)', () => {
    expect(voiceFor('en-US', VOICES)?.name).toBe('Samsung English');
  });

  it('нет точного совпадения — любой голос того же языка', () => {
    expect(voiceFor('en-AU', VOICES)?.name).toBe('Samsung English');
  });

  it('китайский', () => {
    expect(voiceFor('zh-CN', VOICES)?.name).toBe('Google 中文');
  });

  it('голоса языка нет — undefined (останется только lang фразы)', () => {
    expect(voiceFor('de-DE', VOICES)).toBeUndefined();
  });
});

describe('касания подряд («диджей»)', () => {
  type Utterance = { text: string; onend: (() => void) | null };
  /** Голос телефона, который договаривает фразу по команде теста. */
  const phone = () => {
    const said: string[] = [];
    let speaking: Utterance | null = null;
    vi.stubGlobal('window', {
      speechSynthesis: {
        speaking: false,
        speak: (u: Utterance) => {
          said.push(u.text);
          speaking = u;
        },
        cancel: () => {},
        getVoices: () => [v('Samsung русский', 'ru_RU')],
      },
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        rate = 1;
        voice = null;
        onend: (() => void) | null = null;
        onerror = null;
        constructor(public text: string) {}
      },
    );
    return { said, end: () => speaking?.onend?.() };
  };
  const word = (text: string): Speech => ({ text, lang: 'ru', audioUrl: null });
  const tick = () => vi.advanceTimersByTimeAsync(0);

  afterEach(() => {
    stopAudio();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('та же фраза, пока звучит, не начинается заново; договорила — снова звучит', async () => {
    vi.useFakeTimers();
    const p = phone();
    const first = playSpeech(word('Кошка'));
    await tick();
    for (let i = 0; i < 5; i++) expect(playSpeech(word('Кошка'))).toBe(first);
    await tick();
    expect(p.said).toEqual(['Кошка']);

    p.end();
    await first;
    void playSpeech(word('Кошка'));
    await tick();
    expect(p.said).toEqual(['Кошка', 'Кошка']);
  });

  it('другая фраза прерывает текущую — ответ в игре звучит сразу', async () => {
    vi.useFakeTimers();
    const p = phone();
    const first = playSequence([word('Один'), word('Два')]);
    await tick();
    void playSpeech(word('Три'));
    await first;
    await tick();
    expect(p.said).toEqual(['Один', 'Три']);
  });

  it('после остановки та же фраза звучит заново', async () => {
    vi.useFakeTimers();
    const p = phone();
    void playSpeech(word('Мяч'));
    await tick();
    stopAudio();
    void playSpeech(word('Мяч'));
    await tick();
    expect(p.said).toEqual(['Мяч', 'Мяч']);
  });
});
