// «Пора спать» (этап 31): ночной экран — сказка, колыбельная, потом темнота до утра.
// За несколько минут до отбоя — «Скоро спать!» с вечерними делами; утром — «Доброе утро!».
import type { KidBedtime } from '@kidsplus/shared/bedtime';
import type { BedtimeNow } from '@kidsplus/shared/bedtime';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { kidApi } from '../api';
import { playSequence, stopAudio } from '../audio';
import { musicBox } from '../fx';
import { ru } from '../games/common';
import { setNightMode } from '../kiosk';
import {
  BEDTIME_SOON,
  BEDTIME_SOON_PLAIN,
  MORNING,
  MORNING_PLAIN,
  NIGHT_END,
  NIGHT_HUSH,
  NIGHT_LULLABY,
  NIGHT_QUIET,
  NIGHT_STORY,
} from '../phrases';
import { useHabits } from './HabitsScreen';

/** Колыбельная после сказки и одна — сколько секунд. */
export const LULLABY_AFTER_STORY_S = 150;
export const LULLABY_ALONE_S = 300;
/** Разбуженный касанием экран снова темнеет через столько. */
const HUSH_MS = 9000;

type Stage = 'intro' | 'story' | 'lullaby' | 'track' | 'asleep';

const memory = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // без памяти — покажется ещё раз
    }
  },
};

/** Звёзды неба: позиции фиксированы, чтобы небо не «прыгало» при перерисовке. */
const STARS = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: (i * 53 + 7) % 62,
  delay: (i * 0.37) % 4,
  size: 2 + (i % 3),
}));

export function NightScreen({ night }: { night: BedtimeNow }) {
  const [plan, setPlan] = useState<KidBedtime | null>(null);
  const [stage, setStage] = useState<Stage>('intro');
  const [hush, setHush] = useState<string | null>(null);
  const [part, setPart] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    memory.set('kp-night', night.night);
  }, [night.night]);

  // Сценарий — один на ночь: день с сервера обновляется каждую минуту, сказка не начинается заново.
  useEffect(() => {
    let off = false;
    kidApi
      .bedtime()
      .then((b) => !off && setPlan(b))
      .catch(
        () =>
          !off &&
          setPlan({ now: null, wakeAt: '', companion: 'lullaby', story: null, track: null }),
      );
    return () => {
      off = true;
    };
  }, [night.night]);

  // Сценарий ночи: вступление → сказка → колыбельная (или запись) → темнота.
  useEffect(() => {
    if (!plan) return;
    let stopped = false;
    let stopBox: (() => void) | null = null;
    stopAudio();
    // Пока звучит — экран не гаснет и почти не светит; потом гаснет сам.
    setNightMode(true);
    const sleep = () => {
      if (stopped) return;
      setNightMode(false);
      setStage('asleep');
    };
    const lullaby = (seconds: number) => {
      if (stopped) return;
      setStage('lullaby');
      stopBox = musicBox(seconds, () => {
        if (stopped) return;
        void playSequence([ru(NIGHT_END)]).then(sleep);
      });
    };
    const run = async () => {
      const story = plan.companion === 'story' ? plan.story : null;
      const intro = story
        ? NIGHT_STORY
        : plan.companion === 'lullaby' || plan.companion === 'story'
          ? NIGHT_LULLABY
          : plan.companion === 'track' && plan.track
            ? NIGHT_LULLABY
            : NIGHT_QUIET;
      await playSequence([ru(intro)]);
      if (stopped) return;
      if (story) {
        setStage('story');
        for (let i = -1; i < story.parts.length; i++) {
          if (stopped) return;
          setPart(i);
          await playSequence([i < 0 ? story.title : story.parts[i]!]);
        }
        if (stopped) return;
        void kidApi.storyPlayed(story.id).catch(() => {});
        return lullaby(LULLABY_AFTER_STORY_S);
      }
      if (plan.companion === 'track' && plan.track) {
        setStage('track');
        const el = new Audio(plan.track.url);
        el.volume = 0.6;
        audioRef.current = el;
        el.onended = () => void playSequence([ru(NIGHT_END)]).then(sleep);
        el.onerror = () => lullaby(LULLABY_ALONE_S);
        void el.play().catch(() => lullaby(LULLABY_ALONE_S));
        return;
      }
      if (plan.companion === 'none') return sleep();
      lullaby(LULLABY_ALONE_S);
    };
    void run();
    return () => {
      stopped = true;
      stopBox?.();
      audioRef.current?.pause();
      audioRef.current = null;
      stopAudio();
      setNightMode(false);
    };
  }, [plan]);

  // Ребёнок коснулся тёмного экрана — совёнок шепчет «спи» и снова темнеет.
  const onTouch = useCallback(() => {
    if (stage !== 'asleep' || hush) return;
    const text = NIGHT_HUSH[Math.floor(Math.random() * NIGHT_HUSH.length)]!;
    setHush(text);
    void playSequence([ru(text)]);
  }, [stage, hush]);
  useEffect(() => {
    if (!hush) return;
    const t = setTimeout(() => setHush(null), HUSH_MS);
    return () => clearTimeout(t);
  }, [hush]);

  const dark = stage === 'asleep' && !hush;
  return (
    <div
      className={`screen night-screen night-${stage}${dark ? ' dark' : ''}`}
      data-testid="night"
      data-stage={stage}
      onPointerDown={onTouch}
    >
      <div className="night-sky" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="night-star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
        <div className="night-moon" />
      </div>
      <div className="night-scene" aria-hidden="true">
        <img className="night-owl" src="/owl/sleep.webp" alt="" draggable={false} />
        <div className="rest-z">
          <span>z</span>
          <span>z</span>
          <span>z</span>
        </div>
      </div>
      {stage === 'story' && plan?.story && (
        <div className="night-story" data-testid="night-story">
          <p className="night-title">{plan.story.title.text}</p>
          <div className="night-pages" aria-hidden="true">
            {[-1, ...plan.story.parts.map((_, i) => i)].map((i) => (
              <span key={i} className={i <= part ? 'on' : ''} />
            ))}
          </div>
        </div>
      )}
      {stage === 'lullaby' && (
        <div className="night-notes" aria-hidden="true">
          <span>♪</span>
          <span>♫</span>
          <span>♪</span>
        </div>
      )}
      {hush && <p className="night-hush">{hush}</p>}
    </div>
  );
}

