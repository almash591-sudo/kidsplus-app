// Живой совёнок (этап 32): поверх меню прилетает по делу — садится на урок или копилку дел,
// стучит по стеклу, прячется за плиткой, подлетает похвалить, вечером зевает. Касание совёнка —
// он отвечает. Не чаще раза в минуту; при «уменьшить движение» — без полётов и тряски.
import { useEffect, useRef, useState } from 'react';
import { slotAt } from '@kidsplus/shared/habits';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { burst } from '../games/juice';
import {
  OWL_FOUND,
  OWL_HABITS,
  OWL_KNOCK,
  OWL_LESSON,
  OWL_PEEK,
  OWL_PRAISE,
  OWL_TAP,
  OWL_YAWN,
} from '../phrases';
import { useHabits } from '../screens/HabitsScreen';
import { owlBus } from './bus';
import { AWAY_KNOCK_MS, pick, pickScene, type OwlScene, type PerchTarget } from './director';

type Frame =
  | 'master'
  | 'blink'
  | 'talk'
  | 'happy'
  | 'wave'
  | 'point'
  | 'flyup'
  | 'flydown'
  | 'sleep'
  | 'knock'
  | 'peek'
  | 'closeup';
const src = (f: Frame) => `/owl/${f}.webp`;
const FRAMES: Frame[] = [
  'happy',
  'wave',
  'point',
  'flyup',
  'flydown',
  'sleep',
  'knock',
  'peek',
  'closeup',
  'talk',
];

/** Размер совёнка на кнопке; близко — в несколько раз больше. */
const SIZE = 96;
/** Как часто режиссёр решает, не пора ли сценке. */
const TICK_MS = 4000;

const LESSON = '[data-testid=subject]:not(.done), [data-testid=tile], [data-testid=category]';
const TILES =
  '[data-testid=subject], [data-testid=free], [data-testid=tile], [data-testid=category]';
const TARGET: Record<PerchTarget, string> = {
  lesson: LESSON,
  habits: '[data-testid=habits-open]',
};

type Pos = { x: number; y: number; s: number };
type Mode = 'away' | 'perch' | 'peek' | 'big';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const minuteNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Видимый элемент на экране (первый подходящий или случайный). */
function findTarget(selector: string, random = false): DOMRect | null {
  const rects = Array.from(document.querySelectorAll(selector))
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 40 && r.top > 24 && r.bottom < innerHeight && r.left >= 0);
  if (!rects.length) return null;
  return random ? pick(rects) : rects[0]!;
}

