import type { Child } from '@kidsplus/shared/api';

export function ageText(child: Pick<Child, 'birthYear' | 'birthMonth'>, now = new Date()): string {
  const months =
    (now.getFullYear() - child.birthYear) * 12 + (now.getMonth() + 1 - child.birthMonth);
  if (months < 0) return '—';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ${plural(m, 'месяц', 'месяца', 'месяцев')}`;
  return m
    ? `${y} ${plural(y, 'год', 'года', 'лет')} ${m} мес.`
    : `${y} ${plural(y, 'год', 'года', 'лет')}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  ru: 'Русский',
  en: 'Английский',
  zh: 'Китайский',
};

export const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
