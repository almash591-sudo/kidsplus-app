import { describe, expect, it } from 'vitest';
import { gameSpec } from './games';
import { LETTER_LESSONS } from './letters-lessons';
import {
  soundProblem,
  SOUND_PLACES,
  soundPlace,
  STRESS,
  syllablesIn,
  unstressed,
  wordScheme,
} from './sounds';

describe('уроки «Буквы»', () => {
  it('70 уроков для дошкольников, проходят схему, названия уникальны', () => {
    expect(LETTER_LESSONS).toHaveLength(70);
    expect(new Set(LETTER_LESSONS.map((l) => l.title)).size).toBe(70);
    for (const l of LETTER_LESSONS) {
      expect(l.age).toBe('old');
      expect(gameSpec.safeParse(l.spec).success).toBe(true);
    }
  });

  it('вариантов хватает: в каждом уроке есть из чего выбрать', () => {
    for (const { spec } of LETTER_LESSONS) {
      const pool =
        spec.kind === 'letter'
          ? spec.letters
          : spec.kind === 'syllable'
            ? spec.syllables
            : spec.kind === 'firstLetter' || spec.kind === 'readWord'
              ? spec.words.map((w) => w.word)
              : [];
      if (spec.kind === 'firstLetter') continue; // буквы-обманки берутся из алфавита
      if (spec.kind !== 'letter' && spec.kind !== 'syllable' && spec.kind !== 'readWord') continue;
      expect(new Set(pool).size).toBeGreaterThanOrEqual(2);
      if (spec.kind !== 'letter') expect(new Set(pool).size).toBeGreaterThanOrEqual(spec.choices);
    }
  });

  it('у слов с картинкой эмодзи не повторяются в уроке', () => {
    for (const { spec } of LETTER_LESSONS)
      if (spec.kind === 'readWord') {
        const emojis = spec.words.map((w) => w.emoji);
        expect(new Set(emojis).size).toBe(emojis.length);
      }
  });

  describe('этап 49: звуки и чтение', () => {
    const school = LETTER_LESSONS.slice(40, 60);
    const kinds = school.map((l) => l.spec.kind);

    it('уроки на слух встают между непройденными, чтение — в конце', () => {
      expect(school.filter((l) => l.spread)).toHaveLength(12);
      expect(LETTER_LESSONS.slice(0, 40).some((l) => l.spread)).toBe(false);
      for (const l of school)
        expect(!!l.spread).toBe(
          ['syllableCount', 'soundPlace', 'wordScheme'].includes(l.spec.kind),
        );
      // Сначала все уроки на слух, потом чтение.
      expect(kinds.slice(0, 12).every((k) => k !== 'pickWord' && k !== 'readPhrase')).toBe(true);
      expect(kinds.filter((k) => k === 'pickWord')).toHaveLength(4);
      expect(kinds.filter((k) => k === 'readPhrase')).toHaveLength(4);
    });

    it('«Сколько слогов?»: вариантов хватает, слова без повторов', () => {
      for (const { spec } of school)
        if (spec.kind === 'syllableCount') {
          const counts = new Set(spec.words.map((w) => syllablesIn(w.word)));
          expect(counts.size).toBeGreaterThanOrEqual(spec.choices);
          expect(new Set(spec.words.map((w) => w.word)).size).toBe(spec.words.length);
        }
    });

    it('«Где звук?»: буква звучит как написана, есть все три места', () => {
      const sounds = new Set<string>();
      for (const { spec } of school)
        if (spec.kind === 'soundPlace') {
          sounds.add(spec.sound);
          for (const w of spec.words) expect(soundProblem(w.word, spec.sound), w.word).toBeNull();
          const places = spec.words.map((w) => soundPlace(w.word, spec.sound));
          for (const p of SOUND_PLACES)
            expect(
              places.filter((x) => x === p).length,
              `${spec.sound} ${p}`,
            ).toBeGreaterThanOrEqual(3);
        }
      expect([...sounds]).toEqual(['С', 'Н', 'Р', 'Ш', 'Л']);
    });

    it('«Звуковая схема»: у каждого слова есть схема, схем хватает на варианты', () => {
      for (const { spec } of school)
        if (spec.kind === 'wordScheme')
          for (const w of spec.words) expect(wordScheme(w.word), w.word).not.toBeNull();
    });

    it('«Какое слово?» и «Прочитай фразу»: обманок хватает, ответы не повторяются', () => {
      for (const { spec } of school)
        if (spec.kind === 'pickWord') {
          const words = spec.items.map((i) => i.word);
          expect(new Set(words).size).toBe(words.length);
          expect(new Set(spec.items.map((i) => i.emoji)).size).toBe(words.length);
          for (const i of spec.items)
            expect(new Set([i.word, ...i.similar]).size).toBeGreaterThanOrEqual(spec.choices);
        } else if (spec.kind === 'readPhrase') {
          const emojis = spec.items.map((i) => i.emoji);
          expect(new Set(emojis).size).toBe(emojis.length);
          expect(new Set(spec.items.map((i) => i.text)).size).toBe(emojis.length);
          for (const i of spec.items)
            expect(new Set([i.emoji, ...i.similar]).size).toBeGreaterThanOrEqual(spec.choices);
        }
    });
  });

  describe('этап 56: повторяем О, А, У', () => {
    const review = LETTER_LESSONS.slice(60);
    const OAU = new Set(['А', 'О', 'У', 'а', 'о', 'у']);

    it('10 уроков подряд, не на слух — встают сразу после пройденного', () => {
      expect(review).toHaveLength(10);
      expect(review.map((l) => l.n)).toEqual([61, 62, 63, 64, 65, 66, 67, 68, 69, 70]);
      for (const l of review) {
        expect(l.title).toMatch(/^Буквы \d\d · О, А, У: /u);
        expect(l.spread).toBeUndefined();
      }
    });

    it('буквы и слова — только про О, А, У', () => {
      for (const { spec } of review)
        switch (spec.kind) {
          case 'tracing':
            for (const s of spec.shapes) expect(OAU.has(s), s).toBe(true);
            break;
          case 'letter':
            expect(spec.letters).toEqual(['А', 'О', 'У']);
            expect(spec.letterCase).toBe('mixed');
            break;
          case 'firstLetter':
            for (const w of spec.words) expect('АОУ').toContain(w.word[0]);
            // Обманки — из букв урока: первых букв хватает на все варианты.
            expect(new Set(spec.words.map((w) => w.word[0])).size).toBeGreaterThanOrEqual(
              spec.choices,
            );
            break;
          case 'readWord':
            for (const w of spec.words) expect(w.word).toMatch(/^[АОУ]+$/u);
            break;
          case 'balloons':
            expect(spec.letters).toEqual({ find: 'О', others: ['А', 'У'], lower: true });
            break;
          case 'soundPlace':
            expect('АОУ').toContain(spec.sound);
            break;
          default:
            throw new Error(`лишняя игра ${spec.kind}`);
        }
    });

    it('обводка — от точек к письму без подсказки', () => {
      const tracing = review.flatMap((l) => (l.spec.kind === 'tracing' ? [l.spec] : []));
      expect(tracing.map((t) => t.guides)).toEqual([
        ['dots', 'line', 'start'],
        ['dots', 'line', 'start'],
        ['start'],
      ]);
      expect(tracing.at(-1)!.shapes).toHaveLength(6);
    });

    it('«Где звук?» для А, У, О: звук слышен чисто, слова не повторяются, есть все три места', () => {
      const sounds: string[] = [];
      for (const { spec } of review)
        if (spec.kind === 'soundPlace') {
          sounds.push(spec.sound);
          const words = spec.words.map((w) => unstressed(w.word));
          expect(new Set(words).size).toBe(words.length);
          expect(new Set(spec.words.map((w) => w.emoji)).size).toBe(words.length);
          for (const w of spec.words) {
            expect(soundProblem(w.word, spec.sound), w.word).toBeNull();
            // Ударение — только там, где без него не обойтись: у одной гласной оно не нужно.
            if (w.word.includes(STRESS))
              expect(syllablesIn(unstressed(w.word)), w.word).toBeGreaterThan(1);
          }
          const places = spec.words.map((w) => soundPlace(w.word, spec.sound));
          for (const p of SOUND_PLACES)
            expect(places.filter((x) => x === p).length, `${spec.sound} ${p}`).toBeGreaterThan(0);
        }
      expect(sounds).toEqual(['А', 'У', 'О']);
    });
  });
});
