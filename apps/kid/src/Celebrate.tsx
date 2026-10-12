import { useEffect, useState } from 'react';
import { playSequence } from './audio';
import { fx } from './fx';
import { ru } from './games/common';
import { awardSticker } from './stickers';

const COLORS = ['#E8453C', '#F59E0B', '#FACC15', '#22A55B', '#3B82F6', '#9B5DE5', '#F472B6'];
const PIECES = 56;

/** Конфетти: кусочки разлетаются из центра и падают. Случайность — один раз при показе. */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: PIECES }, (_, i) => ({
      color: COLORS[i % COLORS.length]!,
      x: (Math.random() - 0.5) * 100, // vw
      y: -20 - Math.random() * 40, // vh, вверх от центра
      rot: Math.random() * 900 - 450,
      delay: Math.random() * 0.2,
      shape: i % 3,
    })),
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={p.shape === 1 ? 'round' : p.shape === 2 ? 'strip' : ''}
          style={
            {
              background: p.color,
              '--x': `${p.x}vw`,
              '--y': `${p.y}vh`,
              '--rot': `${p.rot}deg`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Праздник в конце задания: лучи, конфетти, фанфары и наклейка в альбом (этап 17) —
 * она влетает и звучит её имя: «Новая наклейка — единорог!».
 */
export function Celebrate({ testId }: { testId: string }) {
  const [sticker] = useState(() => awardSticker());
  useEffect(() => {
    fx.fanfare();
    const t = setTimeout(() => {
      fx.sparkle();
      void playSequence([
        ru(sticker.isNew ? `Новая наклейка — ${sticker.name}!` : `Ещё ${sticker.name}!`),
      ]);
    }, 450);
    return () => clearTimeout(t);
  }, [sticker]);
  return (
    <div className="celebrate" data-testid={testId} aria-hidden="true">
      <span className="celebrate-rays" />
      <Confetti />
      <span className="celebrate-sticker" data-testid="sticker-award" data-sticker={sticker.emoji}>
        <span className="celebrate-emoji">{sticker.emoji}</span>
        {sticker.isNew && <span className="celebrate-new">новая!</span>}
      </span>
    </div>
  );
}
