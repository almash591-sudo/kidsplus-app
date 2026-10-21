import type { KidCard } from '@kidsplus/shared/api';
import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  checkPrompt,
  checkpointIndexes,
  deckCheckQuestions,
  isRapidGuessing,
  optionsFor,
  pickQuestions,
  shuffle,
  type QuizItem,
} from './engine';

/** Детерминированный генератор для тестов. */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const q = (id: string, n = 4): QuizItem => ({
  id,
  prompt: [{ text: `вопрос ${id}`, lang: 'ru', audioUrl: null }],
  options: Array.from({ length: n }, (_, i) => ({
    id: `${id}-${i}`,
    imageUrl: `/i/${id}-${i}`,
    isCorrect: i === 0,
  })),
});

describe('pickQuestions', () => {
  it('возвращает ровно нужное число вопросов', () => {
    expect(
      pickQuestions([q('a'), q('b'), q('c'), q('d'), q('e'), q('f')], 5, seeded()),
    ).toHaveLength(5);
  });

  it('если вопросов меньше — повторяет, но не два одинаковых подряд', () => {
    for (let seed = 1; seed < 50; seed++) {
      const list = pickQuestions([q('a'), q('b')], 5, seeded(seed));
      expect(list).toHaveLength(5);
      for (let i = 1; i < list.length; i++) expect(list[i]!.id).not.toBe(list[i - 1]!.id);
    }
  });

  it('один вопрос — повторяется', () => {
    expect(pickQuestions([q('a')], 3).map((x) => x.id)).toEqual(['a', 'a', 'a']);
  });

  it('пустой пул — пусто', () => {
    expect(pickQuestions([], 5)).toEqual([]);
  });
});