export function LiveOwl({ evening }: { evening: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame>('master');
  const [mode, setMode] = useState<Mode>('away');
  const [bubble, setBubble] = useState<string | null>(null);
  const habits = useHabits();

  const pos = useRef<Pos>({ x: -SIZE * 2, y: innerHeight * 0.3, s: 1 });
  const busy = useRef(false);
  const lastSceneAt = useRef(0);
  /** Когда ребёнок касался экрана (ставится при появлении меню). */
  const touchedAt = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const returned = useRef(false);
  const alive = useRef(true);
  /** Касание во время пряток — «нашёл!». */
  const found = useRef<(() => void) | null>(null);
  const ctx = useRef({ evening, habitsDue: false });
  useEffect(() => {
    ctx.current = {
      evening,
      habitsDue: Boolean(habits?.habits.some((h) => h.slot === slotAt(minuteNow()) && !h.done)),
    };
  });

  useEffect(() => {
    alive.current = true;
    touchedAt.current = Date.now();
    for (const f of FRAMES) new Image().src = src(f);

    const place = (p: Pos, flip = 1) => {
      pos.current = p;
      if (el.current)
        el.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.s * flip}, ${p.s})`;
    };
    place(pos.current);

    /** Перелёт с взмахами крыльев по дуге. */
    const fly = async (to: Pos, ms = 1300) => {
      const node = el.current;
      if (!node || !alive.current) return;
      const from = pos.current;
      const flip = to.x < from.x ? -1 : 1;
      const tf = (p: Pos) => `translate(${p.x}px, ${p.y}px) scale(${p.s * flip}, ${p.s})`;
      let up = true;
      const flap = setInterval(() => {
        up = !up;
        setFrame(up ? 'flyup' : 'flydown');
      }, 110);
      const mid = {
        x: (from.x + to.x) / 2,
        y: Math.min(from.y, to.y) - 70,
        s: (from.s + to.s) / 2,
      };
      const anim = node.animate(
        [{ transform: tf(from) }, { transform: tf(mid) }, { transform: tf(to) }],
        {
          duration: calm() ? 1 : ms,
          easing: 'ease-in-out',
        },
      );
      await anim.finished.catch(() => {});
      clearInterval(flap);
      place(to);
    };
    const offscreen = (): Pos => ({
      x: Math.random() < 0.5 ? -SIZE * 1.6 : innerWidth + SIZE * 0.6,
      y: innerHeight * (0.15 + Math.random() * 0.3),
      s: 1,
    });
    const say = async (text: string, f: Frame = 'talk') => {
      setFrame(f);
      setBubble(text);
      await Promise.race([playSequence([ru(text)]), wait(5000)]);
      if (alive.current) setBubble(null);
    };
    const leave = async () => {
      setFrame('wave');
      await wait(500);
      await fly(offscreen(), 1100);
      setMode('away');
      setFrame('master');
    };
    /** Сесть сверху на кнопку. */
    const perchOn = (r: DOMRect, s = 1): Pos => ({
      x: r.left + r.width * 0.72 - (SIZE * s) / 2,
      y: Math.max(4, r.top - SIZE * s * 0.78),
      s,
    });
    const center = (s: number): Pos => ({
      x: innerWidth / 2 - SIZE / 2,
      y: innerHeight * 0.38 - SIZE / 2,
      s,
    });
    const shake = () => {
      if (calm()) return;
      const root = document.documentElement;
      root.classList.remove('owl-shake');
      void root.offsetWidth;
      root.classList.add('owl-shake');
      setTimeout(() => root.classList.remove('owl-shake'), 400);
    };

    const scenes: Record<OwlScene['kind'], (s: OwlScene) => Promise<void>> = {
      perch: async (s) => {
        const target = (s as { target: PerchTarget }).target;
        const r = findTarget(TARGET[target]);
        if (!r) return;
        place(offscreen());
        setMode('perch');
        await fly(perchOn(r));
        setFrame('point');
        document.querySelector(TARGET[target])?.classList.add('owl-poked');
        await say(target === 'habits' ? OWL_HABITS : pick(OWL_LESSON), 'point');
        await wait(2500);
        document.querySelectorAll('.owl-poked').forEach((e) => e.classList.remove('owl-poked'));
        await leave();
      },
      knock: async () => {
        place(offscreen());
        setMode('big');
        await fly(center(2.6), 1500);
        setFrame('knock');
        for (let i = 0; i < 3 && alive.current; i++) {
          fx.knock();
          shake();
          el.current?.animate(
            [{ translate: '0 0' }, { translate: '0 -10px' }, { translate: '0 0' }],
            { duration: 220 },
          );
          await wait(330);
        }
        await say(pick(OWL_KNOCK), 'happy');
        await leave();
      },
      peek: async () => {
        const r = findTarget(TILES, true);
        if (!r) return;
        // Совёнок «за плиткой»: низ кадра — ровно по верхнему краю плитки.
        place({
          x: r.left + r.width * (0.2 + Math.random() * 0.4) - SIZE / 2,
          y: r.top - SIZE + 8,
          s: 1,
        });
        setFrame('peek');
        setMode('peek');
        const hit = await Promise.race([
          new Promise<boolean>((res) => (found.current = () => res(true))),
          wait(7000).then(() => false),
        ]);
        found.current = null;
        if (!alive.current) return;
        if (hit) {
          fx.success();
          setMode('perch');
          await say(OWL_PEEK, 'happy');
          await say(pick(OWL_FOUND), 'happy');
          await leave();
        } else {
          setMode('away');
          setFrame('master');
        }
      },
      praise: async () => {
        place(offscreen());
        setMode('big');
        await fly(center(3), 1300);
        burst(undefined, 30);
        fx.success();
        await say(pick(OWL_PRAISE), 'closeup');
        await wait(600);
        await leave();
      },
      yawn: async () => {
        const r = findTarget(TILES, true);
        if (!r) return;
        place(offscreen());
        setMode('perch');
        await fly(perchOn(r), 1800);
        await say(OWL_YAWN, 'sleep');
        await wait(1500);
        await leave();
      },
    };

    const run = async (scene: OwlScene) => {
      busy.current = true;
      try {
        await scenes[scene.kind](scene);
      } finally {
        busy.current = false;
        lastSceneAt.current = Date.now();
        if (alive.current) setBubble(null);
      }
    };

    const tick = () => {
      if (busy.current || document.hidden || !alive.current) return;
      const now = Date.now();
      if (owlBus.take()) return void run({ kind: 'praise' });
      const scene = pickScene({
        now,
        touchedAt: touchedAt.current,
        lastSceneAt: lastSceneAt.current,
        returned: returned.current,
        hasLesson: Boolean(findTarget(LESSON)),
        habitsDue: ctx.current.habitsDue,
        evening: ctx.current.evening,
        random: Math.random,
      });
      returned.current = false;
      if (scene) void run(scene);
    };
    const timer = setInterval(tick, TICK_MS);
    // Похвала, отложенная до возвращения в меню, — сразу.
    const first = setTimeout(tick, 1200);
    const offBus = owlBus.subscribe(() => setTimeout(tick, 300));

    const touched = () => (touchedAt.current = Date.now());
    const onVisible = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current >= AWAY_KNOCK_MS) {
        returned.current = true;
        touchedAt.current = Date.now();
      }
    };
    addEventListener('pointerdown', touched, true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      clearTimeout(first);
      offBus();
      removeEventListener('pointerdown', touched, true);
      document.removeEventListener('visibilitychange', onVisible);
      document.documentElement.classList.remove('owl-shake');
      document.querySelectorAll('.owl-poked').forEach((e) => e.classList.remove('owl-poked'));
    };
  }, []);

  /** Касание совёнка: в прятках — «нашёл!», иначе — кружится и отвечает. */
  const onTap = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (found.current) return found.current();
    if (busy.current && mode !== 'perch') return;
    fx.sparkle();
    setFrame('happy');
    setBubble(pick(OWL_TAP));
    void playSequence([ru(pick(OWL_TAP))]);
    el.current?.animate([{ rotate: '0deg' }, { rotate: '360deg' }], {
      duration: calm() ? 1 : 700,
      easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)',
    });
    setTimeout(() => setBubble(null), 2000);
  };

  return (
    <>
      <div
        ref={el}
        className={`live-owl live-owl-${mode}`}
        data-testid="live-owl"
        data-mode={mode}
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={onTap}
        aria-hidden="true"
      >
        <div className="live-owl-body">
          <img src={src(frame)} alt="" draggable={false} />
        </div>
      </div>
      {bubble && (
        <p className="live-owl-bubble" data-testid="live-owl-bubble" aria-live="polite">
          {bubble}
        </p>
      )}
    </>
  );
}
