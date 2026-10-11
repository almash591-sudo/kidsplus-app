import { describe, expect, it } from 'vitest';
import { googleVoice, voiceShortName, withAcuteStress, withoutStress } from './voice';

describe('ударения', () => {
  it('«+» перед гласной: на экран — без него, нейроголосу — знак ударения', () => {
    expect(withoutStress('Молодец, здор+ово!')).toBe('Молодец, здорово!');
    expect(withAcuteStress('Молодец, здор+ово!')).toBe('Молодец, здоро́во!');
    expect(withAcuteStress('З+амок и зам+ок')).toBe('За́мок и замо́к');
  });

  it('«+» не перед гласной не трогаем (2+2, C++)', () => {
    expect(withoutStress('2+2 и C++')).toBe('2+2 и C++');
    expect(withAcuteStress('2+2')).toBe('2+2');
  });
});

describe('имена голосов', () => {
  it('полное имя по языку и обратно', () => {
    expect(googleVoice('ru', 'Kore')).toBe('ru-RU-Chirp3-HD-Kore');
    expect(googleVoice('zh', 'Kore')).toBe('cmn-CN-Chirp3-HD-Kore');
    expect(voiceShortName('ru-RU-Chirp3-HD-Leda')).toBe('Leda');
    expect(voiceShortName('ru-RU-Wavenet-A')).toBeNull();
    expect(voiceShortName(undefined)).toBeNull();
  });
});
