// «Мои дела» (этап 30): утренние, дневные и вечерние дела ребёнка. Сделал — нажал на картинку,
// звёздочка летит в копилку; у зубов — таймер на 2 минуты с совёнком. Напоминания в заданное
// время и праздник выданной награды — слоем поверх любого экрана (HabitLayer в main.tsx).
import type { Speech } from '@kidsplus/shared/api';
import {
  HABIT_SLOTS,
  HABIT_SLOT_LABELS,
  slotAt,
  type HabitSlot,
  type KidHabit,
  type KidHabits,
} from '@kidsplus/shared/habits';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { kidApi } from '../api';
import { playSequence, stopAudio } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { burst, burstAt } from '../games/juice';
import {
  HABIT_ALREADY,
  HABIT_DONE,
  HABIT_GOAL,
  HABIT_GRANT,
  HABIT_SLOT_SAY,
  HABITS_ALL_DONE,
  HABITS_INTRO,
  TEETH_DONE,
  TEETH_STEPS,
} from '../phrases';
import { owlBus } from '../owl/bus';
import { Icon } from '../ui/icons';
import { FairyHeader } from '../ui/FairyGuide';
import { vary } from '../variety';
import { voiceLine } from '../voiceLines';

const picture = (h: Pick<KidHabit, 'preset'>) => `/habits/${h.preset ?? 'custom'}.webp`;
const minuteNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

// ─── Данные ──────────────────────────────────────────────────────────────────

let data: KidHabits | null = null;
/** Отмеченные без связи — уйдут при следующем обновлении. */
const pending = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let timer: ReturnType<typeof setInterval> | undefined;

/** Дела ребёнка: загружаются, пока телефон привязан; обновляются по живому каналу и раз в 5 мин. */
export const habitsStore = {
  get: () => data,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  async refresh() {
    for (const id of [...pending]) {
      try {
        await kidApi.habitDone(id);
        pending.delete(id);
      } catch {
        break;
      }
    }
    try {
      const next = await kidApi.habits();
      // Отмеченное, но ещё не дошедшее до сервера, остаётся отмеченным.
      data = {
        ...next,
        habits: next.habits.map((h) => (pending.has(h.id) ? { ...h, done: true } : h)),
      };
      emit();
    } catch {
      // нет связи — покажем, что было
    }
  },
  start() {
    if (timer) return;
    void habitsStore.refresh();
    timer = setInterval(() => void habitsStore.refresh(), 5 * 60_000);
  },
  stop() {
    clearInterval(timer);
    timer = undefined;
    data = null;
    emit();
  },
  /** Ребёнок отметил дело: сразу на экране, на сервер — как получится. */
  async done(id: string) {
    if (!data?.habits.some((h) => h.id === id && !h.done)) return;
    data = {
      ...data,
      stars: data.stars + 1,
      habits: data.habits.map((h) => (h.id === id ? { ...h, done: true } : h)),
    };
    emit();
    try {
      const r = await kidApi.habitDone(id);
      if (data) data = { ...data, stars: r.stars };
      emit();
    } catch {
      pending.add(id);
    }
  },
  /** Для тестов. */
  set(next: KidHabits | null) {
    data = next;
    emit();
  },
};

export const useHabits = () => useSyncExternalStore(habitsStore.subscribe, habitsStore.get);

// ─── Кнопка в доке ───────────────────────────────────────────────────────────

/** Копилка в доке: звёзд сколько есть; покачивается, если есть несделанные дела на сейчас. */
export function HabitsButton({ onOpen }: { onOpen: () => void }) {
  const habits = useHabits();
  if (!habits?.habits.length) return null;
  const slot = slotAt(minuteNow());
  const todo = habits.habits.some((h) => h.slot === slot && !h.done);
  return (
    <button
      type="button"
      className={todo ? 'habits-open todo' : 'habits-open'}
      aria-label="Мои дела"
      data-testid="habits-open"
      onClick={() => {
        fx.tap();
        onOpen();
      }}
    >
      <img src="/habits/jar.webp" alt="" draggable={false} />
      <span className="habits-count" data-testid="habits-stars">
        {habits.stars}
      </span>
    </button>
  );
}

// ─── Экран ───────────────────────────────────────────────────────────────────

const SLOT_PICTURE: Record<HabitSlot, string> = {
  morning: '/games/cuckoo-day-wake.webp',
  day: '/games/cuckoo-day-walk.webp',
  evening: '/games/cuckoo-day-sleep.webp',
};

