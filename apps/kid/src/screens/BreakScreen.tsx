// Перерыв для глаз (этап 50): совёнок объясняет, зачем отдыхать, и зовёт подвигаться. Круг
// заполняется, пока идёт отдых (цифры малышам ни к чему). Очень хочется ещё — кнопка: совёнок
// спросит маму и папу (push в кабинет), один раз за перерыв.
import type { EyeBreakAsk } from '@kidsplus/shared/schedule';
import { useEffect, useState } from 'react';
import { playSequence, stopAudio } from '../audio';
import { ru } from '../games/common';
import { BREAK_HINT, BREAK_START } from '../phrases';
import { Icon } from '../ui/icons';

export function BreakScreen(props: {
  until: number;
  restMin: number;
  ask: EyeBreakAsk | null;
  onAsk: () => void;
}) {
  const { until, restMin, ask } = props;
  const [now, setNow] = useState(() => Date.now());
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    stopAudio();
    void playSequence([ru(BREAK_START), ...(ask ? [] : [ru(BREAK_HINT)])]);
    // Объясняет один раз при показе; ответы родителя говорит App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const eyes = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200);
    return () => {
      clearInterval(tick);
      clearInterval(eyes);
    };
  }, []);

  const total = restMin * 60_000;
  const part = Math.min(1, Math.max(0, 1 - (until - now) / total));
  const R = 44;
  const C = 2 * Math.PI * R;

  return (
    <div className="screen rest-screen rest-rest eye-break" data-testid="eye-break">
      <div className="rest-scene" aria-hidden="true">
        <img className="rest-thing" src="/rest/rest.webp" alt="" draggable={false} />
        <img
          className="rest-owl"
          src={`/owl/${blink ? 'blink' : 'wave'}.webp`}
          alt=""
          draggable={false}
        />
      </div>
      <p className="rest-text">Глазки отдыхают</p>
      <svg className="eye-break-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={R} className="eye-break-track" />
        <circle
          cx="50"
          cy="50"
          r={R}
          className="eye-break-fill"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - part)}
          data-testid="eye-break-ring"
          data-part={part.toFixed(2)}
        />
      </svg>
      {ask === null ? (
        <button
          type="button"
          className="big-button eye-break-ask"
          aria-label="Спросить у мамы и папы"
          onClick={props.onAsk}
          data-testid="eye-break-ask"
        >
          <Icon name="phone" size={40} stroke={2.4} />
        </button>
      ) : (
        <p className="eye-break-asked" data-testid="eye-break-asked" data-ask={ask}>
          {ask === 'no' ? 'Отдыхаем' : 'Спросили у мамы и папы'}
        </p>
      )}
    </div>
  );
}
