import { describe, expect, it } from 'vitest';
import { voiceFor } from './audio';

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
