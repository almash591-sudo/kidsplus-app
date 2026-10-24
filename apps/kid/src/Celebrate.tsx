import type { Speech } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { playSequence } from './audio';
import { fx } from './fx';
import { ru } from './games/common';
import { stickerAgain, stickerNew } from './phrases';
import { awardSticker } from './stickers';

const COLORS = ['#E8453C', '#F59E0B', '#FACC15', '#22A55B', '#3B82F6', '#9B5DE5', '#F472B6'];
const PIECES = 56;
/** Праздник не мелькает: не короче этого, даже если фразы уже сказаны. */
const MIN_MS = 1800;
/** И не висит: звук не закончился (сломался, нет сети) — всё равно дальше. */
const MAX_MS = 9000;
/** Договорил — ещё миг на наклейку. */
const AFTER_MS = 400;

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
 * она влетает и звучит её имя: «Новая наклейка — единорог!». Сначала — фраза задания
 * («Молодец, все вопросы!»), если она есть. Дальше (onDone) — только когда всё договорено:
 * раньше экран уходил через 1,8 с и обрывал имя наклейки на полуслове.
 */
export function Celebrate(props: { testId: string; say?: Speech | null; onDone: () => void }) {
  const { testId } = props;
  const [sticker] = useState(() => awardSticker());
  const [say] = useState(() => props.say ?? null);
  const onDone = useRef(props.onDone);
  useEffect(() => {
    onDone.current = props.onDone;
  }, [props.onDone]);
  useEffect(() => {
    fx.fanfare();
    const began = Date.now();
    let over = false;
    let rest: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (over) return;
      over = true;
      onDone.current();
    };
    const cap = setTimeout(finish, MAX_MS);
    const t = setTimeout(() => {
      fx.sparkle();
      void playSequence([
        say,
        ru(sticker.isNew ? stickerNew(sticker.name) : stickerAgain(sticker.name)),
      ]).then(() => {
        if (over) return;
        rest = setTimeout(finish, Math.max(AFTER_MS, MIN_MS - (Date.now() - began)));
      });
    }, 450);
    return () => {
      over = true;
      clearTimeout(t);
      clearTimeout(cap);
      clearTimeout(rest);
    };
  }, [sticker, say]);
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
