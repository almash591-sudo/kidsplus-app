import { describe, expect, it } from 'vitest';
import { questionInput, quizDefaults, quizSettings } from './api';

const now = new Date('2026-10-07');
const IMG = '00000000-0000-4000-8000-000000000001';

describe('настройки квиза по возрасту (п. 5.4 ТЗ)', () => {
  it('2 года — 2 варианта, 3 вопроса', () => {
    expect(quizDefaults({ birthYear: 2024, birthMonth: 8 }, now)).toEqual({
      options: 2,
      questions: 3,
    });
  });
  it('5 лет — 4 варианта, 5 вопросов', () => {
    expect(quizDefaults({ birthYear: 2021, birthMonth: 3 }, now)).toEqual({
      options: 4,
      questions: 5,
    });
  });
  it('настройки родителя важнее возраста', () => {
    expect(
      quizSettings({ birthYear: 2024, birthMonth: 8, quizOptions: 4, quizQuestions: null }, now),
    ).toEqual({ options: 4, questions: 3 });
  });
});

describe('questionInput', () => {
  const opt = (isCorrect: boolean) => ({ imageId: IMG, label: 'кошка', isCorrect });

  it('принимает вопрос с одним верным вариантом', () => {
    expect(
      questionInput.safeParse({
        prompt: 'Где кошка?',
        lang: 'ru',
        options: [opt(true), opt(false)],
      }).success,
    ).toBe(true);
  });

  it.each([
    ['нет верного', [opt(false), opt(false)]],
    ['два верных', [opt(true), opt(true), opt(false)]],
    ['один вариант', [opt(true)]],
    ['пять вариантов', [opt(true), opt(false), opt(false), opt(false), opt(false)]],
  ])('отклоняет: %s', (_, options) => {
    expect(questionInput.safeParse({ prompt: 'Где кошка?', lang: 'ru', options }).success).toBe(
      false,
    );
  });
});

describe('requiredSpeechLangs', () => {
  it('русский нужен всегда; плюс языки профиля и карточек, без повторов', async () => {
    const { requiredSpeechLangs } = await import('./api');
    expect(requiredSpeechLangs(['ru'], [])).toEqual(['ru']);
    expect(requiredSpeechLangs(['en'], ['en', 'zh'])).toEqual(['ru', 'en', 'zh']);
  });
});
