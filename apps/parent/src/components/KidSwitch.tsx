// Переключатель детей (этап 47) — один на весь кабинет: «Пульт», «Распорядок», «Прогресс», план,
// привычки и сон. Раньше было три разных: кружки с буквой, аватарки и сегменты с именами.
// Выбор общий (lib/currentChild); «Все» — только на «Пульте». Один ребёнок — переключателя нет.
// Внутри «Распорядка» у вложенных страниц своего нет: переключатель — у самого «Распорядка».
import { createContext, useContext } from 'react';
import { setCurrentChild, useCurrentChild, useCurrentChildRaw } from '../lib/currentChild';
import { useChildren } from '../queries';
import { KidAvatar, kidColor } from './KidBits';

/** true — страница вложена в «Распорядок» (План, Привычки, Сон). */
export const Embedded = createContext(false);

export function KidSwitch({
  all = false,
  sticky = false,
}: {
  /** Кнопка «Все» (по строке на ребёнка). */
  all?: boolean;
  /** Прилипает к верху при прокрутке. */
  sticky?: boolean;
}) {
  const kids = useChildren().data ?? [];
  const raw = useCurrentChildRaw();
  const [childId] = useCurrentChild();
  const embedded = useContext(Embedded);
  if (kids.length < 2 || embedded) return null;
  const value = all ? (kids.find((k) => k.id === raw)?.id ?? null) : childId;
  return (
    <div
      className={sticky ? 'kid-switch sticky' : 'kid-switch'}
      role="tablist"
      aria-label="Ребёнок"
      data-testid="kid-switch"
    >
      {all && (
        <button
          type="button"
          role="tab"
          aria-selected={!value}
          className={value ? 'all' : 'all on'}
          onClick={() => setCurrentChild(null)}
        >
          Все
        </button>
      )}
      {kids.map((k) => (
        <button
          key={k.id}
          type="button"
          role="tab"
          aria-selected={value === k.id}
          className={value === k.id ? 'on' : ''}
          onClick={() => setCurrentChild(k.id)}
        >
          <span aria-hidden="true">
            <KidAvatar child={k} color={kidColor(kids, k.id)} size={26} />
          </span>
          {k.nickname}
        </button>
      ))}
    </div>
  );
}
