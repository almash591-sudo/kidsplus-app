import { useEffect, useState } from 'react';
import { fx } from './fx';

const COLORS = ['#E8453C', '#F59E0B', '#FACC15', '#22A55B', '#3B82F6', '#9B5DE5', '#F472B6'];
const PIECES = 36;

/** Конфетти: кусочки разлетаются из центра и падают. Случайность — один раз при показе. */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: PIECES }, (_, i) => ({
      color: COLORS[i % COLORS.length]!,
      x: (Math.random() - 0.5) * 90, // vw
      y: -20 - Math.random() * 35, // vh, вверх от центра
      rot: Math.random() * 720 - 360,
      delay: Math.random() * 0.15,
      round: Math.random() < 0.4,
    })),
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={p.round ? 'round' : ''}
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

/** Праздник в конце задания: звезда, конфетти и фанфары. */
export function Celebrate({ testId }: { testId: string }) {
  useEffect(() => fx.fanfare(), []);
  return (
    <div className="celebrate" data-testid={testId} aria-hidden="true">
      <span className="celebrate-rays" />
      <Confetti />
      <span className="celebrate-star">⭐</span>
    </div>
  );
}
