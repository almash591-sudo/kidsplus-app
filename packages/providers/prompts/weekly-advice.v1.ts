// Рекомендации к недельному отчёту (п. 9 ТЗ) по агрегированным, обезличенным данным:
// возраст, минуты и точность по предметам, названия материалов. Без имени ребёнка.

export const WEEKLY_ADVICE_VERSION = 'weekly-advice.v1';

export interface WeeklyAdviceInput {
  ageYears: number;
  activeDays: number;
  totalMinutes: number;
  subjects: { label: string; minutes: number; answers: number; firstTryPct: number | null }[];
  weak: { title: string; firstTryPct: number }[];
  easy: { title: string; firstTryPct: number }[];
  planTopics: string[];
}

export function weeklyAdvicePrompt(i: WeeklyAdviceInput): string {
  const subjects = i.subjects
    .map(
      (s) =>
        `- ${s.label}: ${s.minutes} мин, ответов ${s.answers}` +
        (s.firstTryPct === null ? '' : `, верно с первой попытки ${s.firstTryPct} %`),
    )
    .join('\n');
  const list = (xs: { title: string; firstTryPct: number }[]) =>
    xs.length ? xs.map((x) => `- «${x.title}» — ${x.firstTryPct} %`).join('\n') : '- нет';
  return `Ты — педагог раннего развития. Помоги родителю по итогам недели занятий ребёнка ${i.ageYears} лет
в детском приложении (короткие видео, карточки, квизы, игры).

Неделя: занимался ${i.activeDays} дн., всего ${i.totalMinutes} мин.
По предметам:
${subjects || '- занятий не было'}

Труднее всего (низкая точность с первой попытки):
${list(i.weak)}

Слишком легко:
${list(i.easy)}

Темы плана на эту неделю: ${i.planTopics.length ? i.planTopics.join(', ') : 'не заданы'}.

Напиши по-русски, тепло и конкретно, без медицинских и психологических диагнозов:
- summary — 2–3 предложения: как прошла неделя;
- tips — до 4 коротких советов, что делать на следующей неделе (что повторить, что усложнить, чем дополнить вне приложения — игры, прогулки, разговоры).

Ответ — только JSON по схеме: {"summary": "...", "tips": ["...", "..."]}.`;
}
