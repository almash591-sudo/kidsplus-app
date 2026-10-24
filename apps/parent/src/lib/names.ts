// Прозвище ребёнка в падежах (этап 44): «Есть у Зайки», «Дать Зайке», «Телефон Солнышка».
// Склоняются только надёжные случаи — одно русское слово на -а, -я, -о, у мальчика ещё на
// согласную и -й. Остальное («Котёнок», «Огонёк», «Лев», девочка «Ассоль», латиница) — null:
// тогда фраза строится без падежа («Котёнок: есть · 3»), а не с ошибкой.
import type { Child } from '@kidsplus/shared/api';

export type NickCase = 'gen' | 'dat';
export type Nick = Pick<Child, 'nickname' | 'gender'>;

const CONSONANTS = 'бвгджзклмнпрстфхцчшщ';
/** После них в родительном «-и», а не «-ы»: Зайка → Зайки, Маша → Маши. */
const HUSHING = 'гкхжшщч';
/** Беглая гласная (Котёнок → Котёнка, Птенец → Птенца, Павел → Павла) — не угадываем. */
const FLEETING = /(ок|ёк|ек|ец|ел|ёл|ев)$|^(муравей|воробей|соловей|ручей|улей|пёс)$/;

export function nickCase({ nickname, gender }: Nick, c: NickCase): string | null {
  const name = nickname.trim();
  if (!/^[А-ЯЁа-яё]{2,}$/.test(name)) return null;
  const low = name.toLowerCase();
  const last = low.at(-1)!;
  const before = low.at(-2)!;
  // Прозвище написано заглавными — окончание тоже заглавными.
  const upper = name.at(-1) !== last;
  const form = (cut: number, end: string) =>
    name.slice(0, name.length - cut) + (upper ? end.toUpperCase() : end);
  if (low.endsWith('ия')) return form(1, 'и'); // Мария → Марии (и в дательном)
  if (last === 'я') return form(1, c === 'gen' ? 'и' : 'е'); // Ваня → Вани, Ване
  if (last === 'а' && CONSONANTS.includes(before))
    return form(1, c === 'gen' ? (HUSHING.includes(before) ? 'и' : 'ы') : 'е');
  if (last === 'о' && CONSONANTS.includes(before)) return form(1, c === 'gen' ? 'а' : 'у');
  // Согласная и -й: только у мальчика (женские имена на согласную не склоняются: у Кармен).
  if (gender !== 'm' || FLEETING.test(low)) return null;
  if (last === 'й') return form(1, c === 'gen' ? 'я' : 'ю'); // Николай → Николая
  if (CONSONANTS.includes(last)) return form(0, c === 'gen' ? 'а' : 'у'); // Ёжик → Ёжика
  return null;
}

/** «у Зайки» или null — тогда пишем без падежа. */
export const uNick = (n: Nick) => {
  const g = nickCase(n, 'gen');
  return g ? `у ${g}` : null;
};

/** «Есть у Зайки» / запасная форма «Зайка: есть». */
export const hasLabel = (n: Nick, has: boolean) => {
  const u = uNick(n);
  return u ? `${has ? 'Есть' : 'Нет'} ${u}` : `${n.nickname}: ${has ? 'есть' : 'нет'}`;
};

/** «Дать Зайке» / «Убрать у Зайки»; запасная форма — «Котёнок: дать». */
export const giveLabel = (n: Nick, give: boolean) => {
  const form = give ? nickCase(n, 'dat') : uNick(n);
  if (!form) return `${n.nickname}: ${give ? 'дать' : 'убрать'}`;
  return give ? `Дать ${form}` : `Убрать ${form}`;
};

/** «Телефон Зайки: …» / «Котёнок, телефон: …». */
export const phoneOf = (n: Nick) => {
  const g = nickCase(n, 'gen');
  return g ? `Телефон ${g}` : `${n.nickname}, телефон`;
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Пункт «Скопировать»: «Всё, что есть у Мишутки» / «Всё, что есть: Котёнок». */
export const allOf = (n: Nick) => {
  const u = uNick(n);
  return u ? `Всё, что есть ${u}` : `Всё, что есть: ${n.nickname}`;
};

/** Подсказка библиотеки: «У Мишутки есть ещё» / «Котёнок: есть ещё». */
export const hasMore = (n: Nick) => {
  const u = uNick(n);
  return u ? `${cap(u)} есть ещё` : `${n.nickname}: есть ещё`;
};

/** Итог копирования от одного ребёнка другому. */
export const copiedText = (from: Nick, to: Nick, added: number) => {
  const uFrom = uNick(from);
  const uTo = uNick(to);
  if (added)
    return uFrom
      ? `${to.nickname}: добавлено ${added} — то, что было ${uFrom}`
      : `${from.nickname} → ${to.nickname}: добавлено ${added}`;
  return uFrom && uTo
    ? `${cap(uTo)} уже есть всё, что ${uFrom}`
    : `${from.nickname} → ${to.nickname}: всё уже есть`;
};
