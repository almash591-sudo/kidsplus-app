import { describe, expect, it } from 'vitest';
import { problem } from './game';

const img = '00000000-0000-4000-8000-000000000001';

describe('конструктор игр: почему нельзя сохранить', () => {
  it('без названия', () => {
    expect(problem({ title: ' ', spec: { kind: 'balloons', count: 5 }, childIds: [] })).toBe(
      'Укажите название.',
    );
  });

  it('сортировка: задание, места с подписями, хотя бы 2 предмета', () => {
    const base = { title: 'Покорми', childIds: [] };
    expect(
      problem({ ...base, spec: { kind: 'sorting', prompt: '', bins: [], items: [] } }),
    ).toMatch(/задание/);
    expect(
      problem({
        ...base,
        spec: { kind: 'sorting', prompt: 'Покорми', bins: [{ imageId: img, name: '' }], items: [] },
      }),
    ).toMatch(/Подпишите/);
    expect(
      problem({
        ...base,
        spec: {
          kind: 'sorting',
          prompt: 'Покорми',
          bins: [{ imageId: img, name: 'зайчик' }],
          items: [{ imageId: img, bin: 0 }],
        },
      }),
    ).toMatch(/2 предмета/);
    expect(
      problem({
        ...base,
        spec: {
          kind: 'sorting',
          prompt: 'Покорми',
          bins: [{ imageId: img, name: 'зайчик' }],
          items: [
            { imageId: img, bin: 0 },
            { imageId: img, bin: 0 },
          ],
        },
      }),
    ).toBeNull();
  });

  it('пары, пазл, обводка', () => {
    const base = { title: 'Игра', childIds: [] };
    expect(problem({ ...base, spec: { kind: 'memory', imageIds: [img] } })).toMatch(/2 картинки/);
    expect(problem({ ...base, spec: { kind: 'puzzle', imageIds: [], cols: 2, rows: 2 } })).toMatch(
      /картинку/,
    );
    expect(problem({ ...base, spec: { kind: 'tracing', shapes: [] } })).toMatch(/обводить/);
    expect(problem({ ...base, spec: { kind: 'coloring', picture: 'sun' } })).toBeNull();
  });

  it('новые игры: картинки, слова, раунды', () => {
    const base = { title: 'Игра', childIds: [] };
    expect(
      problem({ ...base, spec: { kind: 'maze', heroId: img, goalId: '', size: 4, rounds: 1 } }),
    ).toMatch(/кто идёт/);
    expect(
      problem({
        ...base,
        spec: { kind: 'word', lang: 'ru', words: [{ imageId: img, word: 'КО Т' }] },
      }),
    ).toMatch(/только буквы/);
    expect(
      problem({
        ...base,
        spec: { kind: 'word', lang: 'ru', words: [{ imageId: img, word: 'КОТ' }] },
      }),
    ).toBeNull();
    expect(
      problem({
        ...base,
        spec: { kind: 'pattern', imageIds: [img, img], patterns: ['AB'], rounds: 2 },
      }),
    ).toMatch(/разные/);
    expect(
      problem({
        ...base,
        spec: { kind: 'sequence', rounds: [{ prompt: 'Что сначала?', imageIds: [img] }] },
      }),
    ).toMatch(/2 картинки/);
    expect(
      problem({
        ...base,
        spec: { kind: 'compare', mode: 'numbers', ask: 'more', max: 5, rounds: 2 },
      }),
    ).toBeNull();
    expect(problem({ ...base, spec: { kind: 'melody', bells: 3, start: 2, goal: 5 } })).toBeNull();
  });
});

describe('этап 49: звуки и чтение', () => {
  const base = { title: 'Буквы', childIds: [] };
  const words = [
    { emoji: '🧃', word: 'СОК' },
    { emoji: '🦊', word: 'ЛИСА' },
  ];

  it('слов с картинкой — хотя бы 2; слово с мягким звуком не пройдёт', () => {
    expect(
      problem({
        ...base,
        spec: { kind: 'soundPlace', sound: 'С', words: words.slice(0, 1), rounds: 5 },
      }),
    ).toMatch(/2 слова/);
    expect(
      problem({ ...base, spec: { kind: 'soundPlace', sound: 'С', words, rounds: 5 } }),
    ).toBeNull();
    expect(
      problem({ ...base, spec: { kind: 'soundPlace', sound: 'Л', words, rounds: 5 } }),
    ).toMatch(/Проверьте/);
  });

  it('«Какое слово?» и «Прочитай фразу»: вариантов должно хватить', () => {
    const items = [
      { emoji: '🧃', word: 'СОК', similar: ['СОН'] },
      { emoji: '🐱', word: 'КОТ', similar: ['КИТ'] },
    ];
    expect(
      problem({ ...base, spec: { kind: 'pickWord', items, choices: 3, rounds: 5 } }),
    ).toBeNull();
    expect(problem({ ...base, spec: { kind: 'pickWord', items, choices: 4, rounds: 5 } })).toMatch(
      /Мало похожих для 4/,
    );
    const phrases = [
      { text: 'ДВА ГРИБА', emoji: '🍄🍄', similar: ['🍄'] },
      { text: 'КОТ И МЯЧ', emoji: '🐱⚽', similar: ['🐶⚽', '🐱🎈'] },
    ];
    expect(
      problem({ ...base, spec: { kind: 'readPhrase', items: phrases, choices: 3, rounds: 5 } }),
    ).toBeNull();
    expect(
      problem({
        ...base,
        spec: { kind: 'readPhrase', items: phrases.slice(0, 1), choices: 2, rounds: 5 },
      }),
    ).toMatch(/2 строки/);
  });
});
