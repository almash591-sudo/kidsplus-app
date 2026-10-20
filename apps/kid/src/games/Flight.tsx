// «Совёнок летит» (этап 36): держи палец — совёнок поднимается, отпустил — плавно снижается.
// Навстречу летят звёздочки (их считают вслух) и тучки (облетать). Проиграть нельзя: тучка только
// «бом» и сбивает с курса. Собрал сколько нужно — победа. На уровнях выше — больше звёзд и тучек,
// быстрее.
import { useEffect, useRef, useState } from 'react';
import { FLIGHT_CLOUD, FLIGHT_PROMPT } from '../phrases';
import { ask, bump, nice, NUMBERS, praise, say, type GameProps, type SpecOf } from './common';

type FlightSpec = Pick<SpecOf<'flight'>, 'clouds' | 'speed'>;

/** Доля тучек среди всего, что летит навстречу. */
const CLOUD_SHARE = { none: 0, few: 0.25, many: 0.45 } as const;
/** Скорость полёта — доля ширины экрана в секунду. */
const SPEED = { slow: 0.2, normal: 0.28, fast: 0.36 } as const;
/** Где можно летать: доли высоты экрана (сверху — счёт звёзд, снизу — холмы). */
export const SKY = { top: 0.14, bottom: 0.84 };

export interface Thing {
  id: number;
  kind: 'star' | 'cloud';
  x: number;
  /** Доля высоты экрана. */
  y: number;
  hit: boolean;
}

/** Что прилетит следующим: тучки не подряд, высота — в пределах неба. */
export function nextThing(spec: FlightSpec, prev: Thing['kind'] | null, rnd = Math.random) {
  const cloud = prev !== 'cloud' && rnd() < CLOUD_SHARE[spec.clouds];
  return {
    kind: cloud ? ('cloud' as const) : ('star' as const),
    y: SKY.top + 0.05 + rnd() * (SKY.bottom - SKY.top - 0.1),
  };
}

/**
 * Шаг полёта: скорость плавно тянется к «вверх» (палец держит) или «вниз»; совёнок не вылетает
 * за небо. y и скорость — в долях высоты экрана.
 */
export function flyStep(y: number, vy: number, down: boolean, dt: number) {
  const want = down ? -0.55 : 0.4;
  const v = vy + (want - vy) * Math.min(1, dt * 5);
  const next = Math.max(SKY.top, Math.min(SKY.bottom, y + v * dt));
  return { y: next, vy: next === y + v * dt ? v : 0 };
}

