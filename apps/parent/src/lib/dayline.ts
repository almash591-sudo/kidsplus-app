// Лента дня ребёнка (этап 33, «Распорядок»): дела утра, уроки плана, дела дня и вечера, отбой —
// по времени, с отметкой «готово / сейчас / позже / не сегодня». Только расчёт, без интерфейса.
// Этап 47: день закрыт (время вышло, завершён вами, выходной) или время дел прошло — не «позже».
import type { ParentSleep } from '@kidsplus/shared/bedtime';
import { slotAt, type HabitSlot, type ParentHabits } from '@kidsplus/shared/habits';
import type { ChildNow, DayClosed, Schedule, Weekday } from '@kidsplus/shared/schedule';
import { SUBJECT_LABELS } from './subjects';

/** missed — сегодня уже не будет: день закрыт или время прошло. */
export type DayState = 'done' | 'now' | 'later' | 'missed';
export interface DayItem {
  key: string;
  /** Минут от полуночи — для порядка. */
  minute: number;
  /** Время, если оно известно (напоминание, начало окна, отбой). */
  time: string | null;
  label: string;
  note: string;
  state: DayState;
  /** Подпись отметки вместо обычной («пропущено» у дел, время которых прошло). */
  stateLabel?: string;
  /** Какая вкладка «Распорядка» меняет эту строку. */
  tab: 'plan' | 'habits' | 'sleep';
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
/** Когда обычно делаются дела, если напоминание не задано. */
const SLOT_MINUTE: Record<HabitSlot, number> = {
  morning: 8 * 60,
  day: 13 * 60,
  evening: 19 * 60 + 30,
};
const SLOT_TITLE: Record<HabitSlot, string> = {
  morning: 'Утренние дела',
  day: 'Дела днём',
  evening: 'Вечерние дела',
};
/** Почему не пройденные уроки сегодня уже не будут. */
const CLOSED_NOTE: Record<DayClosed, string> = {
  ended: 'день завершён вами',
  limit: 'время на сегодня вышло',
  window: 'разрешённое время прошло',
  day_off: 'сегодня занятий нет',
};
const SLOT_ORDER: HabitSlot[] = ['morning', 'day', 'evening'];
const COMPANION: Record<string, string> = {
  story: 'сказка и колыбельная',
  lullaby: 'колыбельная',
  track: 'запись из аудиотеки',
  none: 'тишина',
};

export function dayLine(p: {
  now: ChildNow | undefined;
  schedule: Schedule | undefined;
  habits: ParentHabits | undefined;
  sleep: ParentSleep | undefined;
  weekday: Weekday;
  /** Сейчас, минут от полуночи (в часовом поясе расписания). */
  minute: number;
}): DayItem[] {
  const out: DayItem[] = [];

  // Уроки плана — с начала окна, по порядку предметов дня.
  if (p.now?.mode === 'plan') {
    const w = p.schedule?.windows[p.weekday] ?? null;
    const start = w ? toMin(w.from) : 9 * 60;
    const current = p.now.subjects.find((s) => !s.done);
    // «Вне разрешённого времени» утром — уроки ещё впереди; вечером — уже нет.
    const closed = p.now.closed === 'window' && w && p.minute < toMin(w.from) ? null : p.now.closed;
    p.now.subjects.forEach((s, i) => {
      const left = Math.ceil(s.secondsLeft / 60);
      out.push({
        key: `lesson-${s.subject}`,
        minute: start + i / 100,
        time: i === 0 && w ? w.from : null,
        label: SUBJECT_LABELS[s.subject],
        note: s.done ? 'урок пройден' : closed ? CLOSED_NOTE[closed] : `осталось ${left} мин`,
        state: s.done
          ? 'done'
          : closed
            ? 'missed'
            : s === current && p.now!.online && p.now!.activity === s.subject
              ? 'now'
              : 'later',
        tab: 'plan',
      });
    });
  }

  // Дела — одной строкой на время дня.
  if (p.habits) {
    const today = p.habits.today;
    const nowSlot = slotAt(p.minute);
    for (const slot of Object.keys(SLOT_TITLE) as HabitSlot[]) {
      const list = p.habits.habits.filter((h) => h.slot === slot);
      if (!list.length) continue;
      const times = list
        .map((h) => h.remindAt)
        .filter((t): t is string => Boolean(t))
        .sort();
      const done = list.filter((h) => p.habits!.marks[h.id]?.includes(today)).length;
      const past = SLOT_ORDER.indexOf(slot) < SLOT_ORDER.indexOf(nowSlot);
      out.push({
        key: `habits-${slot}`,
        minute: times[0] ? toMin(times[0]) : SLOT_MINUTE[slot],
        time: times[0] ?? null,
        label: SLOT_TITLE[slot],
        note: `${list.map((h) => h.title.toLowerCase()).join(', ')} · ${done} из ${list.length}`,
        state: done === list.length ? 'done' : slot === nowSlot ? 'now' : past ? 'missed' : 'later',
        ...(past && done < list.length ? { stateLabel: 'пропущено' } : {}),
        tab: 'habits',
      });
    }
  }

  // Отбой — если включён на сегодня.
  const s = p.sleep?.settings;
  if (s?.enabled && s.days.includes(p.weekday)) {
    out.push({
      key: 'bedtime',
      minute: toMin(s.at),
      time: s.at,
      label: 'Отбой',
      note: COMPANION[s.companion] ?? '',
      state: p.sleep!.now?.phase === 'night' ? 'now' : 'later',
      tab: 'sleep',
    });
  }

  return out.sort((a, b) => a.minute - b.minute);
}
