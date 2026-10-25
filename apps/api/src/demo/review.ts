// Промо-съёмка (этап 48): на демо-стенде нет модели и worker, поэтому «ИИ смотрит» только видео
// из этого списка — готовый ответ в том же виде, что присылает Gemini (схема videoAnalysis).
import type { DraftSegment, ModerationReport, VideoAnalysis } from '@kidsplus/shared/moderation';
import { parseTimecode } from '@kidsplus/shared/moderation';
import { mediaUrl } from '@kidsplus/shared/api';

export interface DemoReview {
  title: string;
  durationSec: number;
  analysis: VideoAnalysis;
}

const opt = (label: string, emoji: string, correct = false) => ({
  label,
  picture: label,
  emoji,
  correct,
});

export const DEMO_REVIEWS: Record<string, DemoReview> = {
  demohedge01: {
    title: 'Ёжик и лесные друзья',
    durationSec: 312,
    analysis: {
      summary:
        'Ёжик идёт по осеннему лесу и знакомится с белкой, зайцем и совой. Спокойный темп, ' +
        'понятная речь, каждое животное называют несколько раз.',
      language: 'ru',
      ages: [
        { age: '2-3', fit: 'good', note: 'Спокойно, простые слова и много повторов.' },
        { age: '4-5', fit: 'bad', note: 'Слишком просто — будет скучно.' },
      ],
      educationalValue: {
        score: 4,
        note: 'Лесные животные и где они живут — подходит к теме «Лесные жители».',
      },
      redFlags: [
        {
          type: 'scary',
          severity: 'low',
          at: '4:12',
          note: 'Гроза и громкий гром — в предложенный фрагмент не входит.',
        },
      ],
      recommendation: 'approve',
      segments: [
        {
          title: 'Ёжик знакомится с лесными жителями',
          topic: 'Лесные жители',
          start: '0:20',
          end: '3:10',
          why: 'Белку, зайца и сову показывают крупно и называют по нескольку раз.',
          questions: [
            {
              prompt: 'Где ёжик?',
              lang: 'ru',
              options: [
                opt('ёжик', '🦔', true),
                opt('заяц', '🐰'),
                opt('сова', '🦉'),
                opt('лиса', '🦊'),
              ],
            },
            {
              prompt: 'Кто живёт в дупле?',
              lang: 'ru',
              options: [
                opt('белка', '🐿', true),
                opt('рыбка', '🐟'),
                opt('корова', '🐄'),
                opt('пингвин', '🐧'),
              ],
            },
            {
              prompt: 'Кто не спит ночью?',
              lang: 'ru',
              options: [
                opt('сова', '🦉', true),
                opt('курица', '🐔'),
                opt('поросёнок', '🐷'),
                opt('заяц', '🐰'),
              ],
            },
          ],
        },
      ],
    },
  },
};

/** Код twemoji по эмодзи: «🦔» → «1f994» (без селектора варианта). */
export const emojiCode = (e: string) =>
  [...e]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((h) => h !== 'fe0f')
    .join('-');

/** Отчёт, как его собирает worker: фрагменты в секундах, картинки вариантов — эмодзи. */
export async function demoReport(
  a: VideoAnalysis,
  picture: (code: string) => Promise<string>,
): Promise<ModerationReport> {
  const segments: DraftSegment[] = [];
  for (const s of a.segments)
    segments.push({
      title: s.title,
      topic: s.topic,
      why: s.why,
      startSec: parseTimecode(s.start)!,
      endSec: parseTimecode(s.end)!,
      questions: await Promise.all(
        s.questions.map(async (q) => ({
          prompt: q.prompt,
          lang: q.lang,
          options: await Promise.all(
            q.options.map(async (o) => {
              const imageId = await picture(emojiCode(o.emoji));
              return {
                label: o.label,
                picture: o.picture,
                correct: o.correct,
                imageId,
                imageUrl: mediaUrl(imageId),
              };
            }),
          ),
        })),
      ),
    });
  const { summary, language, ages, educationalValue, redFlags, recommendation } = a;
  return {
    model: 'demo',
    summary,
    language,
    ages,
    educationalValue,
    redFlags,
    recommendation,
    segments,
  };
}