export function Flight({ spec, phrases, onFinish }: GameProps<'flight'>) {
  const [caught, setCaught] = useState(0);
  const [started, setStarted] = useState(false);
  /** Что сейчас на экране — меняется редко (прилетело, поймали), координаты — в кадре. */
  const [things, setThings] = useState<Thing[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const owlEl = useRef<HTMLImageElement>(null);
  const els = useRef(new Map<number, HTMLElement>());

  const live = useRef({
    started: false,
    down: false,
    y: 0.45,
    vy: 0,
    scroll: 0,
    /** Сколько пролетели с последней звезды или тучки, px. */
    gap: Infinity,
    things: [] as Thing[],
    nextId: 1,
    caught: 0,
    done: false,
    /** До какого времени совёнок мигает после тучки (не ловит вторую сразу). */
    safeUntil: 0,
    cloudSaid: false,
  });

  useEffect(() => {
    void ask(FLIGHT_PROMPT);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // Первый кадр бывает с отметкой раньше performance.now() — шаг не меньше нуля.
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const s = live.current;
      const box = root.current?.getBoundingClientRect();
      const w = box?.width || window.innerWidth;
      const h = box?.height || window.innerHeight;
      const owlW = Math.max(80, Math.min(w * 0.3, h * 0.24, 170));
      const owlX = w * (w > h ? 0.2 : 0.24);
      const size = { star: owlW * 0.62, cloud: owlW * 1.05 };

      root.current?.style.setProperty('--owl', `${owlW}px`);
      if (s.started) {
        const step = SPEED[spec.speed] * w * dt;
        s.scroll += step;
        if (root.current) root.current.style.backgroundPositionX = `${-s.scroll * 0.5}px`;
        ({ y: s.y, vy: s.vy } = flyStep(s.y, s.vy, s.down, dt));

        // Новое — справа, через равные промежутки (пока звёзды ещё нужны).
        s.gap += step;
        if (!s.done && s.gap >= w * 0.42) {
          s.gap = 0;
          const prev = s.things.at(-1)?.kind ?? null;
          s.things = [
            ...s.things,
            { id: s.nextId++, ...nextThing(spec, prev), x: w + owlW, hit: false },
          ];
          setThings(s.things);
        }
        let changed = false;
        for (const t of s.things) {
          t.x -= step;
          if (t.hit) continue;
          const r = (owlW * 0.42 + size[t.kind] * 0.45) * (t.kind === 'star' ? 1.1 : 0.85);
          if (Math.hypot(t.x - owlX, (t.y - s.y) * h) > r) continue;
          if (t.kind === 'star') {
            t.hit = true;
            changed = true;
            nice(els.current.get(t.id));
            s.caught++;
            setCaught(s.caught);
            if (s.caught >= spec.stars) {
              s.done = true;
              void praise(phrases);
              setTimeout(onFinish, 2200);
            } else void say(NUMBERS[s.caught] ?? String(s.caught));
          } else if (now >= s.safeUntil) {
            // Тучка: «бом», совёнка сносит вниз, секунду он мигает.
            t.hit = true;
            changed = true;
            s.safeUntil = now + 1200;
            s.vy = 0.5;
            bump();
            if (!s.cloudSaid) void say(FLIGHT_CLOUD);
            s.cloudSaid = true;
          }
        }
        const kept = s.things.filter((t) => t.x > -owlW * 2);
        if (changed || kept.length !== s.things.length) {
          s.things = kept;
          setThings([...kept]);
        }
      }

      for (const t of s.things) {
        const el = els.current.get(t.id);
        if (el) el.style.transform = `translate(${t.x}px, ${t.y * h}px) translate(-50%, -50%)`;
      }
      const owl = owlEl.current;
      if (owl) {
        // Покачивается на месте, пока не взлетел; в полёте наклоняется по ходу.
        const bob = s.started ? 0 : Math.sin(now / 400) * 6;
        const tilt = s.started ? s.vy * 30 : 0;
        owl.style.transform = `translate(${owlX}px, ${s.y * h + bob}px) translate(-50%, -50%) rotate(${tilt}deg)`;
        owl.classList.toggle('blink', now < s.safeUntil);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('.corner-button')) return;
    root.current?.setPointerCapture?.(e.pointerId);
    live.current.down = true;
    if (!live.current.started) {
      live.current.started = true;
      setStarted(true);
    }
  };
  const release = () => (live.current.down = false);

  // Звёзд много — ряд кружков мельче.
  const slot = Math.min(28, 340 / spec.stars);
  return (
    <div
      className="game flight"
      data-testid="game-flight"
      data-caught={caught}
      data-stars={spec.stars}
      data-no-idle={started || undefined}
      ref={root}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div
        className="flight-count"
        aria-hidden
        style={{ '--slot': `${slot}px` } as React.CSSProperties}
      >
        {Array.from({ length: spec.stars }, (_, i) => (
          <img
            key={i}
            src="/games/robot-star.webp"
            alt=""
            draggable={false}
            className={i < caught ? 'got' : undefined}
          />
        ))}
      </div>
      {things.map((t) => (
        <img
          key={t.id}
          ref={(el) => {
            if (el) els.current.set(t.id, el);
            else els.current.delete(t.id);
          }}
          className={`flight-${t.kind}${t.hit ? ' hit' : ''}`}
          src={t.kind === 'star' ? '/games/robot-star.webp' : '/games/flight-cloud.webp'}
          alt=""
          draggable={false}
          data-testid={`flight-${t.kind}`}
          data-hit={t.hit || undefined}
        />
      ))}
      <img
        ref={owlEl}
        className="flight-owl"
        src="/games/flight-owl.webp"
        alt=""
        draggable={false}
        data-testid="flight-owl"
      />
    </div>
  );
}
