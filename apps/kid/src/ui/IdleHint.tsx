import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isSpeaking } from '../audio';

interface Hand {
  x: number;
  y: number;
  /** Куда тянуть (перетаскивание); без неё — касание. */
  dx: number | null;
  dy: number | null;
  key: number;
}

/**
 * Подсказка без слов для тех, кто не читает: если ребёнок долго ничего не трогает —
 * голос (onIdle) и палец над тем, что нажать (элемент с data-hint) или куда тянуть
 * (от data-hint к data-hint-target).
 */
export function IdleHint({
  onIdle,
  first = 7000,
  every = 14000,
  max = 3,
}: {
  onIdle: () => void;
  /** Первая подсказка — через столько мс без касаний. */
  first?: number;
  /** Следующие — через столько. */
  every?: number;
  /** Не больше стольких подряд, пока ребёнок не коснётся экрана. */
  max?: number;
}) {
  const [hand, setHand] = useState<Hand | null>(null);
  const idle = useRef(onIdle);
  useEffect(() => {
    idle.current = onIdle;
  });

  useEffect(() => {
    let last = Date.now();
    let wait = first;
    let shown = 0;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const touch = () => {
      last = Date.now();
      wait = every;
      shown = 0;
      setHand(null);
    };
    const tick = setInterval(() => {
      // Игра в движении (полёт идёт) — ребёнок занят, даже если палец просто держит экран.
      // Голос говорит — ребёнок слушает: подсказка не перебивает длинную сказку на полуслове.
      if (document.querySelector('[data-no-idle]') || isSpeaking()) last = Date.now();
      if (document.hidden || shown >= max || Date.now() - last < wait) return;
      shown++;
      last = Date.now();
      wait = every;
      idle.current();
      const el = document.querySelector<HTMLElement>('[data-hint]');
      if (!el) return;
      const a = el.getBoundingClientRect();
      if (!a.width) return;
      const to = document.querySelector<HTMLElement>('[data-hint-target]')?.getBoundingClientRect();
      const x = a.left + a.width / 2;
      const y = a.top + a.height / 2;
      setHand({
        x,
        y,
        dx: to ? to.left + to.width / 2 - x : null,
        dy: to ? to.top + to.height / 2 - y : null,
        key: Date.now(),
      });
      clearTimeout(hide);
      hide = setTimeout(() => setHand(null), 3400);
    }, 400);
    document.addEventListener('pointerdown', touch, true);
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
      document.removeEventListener('pointerdown', touch, true);
    };
  }, [first, every, max]);

  if (!hand) return null;
  return createPortal(
    <div
      key={hand.key}
      className={hand.dx === null ? 'hint-hand' : 'hint-hand drag'}
      data-testid="hint-hand"
      aria-hidden="true"
      style={
        {
          left: hand.x,
          top: hand.y,
          '--dx': `${hand.dx ?? 0}px`,
          '--dy': `${hand.dy ?? 0}px`,
        } as React.CSSProperties
      }
    >
      <span>👆</span>
    </div>,
    document.body,
  );
}