describe('optionsFor', () => {
  it('2 варианта у малыша: верный всегда среди них', () => {
    for (let seed = 1; seed < 50; seed++) {
      const opts = optionsFor(q('a', 4), 2, seeded(seed));
      expect(opts).toHaveLength(2);
      expect(opts.filter((o) => o.isCorrect)).toHaveLength(1);
    }
  });

  it('4 варианта, если у вопроса их меньше, — сколько есть', () => {
    expect(optionsFor(q('a', 3), 4)).toHaveLength(3);
  });

  it('порядок перемешивается', () => {
    const positions = new Set(
      Array.from({ length: 30 }, (_, s) =>
        optionsFor(q('a', 4), 4, seeded(s + 1)).findIndex((o) => o.isCorrect),
      ),
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('isRapidGuessing', () => {
  it('два неверных касания подряд в спешке — да', () => {
    expect(isRapidGuessing([1000, 2900])).toBe(true);
  });
  it('с паузой больше 2,5 с — нет', () => {
    expect(isRapidGuessing([1000, 4000])).toBe(false);
  });
  it('одно — нет', () => {
    expect(isRapidGuessing([1000])).toBe(false);
  });
});

describe('shuffle', () => {
  it('не теряет и не дублирует элементы', () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded()).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

const card = (n: number, lang: 'en' | 'ru' = 'en'): KidCard => ({
  id: `c${n}`,
  imageUrl: `/img/${n}`,
  word: { text: `word${n}`, lang, audioUrl: null },
  translation: lang === 'en' ? { text: `слово${n}`, lang: 'ru', audioUrl: null } : null,
  question: null,
});

describe('checkpointIndexes — когда проверка в наборе карточек', () => {
  it.each([
    [15, [4, 9, 14]],
    [16, [4, 9, 14]],
    [12, [4, 9]],
    [13, [4, 9, 12]],
    [8, [4, 7]],
    [5, [4]],
    [3, [2]],
    [2, []],
  ])('%i карточек → после %j', (n, expected) => {
    expect(checkpointIndexes(n)).toEqual(expected);
  });
});

describe('deckCheckQuestions — вопросы проверки', () => {
  const deck = Array.from({ length: 10 }, (_, i) => card(i));

  it('спрашивает только недавно показанные карточки, варианты — из всего набора', () => {
    for (let seed = 1; seed < 30; seed++) {
      const focus = deck.slice(5, 10);
      const qs = deckCheckQuestions(deck, focus, 2, seeded(seed));
      expect(qs).toHaveLength(2);
      expect(new Set(qs.map((x) => x.cardId)).size).toBe(2);
      for (const x of qs) {
        expect(focus.map((c) => c.id)).toContain(x.cardId);
        expect(x.options.filter((o) => o.isCorrect)).toEqual([
          expect.objectContaining({ id: x.cardId }),
        ]);
        expect(x.options).toHaveLength(4);
        expect(new Set(x.options.map((o) => o.imageUrl)).size).toBe(4);
      }
    }
  });

  it('английский набор: «Покажи» по-русски, затем слово по-английски', () => {
    const [x] = deckCheckQuestions(deck, [deck[0]!], 1);
    expect(x!.prompt).toEqual([
      { text: 'Покажи', lang: 'ru', audioUrl: null },
      { text: 'word0', lang: 'en', audioUrl: null },
    ]);
  });

  it('русский набор: одна фраза «Где кошка?»', () => {
    const ru = [card(1, 'ru'), card(2, 'ru')];
    const [x] = deckCheckQuestions(ru, [ru[0]!], 1);
    expect(x!.prompt).toEqual([{ text: 'Где word1?', lang: 'ru', audioUrl: null }]);
  });

  it('свой вопрос карточки заменяет «Где <слово>?»', () => {
    const question = { text: 'Покажи пример: два плюс один', lang: 'ru' as const, audioUrl: null };
    const ru = [{ ...card(1, 'ru'), question }, card(2, 'ru')];
    const [x] = deckCheckQuestions(ru, [ru[0]!], 1, Math.random, true);
    expect(x!.prompt).toEqual([question]);
  });

  it('в наборе из одной карточки проверки нет (не из чего выбирать)', () => {
    expect(deckCheckQuestions([deck[0]!], [deck[0]!], 2)).toEqual([]);
  });
});

describe('checkPrompt — погружение', () => {
  const word = { text: 'run', lang: 'en' as const, audioUrl: null };
  it('английский: «Show me» + слово, всё по-английски', () => {
    expect(checkPrompt(word, true)).toEqual([
      { text: 'Show me', lang: 'en', audioUrl: null },
      word,
    ]);
  });
  it('китайский: на китайском', () => {
    const zh = { text: '猫', lang: 'zh' as const, audioUrl: null };
    expect(checkPrompt(zh, true)[0]).toEqual({ text: '指给我看', lang: 'zh', audioUrl: null });
  });
  it('без погружения: «Покажи» по-русски', () => {
    expect(checkPrompt(word, false)[0]).toEqual({ text: 'Покажи', lang: 'ru', audioUrl: null });
  });
});

describe('checkAnswer — ответ после верного касания (этап 39)', () => {
  const ru = (text: string) => ({ text, lang: 'ru' as const, audioUrl: null });
  const cat = { text: 'cat', lang: 'en' as const, audioUrl: '/a/cat' };
  it('русский набор: «Это кошка.»', () => {
    expect(checkAnswer({ word: ru('кошка'), translation: null }, false)).toEqual([
      ru('Это кошка.'),
    ]);
  });
  it('иностранный: слово, затем «Это кошка.» по-русски', () => {
    expect(checkAnswer({ word: cat, translation: ru('кошка') }, false)).toEqual([
      cat,
      ru('Это кошка.'),
    ]);
  });
  it('в погружении и без перевода — только слово', () => {
    expect(checkAnswer({ word: cat, translation: ru('кошка') }, true)).toEqual([cat]);
    expect(checkAnswer({ word: cat, translation: null }, false)).toEqual([cat]);
  });
  it('вопрос проверки несёт ответ', () => {
    const deck = [
      { id: 'a', imageUrl: '/a', word: ru('кошка'), translation: null, question: null },
      { id: 'b', imageUrl: '/b', word: ru('собака'), translation: null, question: null },
    ];
    const [x] = deckCheckQuestions(deck, [deck[0]!], 1);
    expect(x!.answer).toEqual([ru('Это кошка.')]);
  });
});
