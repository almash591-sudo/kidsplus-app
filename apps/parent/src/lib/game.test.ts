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
