import type { KidToday, Subject } from '@kidsplus/shared/schedule';
import { useEffect, useRef, useState } from 'react';
import { kidApi } from '../api';
import { inKiosk, openPhoneSettings } from '../kiosk';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import {
  CATEGORY_LABELS,
  categoryPhrase,
  DAY_OVER,
  FREE_TIME,
  PAUSED,
  TODAY_GREETING,
} from '../phrases';
import { CategoryArt } from '../ui/CategoryArt';
import { Icon } from '../ui/icons';
import { CATEGORY_SHORT } from './HomeScreen';

/** Урок по умолчанию — 20 минут; кольцо показывает, сколько уже позанимались. */
const LESSON_SEC = 20 * 60;

/** Кольцо прогресса вокруг значка предмета — как «Активность» на часах. */
function ProgressRing({
  done,
  secondsLeft,
  subject,
}: {
  done: boolean;
  secondsLeft: number;
  subject: Subject;
}) {
  const total = Math.max(LESSON_SEC, secondsLeft);
  const part = done ? 1 : 1 - secondsLeft / total;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle className="ring-bg" cx="50" cy="50" r={r} />
        {part > 0 && (
          <circle
            className="ring-fg"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={`${c * part} ${c}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <span className="ring-icon">
        {done ? <Icon name="check" size="52%" stroke={2.8} /> : <CategoryArt category={subject} />}
      </span>
    </span>
  );
}

/** Приветствие «Сегодня» — один раз за запуск. */
let greeted = false;

/**
 * «Сегодня» (п. 5.2 ТЗ): большие иконки предметов дня, пройденные — со звёздочкой.
 * После всех предметов — плитка свободного времени.
 */
export function TodayScreen({
  today,
  onSubject,
  onFree,
}: {
  today: KidToday;
  onSubject: (s: Subject) => void;
  onFree: () => void;
}) {
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    void playSequence([ru(TODAY_GREETING)]);
  }, []);
  return (
    <div className="screen tiles categories today" data-testid="today">
      <header className="screen-title" aria-hidden="true">
        <h1>Твои занятия</h1>
      </header>
      {today.subjects.map((s, i) => (
        <button
          key={s.subject}
          type="button"
          className={`tile category ${s.subject}${s.done ? ' done' : ''}`}
          style={{ '--i': i } as React.CSSProperties}
          disabled={s.done}
          onClick={() => {
            fx.whoosh();
            void playSequence([ru(categoryPhrase(s.subject))]);
            onSubject(s.subject);
          }}
          data-testid="subject"
          data-subject={s.subject}
          data-done={s.done}
          aria-label={CATEGORY_LABELS[s.subject]}
        >
          <ProgressRing done={s.done} secondsLeft={s.secondsLeft} subject={s.subject} />
          <span className="lesson-text" aria-hidden="true">
            <span className="tile-label">{CATEGORY_SHORT[s.subject]}</span>
            <span className="lesson-left">
              {s.done ? 'Готово! Молодец' : `${Math.max(1, Math.ceil(s.secondsLeft / 60))} мин`}
            </span>
          </span>
          {s.done && (
            <span className="done-star" aria-hidden="true">
              <Icon name="star" size="100%" fill stroke={1.2} />
            </span>
          )}
        </button>
      ))}
      {today.free.open && (
        <button
          type="button"
          className="tile category free"
          style={{ '--i': today.subjects.length } as React.CSSProperties}
          onClick={() => {
            fx.whoosh();
            void playSequence([ru(FREE_TIME)]);
            onFree();
          }}
          data-testid="free"
          aria-label="Свободное время"
        >
          <span className="tile-badge" aria-hidden="true">
            <CategoryArt category="free" />
          </span>
          <span className="lesson-text" aria-hidden="true">
            <span className="tile-label">Свободное время</span>
          </span>
        </button>
      )}
    </div>
  );
}

/** «На сегодня всё»: спокойный экран с прощанием (п. 5.1 ТЗ). */
export function DayOverScreen() {
  useEffect(() => {
    fx.fanfare();
    void playSequence([ru(DAY_OVER)]);
  }, []);
  return (
    <div className="screen center day-over" data-testid="day-over">
      <div className="day-over-moon" aria-hidden="true">
        🌙
      </div>
      <div className="day-over-stars" aria-hidden="true">
        {['✨', '⭐', '✨', '⭐', '✨'].map((s, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Родитель поставил паузу. */
export function PausedScreen() {
  useEffect(() => {
    void playSequence([ru(PAUSED)]);
  }, []);
  return (
    <div className="screen center paused" data-testid="paused">
      <div className="paused-icon" aria-hidden="true">
        😴
      </div>
    </div>
  );
}

/**
 * Взрослый жест: удержание правого верхнего угла 3 секунды открывает ввод PIN (п. 5.1 ТЗ).
 * Ребёнок случайно не удержит — касание короче просто ничего не делает.
 */
export function ParentCorner({ onUnlock }: { onUnlock: () => void }) {
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  return (
    <>
      <div
        className="parent-corner"
        data-testid="parent-corner"
        onPointerDown={() => {
          cancel();
          timer.current = setTimeout(() => setAsking(true), 3000);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
      />
      {asking && (
        <PinPad
          onClose={() => setAsking(false)}
          onOk={() => {
            setAsking(false);
            onUnlock();
          }}
        />
      )}
    </>
  );
}

function PinPad({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const check = async (value: string) => {
    setBusy(true);
    try {
      const { ok } = await kidApi.unlock(value);
      if (ok) return onOk();
    } catch {
      // нет связи или слишком много попыток — как неверный PIN
    } finally {
      setBusy(false);
    }
    setWrong(true);
    setPin('');
  };
  const press = (d: string) => {
    if (busy) return;
    setWrong(false);
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };
  return (
    <div className="pin-pad" data-testid="pin-pad" role="dialog" aria-label="PIN родителя">
      <div className={wrong ? 'pin-dots wrong' : 'pin-dots'}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '✕', '0', 'OK'].map((k) => (
          <button
            key={k}
            type="button"
            className="pin-key"
            data-key={k}
            disabled={busy || (k === 'OK' && pin.length < 4)}
            onClick={() => (k === '✕' ? onClose() : k === 'OK' ? void check(pin) : press(k))}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Меню родителя на телефоне ребёнка (после PIN). */
export function ParentMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="pin-pad parent-menu" data-testid="parent-menu" role="dialog">
      <p>Меню родителя</p>
      <button type="button" className="menu-button" onClick={() => window.location.reload()}>
        Обновить приложение
      </button>
      {inKiosk() && (
        <button
          type="button"
          className="menu-button"
          data-testid="phone-settings"
          onClick={() => void openPhoneSettings()}
        >
          Настройки телефона (VPN, Wi-Fi)
        </button>
      )}
      <button type="button" className="menu-button" onClick={onClose}>
        Вернуться к ребёнку
      </button>
    </div>
  );
}
