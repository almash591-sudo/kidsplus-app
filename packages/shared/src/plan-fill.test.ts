import { describe, expect, it } from 'vitest';
import { fillTopics, stems, type FillMaterial } from './plan-fill';
import type { TopicInput } from './schedule';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mat = (n: number, kind: FillMaterial['item']['kind'], title: string): FillMaterial => ({
  item: { kind, refId: id(n) },
  title,
  subject: 'english',
});
const weeks = (titles: string[]): TopicInput[] =>
  titles.map((title, i) => ({ subject: 'english', week: i + 1, title, items: [] }));

describe('fillTopics', () => {
  it('раскладывает видео, карточки и игры по всем неделям вперемешку', () => {
    const materials = [
      ...Array.from({ length: 6 }, (_, i) => mat(i, 'segment', `Видео ${i}`)),
      ...Array.from({ length: 6 }, (_, i) => mat(10 + i, 'deck', `Набор ${i}`)),
      ...Array.from({ length: 3 }, (_, i) => mat(20 + i, 'interactive', `Игра ${i}`)),
    ];
    const { topics, added } = fillTopics(
      { subjects: ['english'], topics: weeks(['Цвета', 'Счёт', 'Еда']) },
      materials,
    );
    expect(added).toBe(15);
    for (const t of topics) {
      expect(t.items!.some((i) => i.kind === 'segment')).toBe(true);
      expect(t.items!.some((i) => i.kind === 'deck')).toBe(true);
      expect(t.items!.some((i) => i.kind === 'interactive')).toBe(true);
    }
    // Порядок сохраняется: первые видео — в первую неделю.
    expect(topics[0]!.items![0]).toEqual({ kind: 'segment', refId: id(0) });
  });

  it('материал с совпадающими словами попадает в свою тему', () => {
    const { topics } = fillTopics(
      { subjects: ['english'], topics: weeks(['Приветствия и знакомство', 'Животные фермы']) },
      [
        mat(1, 'segment', 'Animals on the farm — животные фермы'),
        mat(2, 'deck', 'Приветствия: hello, goodbye'),
      ],
    );
    expect(topics[0]!.items).toEqual([{ kind: 'deck', refId: id(2) }]);
    expect(topics[1]!.items).toEqual([{ kind: 'segment', refId: id(1) }]);
  });

  it('темы с материалами не трогает, уже разложенное не повторяет', () => {
    const plan = weeks(['Цвета', 'Счёт']);
    plan[0]!.items = [{ kind: 'deck', refId: id(1) }];
    const { topics, added } = fillTopics({ subjects: ['english'], topics: plan }, [
      mat(1, 'deck', 'Цвета'),
      mat(2, 'segment', 'Видео'),
    ]);
    expect(added).toBe(1);
    expect(topics[0]!.items).toEqual([{ kind: 'deck', refId: id(1) }]);
    expect(topics[1]!.items).toEqual([{ kind: 'segment', refId: id(2) }]);
  });

  it('материалов меньше, чем недель, — повторяет', () => {
    const { topics } = fillTopics({ subjects: ['english'], topics: weeks(['А', 'Б', 'В']) }, [
      mat(1, 'deck', 'Набор'),
    ]);
    expect(topics.every((t) => t.items!.length === 1)).toBe(true);
  });

  it('служебные слова не считаются совпадением', () => {
    expect([...stems('Песенка для малышей про животных')]).toEqual(['живот']);
  });
});