export function HabitsScreen({ onExit }: { onExit: () => void }) {
  const habits = useHabits();
  const [slot, setSlot] = useState<HabitSlot>(() => {
    const now = slotAt(minuteNow());
    // Сейчас дел нет — показываем первое время дня, где они есть.
    const has = (s: HabitSlot) => habits?.habits.some((h) => h.slot === s);
    return has(now) ? now : (HABIT_SLOTS.find(has) ?? now);
  });
  const [timer, setTimer] = useState<KidHabit | null>(null);
  const jar = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const returnTo = useRef<string | null>(null);
  const uid = useId();

  useEffect(() => {
    if (timer || !returnTo.current) return;
    const button = [
      ...(screen.current?.querySelectorAll<HTMLButtonElement>('[data-habit-id]') ?? []),
    ].find((el) => el.dataset.habitId === returnTo.current);
    button?.focus();
    returnTo.current = null;
  }, [timer]);

  useEffect(() => {
    const goal = habits?.goal;
    void playSequence([voiceLine(HABITS_INTRO), ...(goal ? [ru(HABIT_GOAL), goal.title] : [])]);
    return () => stopAudio();
    // Приветствие — один раз при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!habits) return null;
  const list = habits.habits.filter((h) => h.slot === slot);
  const slots = HABIT_SLOTS.filter((s) => habits.habits.some((h) => h.slot === s));

  const finish = (h: KidHabit, el?: Element | null) => {
    fx.success();
    if (el) burstAt(el, 18);
    // Звёздочка «летит» в копилку.
    if (jar.current) {
      jar.current.classList.remove('got');
      void jar.current.getBoundingClientRect();
      jar.current.classList.add('got');
    }
    void habitsStore.done(h.id);
    const left = habits.habits.filter((x) => x.slot === h.slot && !x.done && x.id !== h.id);
    const said: Speech[] = [vary('habit-done', HABIT_DONE.map(ru))!];
    if (!left.length) {
      said.push(voiceLine(HABITS_ALL_DONE));
      burst(undefined, 30);
      // Вернётся в меню — совёнок подлетит похвалить (этап 32).
      owlBus.praise();
    }
    void playSequence(said);
  };

  const tap = (h: KidHabit, el: Element) => {
    if (h.done) {
      fx.soft();
      void playSequence([h.title, voiceLine(HABIT_ALREADY)]);
      return;
    }
    if (h.timerSec) {
      fx.tap();
      returnTo.current = h.id;
      setTimer(h);
      return;
    }
    finish(h, el);
  };

  if (timer)
    return (
      <TeethTimer
        habit={timer}
        onDone={() => {
          setTimer(null);
          finish(timer);
        }}
        onExit={() => setTimer(null)}
      />
    );

  const goal = habits.goal;
  const allDone = list.length > 0 && list.every((h) => h.done);
  const chooseSlot = (next: HabitSlot) => {
    fx.tap();
    setSlot(next);
    void playSequence([ru(HABIT_SLOT_SAY[next])]);
  };
  return (
    <div className="screen habits fairy-page fairy-habits" data-testid="habits" ref={screen}>
      <FairyHeader
        title="Мои дела"
        picture="/habits/jar.webp"
        hint={HABITS_INTRO}
        onBack={onExit}
        backTestId="go-home"
      />

      <div className="habits-jar" ref={jar} data-testid="habits-jar">
        <img src="/habits/jar.webp" alt="" draggable={false} />
        <div className="habits-jar-info">
          <span className="habits-jar-label">Мои звёзды</span>
          <b
            data-testid="jar-stars"
            aria-live="polite"
            aria-label={`Звёзд в копилке: ${habits.stars}`}
          >
            {habits.stars}
            <img src="/habits/star.webp" alt="" draggable={false} />
          </b>
        </div>
        {goal && (
          <button
            type="button"
            className="habits-goal"
            data-testid="habits-goal"
            aria-label={`Награда: ${goal.title.text}. ${Math.min(habits.stars, goal.price)} из ${goal.price} звёзд`}
            onClick={() => void playSequence([ru(HABIT_GOAL), goal.title])}
          >
            <img src="/habits/gift.webp" alt="" draggable={false} />
            <span className="habits-goal-title">{goal.title.text}</span>
            <div
              className="habits-goal-bar"
              role="progressbar"
              aria-label="Звёзды на награду"
              aria-valuemin={0}
              aria-valuemax={goal.price}
              aria-valuenow={Math.min(habits.stars, goal.price)}
            >
              <span style={{ width: `${Math.min(100, (habits.stars / goal.price) * 100)}%` }} />
            </div>
            <small>
              {Math.min(habits.stars, goal.price)} / {goal.price}
            </small>
          </button>
        )}
      </div>

      {slots.length > 1 && (
        <div className="habits-slots" role="tablist" aria-label="Время дня" ref={tabs}>
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === slot}
              aria-controls={`habits-panel-${uid}`}
              id={`habits-slot-${s}-${uid}`}
              tabIndex={s === slot ? 0 : -1}
              className={s === slot ? 'on' : ''}
              data-testid={`slot-${s}`}
              onClick={() => chooseSlot(s)}
              onKeyDown={(e) => {
                const index = slots.indexOf(s);
                const next =
                  e.key === 'ArrowRight'
                    ? slots[(index + 1) % slots.length]
                    : e.key === 'ArrowLeft'
                      ? slots[(index + slots.length - 1) % slots.length]
                      : e.key === 'Home'
                        ? slots[0]
                        : e.key === 'End'
                          ? slots.at(-1)
                          : undefined;
                if (!next) return;
                e.preventDefault();
                chooseSlot(next);
                tabs.current
                  ?.querySelector<HTMLButtonElement>(`[data-testid="slot-${next}"]`)
                  ?.focus();
              }}
            >
              <img src={SLOT_PICTURE[s]} alt="" draggable={false} />
              <span>{HABIT_SLOT_LABELS[s]}</span>
              {s === slot && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      )}

      <section
        className="habits-panel"
        role={slots.length > 1 ? 'tabpanel' : undefined}
        id={`habits-panel-${uid}`}
        aria-labelledby={slots.length > 1 ? `habits-slot-${slot}-${uid}` : undefined}
        aria-label={slots.length > 1 ? undefined : HABIT_SLOT_LABELS[slot]}
      >
        {allDone && (
          <p className="habits-all-done" role="status">
            <img src="/habits/star.webp" alt="" draggable={false} />
            Все дела сделаны!
          </p>
        )}
        <div className="habits-grid">
          {list.map((h) => (
            <button
              key={h.id}
              type="button"
              className={h.done ? 'habit done' : 'habit'}
              data-testid="habit"
              data-habit-id={h.id}
              data-done={h.done ? '1' : '0'}
              aria-label={`${h.title.text}${h.done ? ' — сделано' : ''}`}
              aria-pressed={h.done}
              onClick={(e) => tap(h, e.currentTarget)}
            >
              <img src={picture(h)} alt="" draggable={false} />
              <span className="habit-title">{h.title.text}</span>
              {h.done && (
                <span className="habit-check" aria-hidden="true">
                  <Icon name="check" size={24} stroke={3} />
                </span>
              )}
            </button>
          ))}
        </div>
        {!list.length && (
          <div className="habits-empty" role="status">
            <img src="/playroom/bunny.webp" alt="" draggable={false} />
            <p>Пока можно отдохнуть</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Таймер зубов ────────────────────────────────────────────────────────────

/** Чистим зубы вместе с совёнком: круг заполняется за timerSec, совёнок подсказывает. */
export function TeethTimer({
  habit,
  onDone,
  onExit,
}: {
  habit: KidHabit;
  onDone: () => void;
  onExit: () => void;
}) {
  const total = habit.timerSec ?? 120;
  const [left, setLeft] = useState(total);
  const started = useRef(0);
  const said = useRef(-1);

  useEffect(() => {
    started.current = Date.now();
    const t = setInterval(() => {
      const passed = Math.floor((Date.now() - started.current) / 1000);
      setLeft(Math.max(0, total - passed));
    }, 250);
    return () => {
      clearInterval(t);
      stopAudio();
    };
  }, [total]);

  const passed = total - left;
  useEffect(() => {
    // Подсказки — по шагам, пропорционально длине таймера.
    const i = TEETH_STEPS.findLastIndex((s) => passed >= (s.at / 120) * total);
    if (i > said.current) {
      said.current = i;
      void playSequence([ru(TEETH_STEPS[i]!.text)]);
    }
    if (left === 0) {
      void playSequence([ru(TEETH_DONE)]);
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [passed, left, total, onDone]);

  const r = 46;
  const len = 2 * Math.PI * r;
  const step = Math.max(
    0,
    TEETH_STEPS.findLastIndex((s) => passed >= (s.at / 120) * total),
  );
  const stepTitles = ['Верхние зубки', 'Нижние зубки', 'С другой стороны', 'Передние зубки'];
  return (
    <div
      className="screen teeth-timer fairy-page fairy-teeth"
      data-testid="teeth-timer"
      data-left={left}
    >
      <FairyHeader
        title={habit.title.text}
        picture={picture(habit)}
        hint={left === 0 ? TEETH_DONE : TEETH_STEPS[step]!.text}
        onBack={onExit}
        backLabel="Вернуться к моим делам"
        backTestId="timer-exit"
      />
      <div className="teeth-activity">
        <div className="teeth-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={r} className="teeth-ring-bg" />
            <circle
              cx="50"
              cy="50"
              r={r}
              className="teeth-ring-fill"
              strokeDasharray={len}
              strokeDashoffset={len * (left / total)}
            />
          </svg>
          <img
            className={left === 0 ? 'teeth-owl done' : 'teeth-owl'}
            src={left === 0 ? '/playroom/owl-wave.webp' : '/playroom/owl.webp'}
            alt=""
            draggable={false}
          />
          <img className="teeth-brush" src={picture(habit)} alt="" draggable={false} />
        </div>
        <p className="teeth-left" role="timer" aria-label={`Осталось ${left} секунд`}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </p>
        <div className="teeth-guidance">
          <div className="teeth-steps" aria-label={`Шаг ${step + 1} из ${TEETH_STEPS.length}`}>
            {TEETH_STEPS.map((s, i) => (
              <span
                key={s.at}
                className={left === 0 || i < step ? 'done' : i === step ? 'current' : ''}
                aria-hidden="true"
              >
                {left === 0 || i < step ? <Icon name="check" size={20} /> : i + 1}
              </span>
            ))}
          </div>
          <p role="status">{left === 0 ? 'Чистые зубки!' : stepTitles[step]}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Напоминания и награда — поверх любого экрана ───────────────────────────

const seen = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // без памяти — напомнит ещё раз, не страшно
    }
  },
};

/** Напоминание актуально час после заданного времени. */
const REMIND_WINDOW_MIN = 60;
const toMinute = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Какое дело пора напомнить сейчас (не сделано, время пришло, сегодня ещё не напоминали). */
export function dueReminder(habits: KidHabits, minute: number): KidHabit | null {
  return (
    habits.habits.find(
      (h) =>
        h.remindAt &&
        !h.done &&
        minute >= toMinute(h.remindAt) &&
        minute < toMinute(h.remindAt) + REMIND_WINDOW_MIN &&
        seen.get(`kp-remind-${h.id}`) !== habits.date,
    ) ?? null
  );
}

export function HabitLayer() {
  const habits = useHabits();
  const [remind, setRemind] = useState<KidHabit | null>(null);
  // Награда выдана — праздник один раз (какую уже видели — в памяти телефона).
  const [grantSeen, setGrantSeen] = useState(() => seen.get('kp-grant'));
  const g = habits?.lastGrant;
  const grant = g && g.id !== grantSeen ? g : null;
  const closeGrant = () => {
    if (g) seen.set('kp-grant', g.id);
    setGrantSeen(g?.id ?? null);
  };
  useEffect(() => {
    if (!grant) return;
    fx.sparkle();
    burst(undefined, 40);
    void playSequence([ru(HABIT_GRANT), grant.title]);
  }, [grant]);

  // Напоминания: раз в 20 секунд смотрим, не пора ли.
  useEffect(() => {
    if (!habits) return;
    const check = () => {
      const due = dueReminder(habits, minuteNow());
      if (!due) return;
      seen.set(`kp-remind-${due.id}`, habits.date);
      navigator.vibrate?.([200, 100, 200]);
      void playSequence([due.remind]);
      setRemind(due);
    };
    check();
    const t = setInterval(check, 20_000);
    return () => clearInterval(t);
  }, [habits]);

  useEffect(() => {
    if (!remind && !grant) return;
    const t = setTimeout(() => {
      setRemind(null);
      closeGrant();
    }, 10_000);
    return () => clearTimeout(t);
    // closeGrant меняется с каждой отрисовкой; таймер — на показ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remind, grant]);

  if (grant)
    return (
      <div
        className="habit-pop grant fairy-habit-pop"
        data-testid="habit-grant"
        role="status"
        onPointerDown={closeGrant}
      >
        <img src="/habits/gift.webp" alt="" draggable={false} />
        <p>
          {HABIT_GRANT} {grant.title.text}
        </p>
        <button type="button" onClick={closeGrant} aria-label="Продолжить">
          <Icon name="check" size={32} />
        </button>
      </div>
    );
  if (remind)
    return (
      <div
        className="habit-pop fairy-habit-pop"
        data-testid="habit-remind"
        role="status"
        onPointerDown={() => setRemind(null)}
      >
        <img className="habit-pop-owl" src="/playroom/owl-wave.webp" alt="" draggable={false} />
        <img src={picture(remind)} alt="" draggable={false} />
        <p>{remind.remind.text}</p>
        <button type="button" onClick={() => setRemind(null)} aria-label="Продолжить">
          <Icon name="check" size={32} />
        </button>
      </div>
    );
  return null;
}
