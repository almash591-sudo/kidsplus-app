import { describe, expect, it } from 'vitest';
import { gameImageIds, gameSpec } from './games';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('параметры игр', () => {
  it('значения по умолчанию', () => {
    expect(gameSpec.parse({ kind: 'drawing' })).toEqual({ kind: 'drawing', stickerIds: [] });
    expect(gameSpec.parse({ kind: 'balloons', count: 5 })).toEqual({
      kind: 'balloons',
      count: 5,
      target: null,
    });
  });

  it('сортировка: предмет не может ссылаться на несуществующую корзину', () => {
    const base = {
      kind: 'sorting',
      prompt: 'Разложи',
      bins: [{ imageId: id(1), name: 'корзинка' }],
    };
    expect(
      gameSpec.safeParse({
        ...base,
        items: [
          { imageId: id(2), bin: 0 },
          { imageId: id(3), bin: 0 },
        ],
      }).success,
    ).toBe(true);
    expect(
      gameSpec.safeParse({
        ...base,
        items: [
          { imageId: id(2), bin: 0 },
          { imageId: id(3), bin: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('неизвестный вид, картинка или цифра — ошибка', () => {
    expect(gameSpec.safeParse({ kind: 'chess' }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'coloring', picture: 'dragon' }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'tracing', shapes: ['10'] }).success).toBe(false);
  });

  it('картинки игры — для проверки готовности', () => {
    expect(
      gameImageIds(
        gameSpec.parse({
          kind: 'sorting',
          prompt: 'Разложи',
          bins: [{ imageId: id(1), name: 'корзинка' }],
          items: [
            { imageId: id(2), bin: 0 },
            { imageId: id(3), bin: 0 },
          ],
        }),
      ),
    ).toEqual([id(1), id(2), id(3)]);
    expect(gameImageIds(gameSpec.parse({ kind: 'tracing', shapes: ['1'] }))).toEqual([]);
  });

  it('новые виды: значения по умолчанию и проверки ссылок', () => {
    expect(gameSpec.parse({ kind: 'shapes', shapes: ['circle', 'star'] })).toEqual({
      kind: 'shapes',
      shapes: ['circle', 'star'],
      rotate: false,
    });
    const moles = { kind: 'moles', imageIds: [id(1), id(2)], count: 5 };
    expect(gameSpec.parse(moles)).toMatchObject({ target: null, prompt: null, speed: 'normal' });
    expect(gameSpec.safeParse({ ...moles, target: 2 }).success).toBe(false);
    expect(gameSpec.safeParse({ kind: 'melody', bells: 3, start: 4, goal: 3 }).success).toBe(false);
    expect(
      gameSpec.safeParse({ kind: 'odd', rounds: [{ imageIds: [id(1), id(2), id(3)], odd: 3 }] })
        .success,
    ).toBe(false);
    expect(
      gameSpec.safeParse({
        kind: 'pattern',
        imageIds: [id(1), id(2)],
        patterns: ['ABC'],
        rounds: 3,
      }).success,
    ).toBe(false);
    expect(
      gameSpec.safeParse({ kind: 'compare', mode: 'objects', ask: 'more', max: 5, rounds: 3 })
        .success,
    ).toBe(false);
    expect(
      gameSpec.safeParse({ kind: 'compare', mode: 'numbers', ask: 'more', max: 5, rounds: 3 })
        .success,
    ).toBe(true);
  });

  it('«Собери слово»: слово в верхнем регистре, только буквы', () => {
    const word = (w: string) =>
      gameSpec.safeParse({ kind: 'word', lang: 'ru', words: [{ imageId: id(1), word: w }] });
    expect(word(' кот ')).toMatchObject({ success: true });
    expect((word('кот').data as { words: { word: string }[] }).words[0]!.word).toBe('КОТ');
    expect(word('ёж').success).toBe(true);
    expect(word('кот1').success).toBe(false);
    expect(word('к').success).toBe(false);
  });

  it('картинки новых игр', () => {
    expect(
      gameImageIds(
        gameSpec.parse({ kind: 'maze', heroId: id(1), goalId: id(2), size: 4, rounds: 1 }),
      ),
    ).toEqual([id(1), id(2)]);
    expect(
      gameImageIds(
        gameSpec.parse({
          kind: 'sequence',
          rounds: [
            { prompt: 'Что сначала?', imageIds: [id(1), id(2)] },
            { prompt: 'А тут?', imageIds: [id(3), id(4)] },
          ],
        }),
      ),
    ).toEqual([id(1), id(2), id(3), id(4)]);
    expect(
      gameImageIds(
        gameSpec.parse({ kind: 'flashlight', scene: 'forest', items: [{ imageId: id(5) }] }),
      ),
    ).toEqual([id(5)]);
  });
});
