import type { Speech } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { playSequence } from './audio';
import { fx } from './fx';
import { ru } from './games/common';
import { stickerAgain, stickerNew } from './phrases';
import { awardSticker } from './stickers';

/** Праздник не мелькает: не короче этого, даже если фразы уже сказаны. */
const MIN_MS = 1800;
/** И не висит: звук не закончился (сломался, нет сети) — всё равно дальше. */
const MAX_MS = 9000;
/** Договорил — ещё миг на наклейку. */
const AFTER_MS = 400;

/**
 * Праздник в конце задания: корзинка сокровищ, звёзды и наклейка в альбом —
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
    <div className="celebrate fairy-celebrate" data-testid={testId} aria-hidden="true">
      <div className="fairy-reward-scene">
        <p className="fairy-reward-title">Получилось!</p>
        <img className="fairy-reward-owl" src="/playroom/owl-wave.webp" alt="" />
        <img className="fairy-reward-basket" src="/playroom/basket.webp" alt="" />
        <div className="fairy-reward-stars">
          {Array.from({ length: 8 }, (_, i) => (
            <img
              key={i}
              src="/games/robot-star.webp"
              alt=""
              style={{ '--i': i } as React.CSSProperties}
            />
          ))}
        </div>
        <span
          className="celebrate-sticker"
          data-testid="sticker-award"
          data-sticker={sticker.emoji}
        >
          <span className="celebrate-emoji">{sticker.emoji}</span>
        </span>
        <p className="fairy-reward-name">
          {sticker.isNew ? 'Новая наклейка' : 'Ещё одна наклейка'}
        </p>
      </div>
    </div>
  );
}