/** Расписание сна из дня ребёнка (App кладёт сюда today.bedtime) — для слоя поверх экранов. */
let bedtimeNow: BedtimeNow | null = null;
const listeners = new Set<() => void>();
export const bedtimeStore = {
  set(b: BedtimeNow | null) {
    if (b?.phase === bedtimeNow?.phase && b?.night === bedtimeNow?.night) return;
    bedtimeNow = b;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => bedtimeNow,
};
/** Слой просит открыть «Мои дела» — App слушает это событие. */
export const OPEN_HABITS_EVENT = 'kp-open-habits';

type Pop = { kind: 'soon' | 'morning'; text: string; habits: boolean };

/**
 * «Скоро спать!» (раз за вечер) и «Доброе утро!» (после ночного экрана) поверх приложения
 * (подключён в main.tsx). Кнопка «Мои дела» открывает дела.
 */
export function BedtimeLayer() {
  const bedtime = useSyncExternalStore(bedtimeStore.subscribe, bedtimeStore.get);
  const onHabits = () => dispatchEvent(new Event(OPEN_HABITS_EVENT));
  const habits = useHabits();
  const [pop, setPop] = useState<Pop | null>(null);
  const todo = (slot: 'morning' | 'evening') =>
    Boolean(habits?.habits.some((h) => h.slot === slot && !h.done));

  // Ждём дела с сервера: от них зависит, звать ли к ним.
  const loaded = habits !== null;
  useEffect(() => {
    if (!loaded) return;
    if (bedtime?.phase === 'soon') {
      if (memory.get('kp-soon') === bedtime.night) return;
      memory.set('kp-soon', bedtime.night);
      const withHabits = todo('evening');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- показ по событию расписания
      setPop({
        kind: 'soon',
        text: withHabits ? BEDTIME_SOON : BEDTIME_SOON_PLAIN,
        habits: withHabits,
      });
      return;
    }
    if (bedtime) return;
    const night = memory.get('kp-night');
    if (!night || memory.get('kp-morning') === night || new Date().getHours() >= 12) return;
    memory.set('kp-morning', night);
    const withHabits = todo('morning');
    setPop({ kind: 'morning', text: withHabits ? MORNING : MORNING_PLAIN, habits: withHabits });
    // todo читает свежие дела; повторный показ отсекает память телефона.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, bedtime?.phase, bedtime?.night]);

  useEffect(() => {
    if (!pop) return;
    navigator.vibrate?.([120, 80, 120]);
    void playSequence([ru(pop.text)]);
    const t = setTimeout(() => setPop(null), 12_000);
    return () => clearTimeout(t);
  }, [pop]);

  if (!pop || bedtime?.phase === 'night') return null;
  return (
    <div
      className={`habit-pop bedtime-pop ${pop.kind}`}
      data-testid={`bedtime-${pop.kind}`}
      onPointerDown={() => setPop(null)}
    >
      <img
        className="bedtime-owl"
        src={pop.kind === 'soon' ? '/owl/sleep.webp' : '/owl/wave.webp'}
        alt=""
        draggable={false}
      />
      <p>{pop.text}</p>
      {pop.habits && (
        <button
          type="button"
          className="bedtime-habits"
          data-testid="bedtime-habits"
          onPointerDown={(e) => {
            e.stopPropagation();
            setPop(null);
            onHabits();
          }}
        >
          <img src="/habits/jar.webp" alt="" draggable={false} />
          Мои дела
        </button>
      )}
    </div>
  );
}
