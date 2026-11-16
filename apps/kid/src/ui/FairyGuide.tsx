import { useEffect, useRef, useState } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { Icon } from './icons';
import { useOwlPraise } from './useOwlPraise';

/** The room's familiar owl accompanies selection screens; a tap repeats their spoken hint. */
export function FairyGuide({ hint, celebrate = false }: { hint: string; celebrate?: boolean }) {
  const [waving, setWaving] = useState(false);
  const praise = useOwlPraise(celebrate);
  const reacting = waving || Boolean(praise);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`fairy-guide${reacting ? ' is-waving' : ''}`}
      aria-label="Совёнок: подсказка"
      data-testid="fairy-guide"
      data-praising={Boolean(praise)}
      onClick={() => {
        clearTimeout(timer.current);
        setWaving(true);
        fx.soft();
        void playSequence([ru(hint)]);
        timer.current = setTimeout(() => setWaving(false), 1400);
      }}
    >
      <img src={`/playroom/${reacting ? 'owl-wave' : 'owl'}.webp`} alt="" draggable={false} />
      {!reacting && (
        <img
          className="fairy-guide-blink"
          src="/playroom/owl-blink.webp"
          alt=""
          draggable={false}
        />
      )}
    </button>
  );
}

export function FairyHeader({
  title,
  picture,
  hint,
  onBack,
  backLabel = 'Вернуться в комнату',
  backTestId = 'to-categories',
  celebrate = false,
}: {
  title: string;
  picture: string;
  hint: string;
  onBack?: (() => void) | undefined;
  backLabel?: string;
  backTestId?: string;
  celebrate?: boolean;
}) {
  return (
    <header className="fairy-header">
      {onBack && (
        <button
          type="button"
          className="fairy-back"
          aria-label={backLabel}
          data-testid={backTestId}
          onClick={() => {
            fx.whoosh();
            onBack();
          }}
        >
          <Icon name="back" size={30} />
        </button>
      )}
      <div className="fairy-header-title">
        <img className="fairy-header-toy" src={picture} alt="" draggable={false} />
        <h1>{title}</h1>
      </div>
      <FairyGuide hint={hint} celebrate={celebrate} />
    </header>
  );
}
