// Этап 45: стихи и сказки — занятие, озвучка заранее, картинки, что выучено.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { KidPlaylist } from '@kidsplus/shared/api';
import { gameSpec } from '@kidsplus/shared/games';
import { isClayPicture, POEM_CODES, poemOf } from '@kidsplus/shared/poems';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appPhrases, poemCue, poemPhrases } from '../phrases';
import type { SpecOf } from './common';
import { learnedOf, linePart, markLearned, poemPlan, turnMs } from './poemPlan';

const spec = (over: object = {}) =>
  gameSpec.parse({ kind: 'poem', poem: 'osen', ...over }) as SpecOf<'poem'>;
const kinds = (s: SpecOf<'poem'>, learned: number) => poemPlan(s, learned).map((x) => x.kind);

describe('занятие стихом', () => {
  it('послушать → учить часть → «Договори» → вопросы', () => {
    const plan = poemPlan(spec(), 0);
    expect(plan.map((s) => s.kind)).toEqual(['listen', 'repeat', 'blanks', 'questions']);
    expect(plan[1]).toEqual({ kind: 'repeat', group: 0 });
    // Учим первую часть — и «Договори» только из неё.
    const blanks = plan[2]!.kind === 'blanks' ? plan[2]!.rounds : [];
    expect(blanks.map((r) => r.blank.word)).toEqual(['цветы', 'кусты']);
    for (const r of blanks) {
      expect(r.options).toHaveLength(3);
      expect(r.options).toContainEqual(r.answer);
    }
  });

  it('следующее занятие — следующая часть; всё выучено — «Расскажи вместе»', () => {
    expect(poemPlan(spec(), 2)[1]).toEqual({ kind: 'repeat', group: 2 });
    const recall = poemPlan(spec(), 4)[1]!;
    expect(recall.kind).toBe('recall');
  });

  it('родитель выключил шаги — их нет; сказку без заучивания спрашиваем по всему тексту', () => {
    expect(kinds(spec({ repeat: false, blanks: false, questions: false }), 0)).toEqual(['listen']);
    const tale = poemPlan(spec({ poem: 'repka', repeat: false, questions: false }), 0);
    expect(tale.map((s) => s.kind)).toEqual(['listen', 'blanks']);
    expect(tale[1]!.kind === 'blanks' && tale[1]!.rounds).toHaveLength(3);
  });

  it('рассказ без заучивания (Толстой): сразу «Договори» и вопросы по всему тексту', () => {
    const plan = poemPlan(spec({ poem: 'golubka' }), 0);
    expect(plan.map((x) => x.kind)).toEqual(['listen', 'blanks', 'questions']);
  });

  it('вариантов ответа — сколько задано (уровень прибавляет)', () => {
    const plan = poemPlan(spec({ choices: 4 }), 4);
    for (const step of plan)
      if (step.kind === 'blanks' || step.kind === 'questions')
        for (const r of step.rounds) expect(r.options).toHaveLength(4);
  });

  it('строка — под картинкой своей части; очередь ребёнка 2,5–6 с', () => {
    const p = poemOf('osen');
    expect(linePart(p, 'Птички улетели')).toBe(7);
    expect(linePart(p, 'нет такой строки')).toBe(0);
    expect(turnMs('Петушок, петушок,')).toBe(1200 + 17 * 90);
    expect(turnMs('а')).toBe(2500);
    expect(turnMs('а'.repeat(200))).toBe(6000);
  });
});

describe('что выучено — на телефоне', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('запоминает часть и не больше, чем частей в стихе', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(learnedOf('osen')).toBe(0);
    markLearned('osen', 1);
    expect(learnedOf('osen')).toBe(1);
    markLearned('osen', 0); // назад не откатывается
    expect(learnedOf('osen')).toBe(1);
    markLearned('osen', 99);
    expect(learnedOf('osen')).toBe(poemOf('osen').learn.length);
  });

  it('без хранилища — с начала, без ошибок', () => {
    expect(learnedOf('repka')).toBe(0);
    expect(() => markLearned('repka', 1)).not.toThrow();
  });
});

describe('стихи: озвучка и картинки', () => {
  it('всё, что прозвучит, — заранее нейроголосом', () => {
    const playlist: KidPlaylist = {
      quiz: { options: 2, questions: 3 },
      items: [{ kind: 'interactive', id: 'p1', category: 'poems', spec: spec() }],
      phrases: { correct: [], retry: [], done: [] },
      phrasesEn: { correct: [], retry: [], done: [] },
      immersion: false,
      serverVoice: true,
    };
    const texts = appPhrases(playlist).map((p) => p.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        'Стихи и сказки!',
        'Стихотворение «Осень наступила». Алексей Плещеев.',
        'Осень наступила,\nВысохли цветы,',
        'Осень наступила,',
        'Осень…',
        poemCue('Осень наступила, высохли'),
        'Куда улетели птички?',
        'В тёплые края!',
      ]),
    );
    expect(poemCue('Что ты рано встаёшь, голосисто поёшь,')).toBe(
      'Что ты рано встаёшь, голосисто поёшь…',
    );
    for (const code of POEM_CODES)
      for (const t of poemPhrases(code)) expect(t.length, t).toBeLessThanOrEqual(200);
  });

  it('у каждой сцены и картинки-ответа есть файл', () => {
    const file = (name: string) =>
      fileURLToPath(new URL(`../../public/poems/${name}.webp`, import.meta.url));
    for (const code of POEM_CODES) {
      const p = poemOf(code);
      const pics = [
        ...p.parts.map((x) => x.picture),
        ...p.blanks.flatMap((b) => [b.picture, ...b.wrong.map((w) => w[1])]),
        ...p.questions.flatMap((q) => [q.answer[1], ...q.wrong.map((w) => w[1])]),
      ].filter(isClayPicture);
      for (const name of pics) expect(existsSync(file(name)), name).toBe(true);
    }
    expect(
      existsSync(fileURLToPath(new URL('../../public/games/icon-poem.webp', import.meta.url))),
    ).toBe(true);
  });
});
