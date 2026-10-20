// «Рыбалка» (этап 36): совёнок в лодке, в пруду плавают рыбки с цифрами или буквами. Крючок
// ведут пальцем — он плывёт за пальцем не мгновенно, — и отпускают: доплыв, крючок цепляет рыбку
// под собой. Нужная — поймали; не та — «попробуй ещё». Можно и просто нажать, куда приплывёт
// рыбка. На уровнях выше — больше рыбок, они быстрее, числа больше.
import { FISHING_LETTERS } from '@kidsplus/shared/games';
import { useEffect, useRef, useState } from 'react';
import { FISHING_SUM, fishingFind, PLUS } from '../phrases';
import { ask, NUMBERS, praise, retry, shuffled, type GameProps, type SpecOf } from './common';
import { burstAt } from './juice';

type FishingSpec = Pick<SpecOf<'fishing'>, 'mode' | 'max' | 'fish'>;

/** Раунд: что на рыбках, какую поймать; для примеров — слагаемые. */
export interface FishingRound {
  values: string[];
  target: string;
  sum?: [number, number];
}

export function fishingRound(spec: FishingSpec, prev?: string, rnd = Math.random): FishingRound {
  const pool =
    spec.mode === 'letters'
      ? FISHING_LETTERS.slice(0, spec.max).map(String)
      : Array.from({ length: spec.max }, (_, i) => String(i + 1));
  // В примерах ответ — от 2 (1 + 1).
  const targets = pool.filter((v) => (spec.mode === 'sums' ? Number(v) >= 2 : true));
  const fresh = targets.filter((v) => v !== prev);
  const from = fresh.length ? fresh : targets;
  const target = from[Math.floor(rnd() * from.length)]!;
  const rest = pool.filter((v) => v !== target);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  const values = [target, ...rest.slice(0, Math.min(spec.fish, pool.length) - 1)];
  if (spec.mode !== 'sums') return { values, target };
  const t = Number(target);
  const a = 1 + Math.floor(rnd() * (t - 1));
  return { values, target, sum: [a, t - a] };
}

/** Скорость рыбок — доля ширины экрана в секунду. */
const SPEED = { slow: 0.08, normal: 0.13, fast: 0.2 } as const;
/** Где на фоне вода (доля высоты картинки) и пропорции картинок фона. */
const POND = {
  portrait: { aspect: 1024 / 1536, water: 0.2 },
  landscape: { aspect: 1672 / 941, water: 0.255 },
};
/** Кончик удочки на картинке лодки (доли ширины и высоты); лодка 400×384. */
const ROD_TIP = { x: 0.97, y: 0.08 };
const BOAT_ASPECT = 384 / 400;

/** Линия воды на экране: фон вписан по ширине или высоте с обрезкой, прижат к верху. */
export function waterline(w: number, h: number) {
  const pond = w > h ? POND.landscape : POND.portrait;
  const scale = Math.max(w / pond.aspect, h); // высота картинки на экране
  return pond.water * scale;
}

interface Fish {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
}

