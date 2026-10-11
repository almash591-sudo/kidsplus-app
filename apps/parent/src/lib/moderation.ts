import type { Child, Language, MediaRef } from '@kidsplus/shared/api';
import { mediaUrl, SEGMENT_MAX_SEC, SEGMENT_MIN_SEC } from '@kidsplus/shared/api';
import {
  AGE_GROUPS,
  type DraftSegment,
  type ModerationApproveRequest,
  type ModerationItem,
} from '@kidsplus/shared/moderation';
import { formatTime, parseTime } from '@kidsplus/shared/time';

/** Фрагмент в редакторе модерации: время текстом (как вводит родитель), флажки «взять». */
export interface EditSegment {
  include: boolean;
  title: string;
  startText: string;
  endText: string;
  note: string;
  questions: {
    include: boolean;
    prompt: string;
    lang: Language;
    options: { label: string; picture: string; correct: boolean; image: MediaRef | null }[];
  }[];
}

/**
 * Тело одобрения из редактора или понятная причина, почему одобрить пока нельзя.
 * Варианты без картинки в квиз не попадают; вопрос берётся, если у верного варианта
 * есть картинка и всего вариантов с картинками не меньше двух.
 */
export function buildApproval(
  segments: EditSegment[],
  childIds: string[],
): { body: ModerationApproveRequest | null; problem: string | null } {
  const chosen = segments.filter((s) => s.include);
  if (!chosen.length) return { body: null, problem: 'Отметьте хотя бы один фрагмент.' };
  const out: ModerationApproveRequest['segments'] = [];
  for (const [i, s] of chosen.entries()) {
    const name = `Фрагмент ${i + 1} («${s.title || 'без названия'}»)`;
    const start = parseTime(s.startText);
    const end = parseTime(s.endText);
    if (!s.title.trim()) return { body: null, problem: `${name}: укажите название.` };
    if (start === null || end === null)
      return { body: null, problem: `${name}: время в формате м:сс.` };
    const len = end - start;
    if (len < SEGMENT_MIN_SEC || len > SEGMENT_MAX_SEC) {
      return {
        body: null,
        problem: `${name}: длительность ${formatTime(Math.max(0, len))} — нужно от 1 до 5 минут.`,
      };
    }
    const questions = s.questions
      .filter((q) => q.include && q.prompt.trim())
      .map((q) => ({
        prompt: q.prompt.trim(),
        lang: q.lang,
        options: q.options
          .filter((o) => o.image)
          .map((o) => ({
            imageId: o.image!.id,
            label: o.label.slice(0, 60) || '—',
            isCorrect: o.correct,
          })),
      }))
      .filter((q) => q.options.length >= 2 && q.options.filter((o) => o.isCorrect).length === 1);
    out.push({ title: s.title.trim(), startSec: start, endSec: end, questions });
  }
  return { body: { segments: out, childIds }, problem: null };
}

/** Черновик модели → фрагмент редактора (всё отмечено «взять»). */
export function draftToEdit(s: DraftSegment): EditSegment {
  return {
    include: true,
    title: s.title,
    startText: formatTime(s.startSec),
    endText: formatTime(s.endSec),
    note: s.why,
    questions: s.questions.map((q) => ({
      include: true,
      prompt: q.prompt,
      lang: q.lang,
      options: q.options.map((o) => ({
        label: o.label,
        picture: o.picture,
        correct: o.correct,
        image: o.imageId ? { id: o.imageId, url: mediaUrl(o.imageId), status: 'ready' } : null,
      })),
    })),
  };
}

/** Возрастная группа отчёта модели для ребёнка. */
export function ageGroupOf(
  child: Pick<Child, 'birthYear' | 'birthMonth'>,
  now = new Date(),
): (typeof AGE_GROUPS)[number] {
  const months =
    (now.getFullYear() - child.birthYear) * 12 + (now.getMonth() + 1 - child.birthMonth);
  const years = Math.floor(months / 12);
  return years <= 3 ? '2-3' : years <= 5 ? '4-5' : '6';
}

/**
 * Быстрое одобрение (Кабинет 2.0): фрагменты и вопросы как предложила модель, детям — по
 * возрасту из отчёта («подходит» или «можно»). Только если модель советует одобрить и не нашла
 * заметных тревожных моментов — иначе нужна подробная проверка.
 */
export function quickApproval(
  item: Pick<ModerationItem, 'status' | 'report'>,
  children: Pick<Child, 'id' | 'birthYear' | 'birthMonth'>[],
  now = new Date(),
): { body: ModerationApproveRequest | null; kids: string[]; problem: string | null } {
  const r = item.report;
  if (item.status !== 'ready' || !r) return { body: null, kids: [], problem: 'Отчёта ещё нет.' };
  if (r.recommendation !== 'approve')
    return { body: null, kids: [], problem: 'Модель советует посмотреть внимательнее.' };
  if (r.redFlags.some((f) => f.severity !== 'low'))
    return { body: null, kids: [], problem: 'Есть тревожные моменты — посмотрите подробно.' };
  const fits = new Map(r.ages.map((a) => [a.age, a.fit]));
  const kids = children
    .filter((c) => {
      const fit = fits.get(ageGroupOf(c, now));
      return fit === 'good' || fit === 'ok';
    })
    .map((c) => c.id);
  if (!kids.length)
    return { body: null, kids, problem: 'По возрасту не подходит никому из детей.' };
  const { body, problem } = buildApproval(r.segments.map(draftToEdit), kids);
  return { body, kids, problem };
}
