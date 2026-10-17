import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { mascotStore, type Mood } from './juice';

/** Кадры совёнка clay (public/owl, этап 26). */
type Frame =
  'master' | 'blink' | 'talk' | 'happy' | 'oops' | 'wave' | 'point' | 'flyup' | 'flydown';
const src = (f: Frame) => `/owl/${f}.webp`;
const MOOD_FRAME: Record<Mood, Frame> = {
  idle: 'master',
  happy: 'happy',
  wow: 'happy',
  oops: 'oops',
};
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Совёнок в углу экрана игры: дышит, моргает, радуется верному ответу, «ой» — при ошибке,
 * а иногда облетает экран. Только картинка: касания проходят сквозь него.
 */
export function Mascot() {
  const { mood, seq } = useSyncExternalStore(mascotStore.subscribe, mascotStore.get);
  const [frame, setFrame] = useState<Frame>('wave');
  const [flying, setFlying] = useState(false);
  const el = useRef<HTMLDivElement>(null);

  // Кадры — заранее, чтобы смена была мгновенной.
  useEffect(() => {
    for (const f of Object.values(MOOD_FRAME).concat(['blink', 'wave', 'flyup', 'flydown']))
      new Image().src = src(f);
    const t = setTimeout(() => setFrame('master'), 1400);
    return () => clearTimeout(t);
  }, []);

  // Реакция на ответ важнее моргания; в полёте — кадры взмахов.
  const shown = flying || mood === 'idle' ? frame : MOOD_FRAME[mood];

  // Моргание, пока совёнок спокоен.
  useEffect(() => {
    if (mood !== 'idle' || flying) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(
        () => {
          setFrame('blink');
          t = setTimeout(() => {
            setFrame('master');
            next();
          }, 130);
        },
        1800 + Math.random() * 4000,
      );
    };
    next();
    return () => clearTimeout(t);
  }, [mood, flying]);

  // Время от времени — круг над экраном с взмахами крыльев.
  useEffect(() => {
    if (calm()) return;
    let flap: ReturnType<typeof setInterval> | undefined;
    const timer = setInterval(() => {
      const node = el.current;
      if (!node || mascotStore.get().mood !== 'idle' || document.hidden) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      setFlying(true);
      let up = true;
      flap = setInterval(() => {
        up = !up;
        setFrame(up ? 'flyup' : 'flydown');
      }, 110);
      const anim = node.animate(
        [
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${w * 0.35}px, ${h * 0.12}px) scale(1.5)` },
          { transform: `translate(${w * 0.6}px, ${h * 0.02}px) scale(1.4, 1.4)` },
          { transform: `translate(${w * 0.3}px, -10px) scale(-1.4, 1.4)` },
          { transform: 'translate(0, 0) scale(-1, 1)' },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 4200, easing: 'ease-in-out' },
      );
      anim.onfinish = () => {
        clearInterval(flap);
        setFlying(false);
        setFrame('wave');
        setTimeout(() => mascotStore.get().mood === 'idle' && setFrame('master'), 1000);
      };
    }, 28_000);
    return () => {
      clearInterval(timer);
      clearInterval(flap);
    };
  }, []);

  return (
    <div
      ref={el}
      className={`mascot ${flying ? 'flying' : mood}`}
      key={seq}
      aria-hidden="true"
      data-mood={mood}
    >
      <img src={src(shown)} alt="" draggable={false} />
    </div>
  );
}
