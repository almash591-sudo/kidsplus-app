import { describe, expect, it } from 'vitest';
import { SYLLABLE_WORD_SETS } from './game-presets';
import { soundPlace, soundProblem, syllableSplit, syllablesIn, wordScheme } from './sounds';

describe('звуки слова', () => {
  it('слогов столько же, сколько гласных', () => {
    expect(syllablesIn('КОТ')).toBe(1);
    expect(syllablesIn('ЛУНА')).toBe(2);
    expect(syllablesIn('ЯБЛОКО')).toBe(3);
    expect(syllablesIn('ЧЕРЕПАХА')).toBe(4);
    expect(syllablesIn('МЫШЬ')).toBe(1);
  });

  it('по слогам — как в «Слове из слогов»', () => {
    for (const set of SYLLABLE_WORD_SETS)
      for (const { word } of set.words)
        expect(syllableSplit(word.replaceAll('-', '')).join('-')).toBe(word);
    for (const word of [
      'ЗАЙ-КА',
      'ПАЛЬ-ТО',
      'СЕМЬ-Я',
      'ОБЪ-ЕЗД',
      'ПО-ЭТ',
      'КОТ',
      'МЫШЬ',
      'СТРАШ-НО',
    ])
      expect(syllableSplit(word.replaceAll('-', '')).join('-')).toBe(word);
    expect(syllableSplit('Лягушка')).toEqual(['Ля', 'гуш', 'ка']);
  });

  it('место звука: начало, середина, конец; Ь звуком не считается', () => {
    expect(soundPlace('СОК', 'С')).toBe('start');
    expect(soundPlace('ЛИСА', 'С')).toBe('middle');
    expect(soundPlace('НОС', 'С')).toBe('end');
    expect(soundPlace('МЫШЬ', 'Ш')).toBe('end');
    expect(soundPlace('КОТ', 'С')).toBeNull();
  });

  it('годятся слова, где буква звучит как написана', () => {
    for (const [word, letter] of [
      ['СОК', 'С'],
      ['СЛОН', 'Л'],
      ['МАСКА', 'С'],
      ['МАШИНА', 'Ш'],
      ['ЗОНТ', 'Н'],
      ['ШАРФ', 'Ш'],
      ['ТИГР', 'Р'],
    ])
      expect(soundProblem(word!, letter!), word).toBeNull();
  });

  it('не годятся: буквы две, звук мягкий, оглушается или озвончается', () => {
    expect(soundProblem('КОКОС', 'К')).toMatch(/ровно один раз/);
    expect(soundProblem('ЛИСА', 'Л')).toMatch(/мягкий/);
    expect(soundProblem('КОНЬ', 'Н')).toMatch(/мягкий/);
    expect(soundProblem('ГВОЗДИ', 'З')).toMatch(/мягкий/);
    expect(soundProblem('ГРИБ', 'Б')).toMatch(/оглушается/);
    expect(soundProblem('ЛОЖКА', 'Ж')).toMatch(/оглушается/);
    expect(soundProblem('ДУБ', 'Б')).toMatch(/оглушается/);
    expect(soundProblem('СДАЧА', 'С')).toMatch(/озвончается/);
    // Ж, Ш, Ц всегда твёрдые — «машина» с твёрдым [ш].
    expect(soundProblem('ШИНА', 'Ш')).toBeNull();
  });

  it('звуковая схема: красная — гласный, синяя — согласный', () => {
    expect(wordScheme('КОТ')).toEqual(['c', 'v', 'c']);
    expect(wordScheme('УТКА')).toEqual(['v', 'c', 'c', 'v']);
    expect(wordScheme('ЖИРАФ')).toEqual(['c', 'v', 'c', 'v', 'c']);
    expect(wordScheme('ИГРА')).toEqual(['v', 'c', 'c', 'v']);
  });

  it('схемы нет у слов с мягкими согласными и Е, Ё, Ю, Я, Й, Ь, Ч, Щ', () => {
    for (const word of ['ЛИСА', 'КИТ', 'ЛЕВ', 'МЯЧ', 'ЁЖ', 'ЧАЙ', 'МЫШЬ', 'ЩИТ'])
      expect(wordScheme(word), word).toBeNull();
  });
});
