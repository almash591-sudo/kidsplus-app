import { schema } from '@kidsplus/db';
import type { ChildAnalytics } from '@kidsplus/shared/analytics';
import { ruleAdvice } from '@kidsplus/shared/analytics';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createChild,
  girl,
  makeApp,
  setupParent,
  SETUP_TOKEN,
  type TestApp,
} from '../test/helpers';
import { materialStats, weakRefs, withReview, type Answer } from '@kidsplus/db/analytics';

let t: TestApp;
let parent: Record<string, string>;
let child: string;

beforeEach(async () => {
  t = await makeApp({ setupToken: SETUP_TOKEN });
  t.clock.now = new Date('2026-10-14T10:00:00Z');
  parent = await setupParent(t);
  child = await createChild(t, parent, girl({ gender: 'f' }));
});
afterEach(() => t.close());

const deck = async (title: string, category: string) =>
  (await t.db.insert(schema.flashcardDecks).values({ title, category }).returning())[0]!.id;

/** Ответ на карточку набора: firstTry — с первой попытки. */
const answer = (deckId: string, firstTry: boolean, timeMs = 2000, daysAgo = 0) =>
  t.db.insert(schema.events).values({
    childId: child,
    type: 'quiz_answer',
    payload: { deckId, firstTry, attempts: firstTry ? 1 : 2, timeMs },
    createdAt: new Date(t.clock.now.getTime() - daysAgo * 86_400_000),
  });

const analytics = async (days = 7) =>
  (
    await t.app.inject({
      url: `/api/parent/children/${child}/analytics?days=${days}`,
      cookies: parent,
    })
  ).json<ChildAnalytics>();

describe('аналитика', () => {
  it('точность с первой попытки, слабые и лёгкие темы, время по дням', async () => {
    const africa = await deck('Животные Африки', 'nature');
    const numbers = await deck('Цифры', 'math');
    for (const ok of [true, false, false, false, true]) await answer(africa, ok, 5000);
    for (let i = 0; i < 4; i++) await answer(numbers, true, 1500);
    await t.db
      .insert(schema.dayUsage)
      .values({ childId: child, date: '2026-10-14', activity: 'math', seconds: 900 });

    const a = await analytics();
    expect(a).toMatchObject({ from: '2026-10-08', to: '2026-10-14' });
    expect(a.days).toHaveLength(7);
    expect(a.days.at(-1)).toEqual({ date: '2026-10-14', seconds: { math: 900 } });
    expect(a.weak.map((m) => m.title)).toEqual(['Животные Африки']);
    expect(a.weak[0]).toMatchObject({ answers: 5, firstTry: 2, avgMs: 5000 });
    expect(a.easy.map((m) => m.title)).toEqual(['Цифры']);
    expect(a.subjects.find((s) => s.subject === 'math')).toMatchObject({
      seconds: 900,
      answers: 4,
      firstTry: 4,
    });

    const tips = ruleAdvice(a, { nature: 'Природа', math: 'Математика' });
    expect(tips[0]).toContain('Животные Африки');
    expect(tips.join(' ')).toContain('даётся легко');
  });

  it('старые ответы и чужие дети не учитываются', async () => {
    const africa = await deck('Животные Африки', 'nature');
    for (let i = 0; i < 5; i++) await answer(africa, false, 3000, 10);
    expect((await analytics()).materials).toEqual([]);
    expect((await analytics(30)).weak).toHaveLength(1);
  });

  it('слабое место повторяется: вторым пунктом урока своего предмета', async () => {
    const africa = await deck('Животные Африки', 'nature');
    for (let i = 0; i < 3; i++) await answer(africa, false);
    const review = await weakRefs(t.db, child, 'nature', t.clock.now);
    expect(review).toEqual([{ segmentId: null, deckId: africa, interactiveId: null }]);
    expect(await weakRefs(t.db, child, 'math', t.clock.now)).toEqual([]);
    const ref = (id: string) => ({ segmentId: null, deckId: id, interactiveId: null });
    expect(withReview([ref('a'), ref('b'), ref(africa)], review)).toEqual([
      ref('a'),
      ref(africa),
      ref('b'),
    ]);
  });

  it('мало ответов — выводов нет', () => {
    const meta = new Map([['d', { title: 'Набор', subject: 'math' as const }]]);
    const two: Answer[] = [
      { kind: 'deck', id: 'd', firstTry: false, timeMs: 1000 },
      { kind: 'deck', id: 'd', firstTry: false, timeMs: 3000 },
    ];
    const s = materialStats(two, meta);
    expect(s.materials[0]).toMatchObject({ answers: 2, avgMs: 2000 });
    expect(s.weak).toEqual([]);
  });

  it('аналитику видит только родитель', async () => {
    const res = await t.app.inject({ url: `/api/parent/children/${child}/analytics` });
    expect(res.statusCode).toBe(401);
  });
});
