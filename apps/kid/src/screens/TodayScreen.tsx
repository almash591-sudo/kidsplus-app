import type { KidToday, Subject } from '@kidsplus/shared/schedule';
import { useEffect, useRef, useState } from 'react';
import { kidApi } from '../api';
import { inKiosk, openPhoneSettings } from '../kiosk';
import { playSequence } from '../audio';
import { voiceLine } from '../voiceLines';
import { fx } from '../fx';
import { ru } from '../games/common';
import {
  CATEGORY_LABELS,
  categoryPhrase,
  DAY_OVER,
  FREE_TIME,
  PAUSED,
  HINT_TODAY,
  TODAY_GREETING,
  ADVENTURE_GUIDE_TIPS,
  ADVENTURE_ALL_DONE,
} from '../phrases';
import { IdleHint } from '../ui/IdleHint';
import { Icon } from '../ui/icons';
import { CHILD_CATEGORY } from '../ui/childCategories';

const GUIDE_POSES = ['point', 'wave', 'happy'] as const;
const GUIDE_BUBBLES = ['Сюда!', 'Дай пять!', 'Ты сможешь!'] as const;

function minutesText(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const lastTwo = minutes % 100;
  const unit =
    lastTwo >= 11 && lastTwo <= 14
      ? 'минут'
      : minutes % 10 === 1
        ? 'минута'
        : minutes % 10 >= 2 && minutes % 10 <= 4
          ? 'минуты'
          : 'минут';
  return `${minutes} ${unit}`;
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
  const [owlTip, setOwlTip] = useState(-1);
  const [owlReacting, setOwlReacting] = useState(false);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const greeting = useRef(
    today.subjects.some((s) => !s.done) ? TODAY_GREETING : ADVENTURE_ALL_DONE,
  );
  useEffect(() => () => clearTimeout(reactionTimer.current), []);
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    void playSequence([voiceLine(greeting.current)]);
  }, []);
  // Куда нажать: первый непройденный предмет, а после уроков — свободное время.
  const next = today.subjects.find((s) => !s.done)?.subject ?? null;
  const completed = today.subjects.filter((s) => s.done).length;
  const guideSpeech =
    owlTip < 0
      ? next
        ? TODAY_GREETING
        : ADVENTURE_ALL_DONE
      : !next && owlTip === 0
        ? today.free.open
          ? FREE_TIME
          : ADVENTURE_ALL_DONE
        : ADVENTURE_GUIDE_TIPS[owlTip]!;
  return (
    <div
      className={`screen tiles categories today adventure-today${owlReacting ? ' guide-reacting' : ''}`}
      data-testid="today"
    >
      <header className="adventure-welcome">
        <h1>{next ? 'Поиграем?' : 'Молодец!'}</h1>
        <button
          className="adventure-guide"
          type="button"
          aria-label="Поговорить с совёнком"
          onClick={() => {
            const tip = (owlTip + 1) % ADVENTURE_GUIDE_TIPS.length;
            setOwlTip(tip);
            setOwlReacting(true);
            clearTimeout(reactionTimer.current);
            reactionTimer.current = setTimeout(() => setOwlReacting(false), 1400);
            if (tip === 1) fx.boing();
            else fx.bell(tip);
            void playSequence([
              ru(
                !next && tip === 0
                  ? today.free.open
                    ? FREE_TIME
                    : ADVENTURE_ALL_DONE
                  : ADVENTURE_GUIDE_TIPS[tip]!,
              ),
            ]);
          }}
        >
          <img
            key={`${owlTip}-${owlReacting}`}
            src={`/owl/${owlTip < 0 ? (next ? 'wave' : 'happy') : GUIDE_POSES[owlTip]}.webp`}
            alt=""
            draggable={false}
            className={owlReacting ? 'owl-waving' : ''}
          />
          <span className="guide-hello" aria-hidden="true">
            {owlTip < 0 ? 'Привет!' : GUIDE_BUBBLES[owlTip]}
          </span>
          <span className="guide-listen" aria-hidden="true">
            <Icon name="ear" size={22} />
          </span>
        </button>
        <span className="adventure-sr-only" aria-live="polite">
          {guideSpeech}
        </span>
      </header>
      <div
        className="adventure-progress"
        role="img"
        aria-label={`Завершено занятий: ${completed} из ${today.subjects.length}`}
      >
        <span className="adventure-stars" aria-hidden="true">
          {today.subjects.map((s) => (
            <span key={s.subject} className={s.done ? 'earned' : ''}>
              <Icon name="star" size={30} fill={s.done} stroke={1.8} />
            </span>
          ))}
        </span>
      </div>
      <section className="today-journey adventure-path" aria-label="Приключения на сегодня">
        {today.subjects.map((s, i) => (
          <button
            key={s.subject}
            type="button"
            className={`tile category ${s.subject}${s.done ? ' done' : ''}${s.subject === next ? ' is-next' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            disabled={s.done}
            onClick={() => {
              fx.whoosh();
              void playSequence([ru(categoryPhrase(s.subject))]);
              onSubject(s.subject);
            }}
            data-testid="subject"
            data-subject={s.subject}
            data-hint={s.subject === next ? '' : undefined}
            data-done={s.done}
            data-progress={s.done ? 1 : s.progress}
            aria-label={`${CATEGORY_LABELS[s.subject]}, ${s.done ? 'занятие завершено' : `осталось ${minutesText(s.secondsLeft)}`}`}
          >
            <img
              className="adventure-toy"
              src={CHILD_CATEGORY[s.subject].picture}
              alt=""
              draggable={false}
            />
            <span className="tile-label" aria-hidden="true">
              {CHILD_CATEGORY[s.subject].label}
            </span>
            {!s.done && (
              <span className="adventure-go" aria-hidden="true">
                <Icon name="play" size={s.subject === next ? 34 : 23} fill stroke={1.5} />
              </span>
            )}
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
              void playSequence([voiceLine(FREE_TIME)]);
              onFree();
            }}
            data-testid="free"
            data-hint={next === null ? '' : undefined}
            aria-label="Свободное время"
          >
            <span className="tile-badge" aria-hidden="true">
              <img src="/games/icon-balloons.webp" alt="" draggable={false} />
            </span>
            <span className="tile-label" aria-hidden="true">
              Играем!
            </span>
            <span className="adventure-go" aria-hidden="true">
              <Icon name="play" size={24} fill stroke={1.5} />
            </span>
          </button>
        )}
      </section>
      <IdleHint onIdle={() => void playSequence([ru(HINT_TODAY)])} first={9000} />
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
