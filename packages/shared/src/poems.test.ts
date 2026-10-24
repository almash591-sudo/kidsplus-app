import { describe, expect, it } from 'vitest';
import { gameSpec } from './games';
import { specAtLevel } from './levels';
import {
  blankPart,
  blanksFor,
  isClayPicture,
  lineStart,
  partSpeech,
  poemAnnounce,
  POEM_CODES,
  poemWords,
  POEMS,
  type Poem,
} from './poems';

const words = (p: Poem) => p.parts.flatMap((part) => part.lines.flatMap(poemWords));
const hasRun = (all: string[], run: string[]) =>
  all.some((_, i) => run.every((w, k) => all[i + k] === w));

describe('библиотека стихов и сказок', () => {
  for (const code of POEM_CODES) {
    const p: Poem = POEMS[code];
    it(`${code}: части, заучивание, «Договори» и вопросы сходятся с текстом`, () => {
      expect(p.parts.length).toBeGreaterThan(0);
      for (const part of p.parts) {
        expect(isClayPicture(part.picture)).toBe(true);
        // Каждая фраза голосу — в пределах /kid/speech.
        for (const t of partSpeech(part)) expect(t.length).toBeLessThanOrEqual(200);
      }
      // То, что учим, — дословно из произведения.
      for (const group of p.learn) {
        expect(group.length).toBeGreaterThan(0);
        expect(hasRun(words(p), poemWords(group.join(' '))), group.join(' ')).toBe(true);
      }
      for (const b of p.blanks) {
        expect(blankPart(p, b), `${b.cue} ${b.word}`).toBeGreaterThanOrEqual(0);
        expect(b.wrong.length).toBeGreaterThanOrEqual(3);
        const all = [b.word, ...b.wrong.map((w) => w[0])];
        expect(new Set(all).size).toBe(all.length);
        expect(new Set([b.picture, ...b.wrong.map((w) => w[1])]).size).toBe(all.length);
      }
      expect(p.questions.length).toBeGreaterThanOrEqual(2);
      for (const q of p.questions) {
        expect(q.wrong.length).toBeGreaterThanOrEqual(3);
        const pics = [q.answer[1], ...q.wrong.map((w) => w[1])];
        expect(new Set(pics).size).toBe(pics.length);
      }
    });
  }

  it('объявление: жанр, название, автор', () => {
    expect(poemAnnounce(POEMS.osen)).toBe('Стихотворение «Осень наступила». Алексей Плещеев.');
    expect(poemAnnounce(POEMS.repka)).toBe('Русская народная сказка «Репка».');
    expect(poemAnnounce(POEMS.petushok)).toBe('Потешка «Петушок, петушок».');
    expect(poemAnnounce(POEMS.strekoza)).toBe('Басня «Стрекоза и Муравей». Иван Крылов.');
    expect(poemAnnounce(POEMS.kolobok)).toBe('Русская народная сказка «Колобок».');
  });

  it('«Договори»: слово из ещё не начатой части ждёт, у сказки — все сразу', () => {
    expect(blanksFor(POEMS.osen, 0).map((b) => b.word)).toEqual(['цветы', 'кусты']);
    expect(blanksFor(POEMS.osen, 1).map((b) => b.word)).toEqual(['цветы', 'кусты', 'травка']);
    expect(blanksFor(POEMS.osen, 4)).toHaveLength(POEMS.osen.blanks.length);
    expect(blanksFor(POEMS.repka, 0)).toHaveLength(POEMS.repka.blanks.length);
    // Рассказ без заучивания — все сразу; у басни — слово за выученными строками тоже сразу.
    expect(blanksFor(POEMS.golubka, 0)).toHaveLength(POEMS.golubka.blanks.length);
    expect(blanksFor(POEMS.strekoza, 0).map((b) => b.word)).toEqual(['Стрекоза', 'попляши']);
    // Песенка колобка: «…я от бабушки» — когда дошли до третьей группы.
    expect(blanksFor(POEMS.kolobok, 1).map((b) => b.word)).not.toContain('бабушки');
    expect(blanksFor(POEMS.kolobok, 2).map((b) => b.word)).toContain('бабушки');
    // Ответ звучит под картинкой своей части.
    const birds = POEMS.osen.blanks.find((b) => b.word === 'птички')!;
    expect(blankPart(POEMS.osen, birds)).toBe(7);
  });

  it('начало строки для «Расскажи вместе»', () => {
    expect(lineStart('Петушок, петушок,')).toBe('Петушок…');
    expect(lineStart('И глядят уныло')).toBe('И глядят…');
    expect(lineStart('В тёплые края.')).toBe('В тёплые…');
    expect(lineStart('Тянут-потянут —')).toBe('Тянут-потянут…');
  });

  it('длинная часть сказки звучит по строкам', () => {
    expect(partSpeech({ lines: ['а'.repeat(150), 'б'.repeat(60)], picture: 'x' })).toHaveLength(2);
    expect(partSpeech(POEMS.osen.parts[0]!)).toEqual(['Осень наступила,\nВысохли цветы,']);
  });

  it('схема игры и уровни: больше вариантов ответа', () => {
    const spec = gameSpec.parse({ kind: 'poem', poem: 'osen' });
    expect(spec).toMatchObject({ repeat: true, blanks: true, questions: true, choices: 3 });
    expect(() => gameSpec.parse({ kind: 'poem', poem: 'nope' })).toThrow();
    expect(specAtLevel(spec, 1)).toBe(spec);
    expect(specAtLevel(spec, 4)).toMatchObject({ choices: 4 });
  });
});