export function Fishing({ spec, phrases, onFinish }: GameProps<'fishing'>) {
  const [round, setRound] = useState(0);
  const [task, setTaskState] = useState(() => fishingRound(spec));
  /** Пойманная рыбка (индекс) — она едет к лодке. */
  const [caught, setCaught] = useState<number | null>(null);
  const scene = useRef<HTMLDivElement>(null);
  const fishEls = useRef<(HTMLDivElement | null)[]>([]);
  const hookEl = useRef<SVGGElement>(null);
  const lineEl = useRef<SVGLineElement>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Всё, что меняется каждый кадр, — в ref, без перерисовки React.
  const live = useRef({
    fish: [] as Fish[],
    hook: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    down: false,
    /** Крючок доплыл после того, как палец отпустили, — пора клевать. */
    armed: false,
    busy: false,
  });

  const surface = waterline(size.w, size.h);
  const boatW = Math.min(size.w * 0.34, size.h * 0.24, 220);
  const boatH = boatW * BOAT_ASPECT;
  const boatX = size.w / 2 - boatW / 2;
  const boatY = surface - boatH * 0.85;
  const tip = { x: boatX + boatW * ROD_TIP.x, y: boatY + boatH * ROD_TIP.y };
  const top = surface + boatH * 0.25;
  const bottom = size.h - 16;
  const fishW = Math.max(
    64,
    Math.min(size.w * 0.24, ((bottom - top) / task.values.length) * 1.5, 150),
  );
  const fishH = fishW * (293 / 400);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Рыбки по дорожкам на разной глубине, плывут кто куда.
  useEffect(() => {
    const n = task.values.length;
    const lanes = shuffled(Array.from({ length: n }, (_, i) => i));
    live.current.fish = task.values.map((_, i) => ({
      x: Math.random() * (size.w - fishW),
      y: top + ((lanes[i]! + 0.5) / n) * (bottom - top - fishH),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: SPEED[spec.speed] * size.w * (0.8 + Math.random() * 0.4),
    }));
    const hook = { x: tip.x, y: surface + 40 };
    live.current.hook = { ...hook };
    live.current.target = { ...hook };
    live.current.armed = false;
    live.current.busy = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, size.w, size.h]);

  // Задание — в начале каждого раунда.
  useEffect(() => {
    if (task.sum) void ask(NUMBERS[task.sum[0]]!, PLUS, NUMBERS[task.sum[1]]!, FISHING_SUM);
    else
      void ask(
        fishingFind(
          spec.mode === 'letters' ? task.target : NUMBERS[Number(task.target)]!,
          spec.mode === 'letters',
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const bite = () => {
    const s = live.current;
    const { x, y } = s.hook;
    const i = s.fish.findIndex(
      (f) =>
        Math.abs(f.x + fishW / 2 - x) < fishW * 0.45 &&
        Math.abs(f.y + fishH / 2 - y) < fishH * 0.45,
    );
    if (i < 0) return;
    if (task.values[i] !== task.target) {
      // Не та — уплывает в другую сторону побыстрее.
      const f = s.fish[i]!;
      f.dir = f.dir === 1 ? -1 : 1;
      f.speed *= 1.6;
      void retry(phrases);
      return;
    }
    s.busy = true;
    setCaught(i);
    burstAt(fishEls.current[i] ?? null, 20);
    void praise(phrases);
    setTimeout(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setCaught(null);
      setTaskState(fishingRound(spec, task.target));
      setRound(round + 1);
    }, 2200);
  };

  // Кадр: рыбки плывут, крючок тянется к пальцу, пойманная рыбка едет к лодке.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // Первый кадр бывает с отметкой раньше performance.now() — шаг не меньше нуля.
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const s = live.current;
      s.fish.forEach((f, i) => {
        if (i === caught) {
          f.x += (tip.x - fishW / 2 - f.x) * Math.min(1, dt * 4);
          f.y += (boatY + boatH * 0.4 - f.y) * Math.min(1, dt * 4);
          s.hook = { x: f.x + fishW / 2, y: f.y + fishH * 0.2 };
        } else {
          f.x += f.dir * f.speed * dt;
          if (f.x < 0 || f.x > size.w - fishW) {
            f.dir = f.x < 0 ? 1 : -1;
            f.x = Math.max(0, Math.min(size.w - fishW, f.x));
            f.speed = Math.min(f.speed, SPEED[spec.speed] * size.w * 1.2);
          }
        }
        const el = fishEls.current[i];
        if (el) el.style.transform = `translate(${f.x}px, ${f.y}px)`;
        el?.setAttribute('data-dir', String(f.dir));
      });
      if (caught === null) {
        const dx = s.target.x - s.hook.x;
        const dy = s.target.y - s.hook.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.min(size.w, size.h) * 1.1 * dt;
        if (dist <= step || dist < 0.5) {
          s.hook = { ...s.target };
          if (s.armed && !s.down && !s.busy) {
            s.armed = false;
            bite();
          }
        } else s.hook = { x: s.hook.x + (dx / dist) * step, y: s.hook.y + (dy / dist) * step };
      }
      hookEl.current?.setAttribute('transform', `translate(${s.hook.x} ${s.hook.y})`);
      lineEl.current?.setAttribute('x2', String(s.hook.x));
      lineEl.current?.setAttribute('y2', String(s.hook.y));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  /** Палец в воде: крючок плывёт туда (не выше воды). */
  const aim = (e: React.PointerEvent) => {
    const box = scene.current!.getBoundingClientRect();
    live.current.target = {
      x: Math.max(8, Math.min(size.w - 8, e.clientX - box.left)),
      y: Math.max(surface + 20, Math.min(bottom, e.clientY - box.top)),
    };
  };

  const letters = spec.mode === 'letters';
  return (
    <div
      className="game fishing"
      data-testid="game-fishing"
      data-target={task.target}
      data-round={round}
      ref={scene}
      onPointerDown={(e) => {
        if (live.current.busy) return;
        live.current.down = true;
        live.current.armed = false;
        aim(e);
      }}
      onPointerMove={(e) => live.current.down && aim(e)}
      onPointerUp={() => {
        if (!live.current.down) return;
        live.current.down = false;
        live.current.armed = true;
      }}
      onPointerCancel={() => (live.current.down = false)}
    >
      <img
        className="fishing-boat"
        src="/games/fishing-boat.webp"
        alt=""
        draggable={false}
        style={{ left: boatX, top: boatY, width: boatW }}
      />
      {task.sum && (
        <div className="fishing-sum" data-testid="fishing-sum">
          {task.sum[0]} + {task.sum[1]} = ?
        </div>
      )}
      {task.values.map((v, i) => (
        <div
          key={`${round}-${v}`}
          ref={(el) => {
            fishEls.current[i] = el;
          }}
          className={i === caught ? 'fishing-fish caught' : 'fishing-fish'}
          style={{ width: fishW, height: fishH, fontSize: fishW * 0.3 }}
          data-testid="fishing-fish"
          data-value={v}
        >
          <img src="/games/fishing-fish.webp" alt="" draggable={false} />
          <span className={letters ? 'letter' : undefined}>{v}</span>
        </div>
      ))}
      <svg className="fishing-line" width={size.w} height={size.h} aria-hidden>
        <line ref={lineEl} x1={tip.x} y1={tip.y} x2={tip.x} y2={surface} />
        <g ref={hookEl} data-testid="fishing-hook">
          <circle r="7" cy="-16" className="bobber" />
          <path d="M0 -10 V6 a7 7 0 0 1 -14 0" className="hook" />
        </g>
      </svg>
    </div>
  );
}
