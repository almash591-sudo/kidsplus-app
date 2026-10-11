import { describe, expect, it } from 'vitest';
import { ageGroupOf, buildApproval, quickApproval, type EditSegment } from './moderation';

const img = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  url: `/api/media/${n}`,
  status: 'ready' as const,
});

const segment = (over: Partial<EditSegment> = {}): EditSegment => ({
  include: true,
  title: 'Цвета',
  startText: '0:30',
  endText: '2:30',
  note: '',
  questions: [
    {
      include: true,
      prompt: 'Где красный?',
      lang: 'ru',
      options: [
        { label: 'красный', picture: '', correct: true, image: img(1) },
        { label: 'синий', picture: '', correct: false, image: img(2) },
        { label: 'зелёный', picture: '', correct: false, image: null },
      ],
    },
    {
      include: true,
      prompt: 'Без картинки у верного',
      lang: 'ru',
      options: [
        { label: 'a', picture: '', correct: true, image: null },
        { label: 'b', picture: '', correct: false, image: img(2) },
        { label: 'c', picture: '', correct: false, image: img(3) },
      ],
    },
    {
      include: false,
      prompt: 'Не взят',
      lang: 'ru',
      options: [
        { label: 'a', picture: '', correct: true, image: img(1) },
        { label: 'b', picture: '', correct: false, image: img(2) },
      ],
    },
  ],
  ...over,
});

describe('buildApproval', () => {
  it('берёт отмеченное; варианты без картинки и вопросы без верной картинки отбрасываются', () => {
    const { body, problem } = buildApproval([segment(), segment({ include: false })], ['c1']);
    expect(problem).toBeNull();
    expect(body).toEqual({
      childIds: ['c1'],
      segments: [
        {
          title: 'Цвета',
          startSec: 30,
          endSec: 150,
          questions: [
            {
              prompt: 'Где красный?',
              lang: 'ru',
              options: [
                { imageId: img(1).id, label: 'красный', isCorrect: true },
                { imageId: img(2).id, label: 'синий', isCorrect: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it('понятные причины, почему нельзя одобрить', () => {
    expect(buildApproval([segment({ include: false })], []).problem).toMatch(/хотя бы один/);
    expect(buildApproval([segment({ endText: '0:40' })], []).problem).toMatch(/от 1 до 5 минут/);
    expect(buildApproval([segment({ startText: 'abc' })], []).problem).toMatch(/м:сс/);
    expect(buildApproval([segment({ title: ' ' })], []).problem).toMatch(/название/);
  });
});

describe('быстрое одобрение', () => {
  const now = new Date('2026-10-11T10:00:00Z');
  const kids = [
    { id: 'old', birthYear: 2021, birthMonth: 6 },
    { id: 'small', birthYear: 2024, birthMonth: 2 },
  ];
  const report = (o: Record<string, unknown> = {}) => ({
    status: 'ready' as const,
    report: {
      model: 'm',
      summary: '',
      language: 'ru' as const,
      ages: [
        { age: '2-3' as const, fit: 'bad' as const, note: '' },
        { age: '4-5' as const, fit: 'good' as const, note: '' },
      ],
      educationalValue: { score: 4, note: '' },
      redFlags: [],
      recommendation: 'approve' as const,
      segments: [{ title: 'Счёт', topic: '', why: '', startSec: 0, endSec: 90, questions: [] }],
      ...o,
    },
  });

  it('детям по возрасту из отчёта', () => {
    const q = quickApproval(report(), kids, now);
    expect(q.problem).toBeNull();
    expect(q.kids).toEqual(['old']);
    expect(q.body).toMatchObject({
      childIds: ['old'],
      segments: [{ title: 'Счёт', startSec: 0, endSec: 90 }],
    });
  });

  it('нельзя: модель советует посмотреть, тревожные моменты, никому не подходит', () => {
    expect(quickApproval(report({ recommendation: 'review' }), kids, now).body).toBeNull();
    expect(
      quickApproval(
        report({ redFlags: [{ type: 'scary', severity: 'medium', at: '', note: '' }] }),
        kids,
        now,
      ).body,
    ).toBeNull();
    expect(
      quickApproval(report({ ages: [{ age: '6', fit: 'good', note: '' }] }), kids, now).problem,
    ).toMatch(/никому/);
  });

  it('возрастные группы', () => {
    expect(ageGroupOf({ birthYear: 2024, birthMonth: 2 }, now)).toBe('2-3');
    expect(ageGroupOf({ birthYear: 2021, birthMonth: 6 }, now)).toBe('4-5');
    expect(ageGroupOf({ birthYear: 2020, birthMonth: 1 }, now)).toBe('6');
  });
});
