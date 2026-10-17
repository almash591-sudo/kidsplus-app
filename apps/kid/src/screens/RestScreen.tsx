// «Выключить экран с поводом» (этап 29): совёнок уводит от экрана — спать, кушать, гулять…
// Экран держится, пока родитель не снимет его в кабинете.
import type { RestReason } from '@kidsplus/shared/schedule';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { playSequence, stopAudio } from '../audio';
import { ru } from '../games/common';
import { CALLED, REST_PHRASES } from '../phrases';

/** В какой позе совёнок (что говорит — REST_PHRASES). */
const OWL: Record<RestReason, string> = {
  sleep: 'sleep',
  eat: 'happy',
  walk: 'wave',
  bath: 'happy',
  book: 'point',
  rest: 'wave',
};

export function RestScreen({ reason }: { reason: RestReason }) {
  const r = { say: REST_PHRASES[reason], owl: OWL[reason] };
  // Совёнок «живой»: моргает, а во сне — дышит и пускает «з-з-з».
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    stopAudio();
    void playSequence([ru(r.say)]);
  }, [r.say]);
  useEffect(() => {
    if (r.owl === 'sleep') return;
    const t = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200);
    return () => clearInterval(t);
  }, [r.owl]);

  return (
    <div className={`screen rest-screen rest-${reason}`} data-testid="rest" data-reason={reason}>
      <div className="rest-scene" aria-hidden="true">
        <img className="rest-thing" src={`/rest/${reason}.webp`} alt="" draggable={false} />
        <img
          className="rest-owl"
          src={`/owl/${blink ? 'blink' : r.owl}.webp`}
          alt=""
          draggable={false}
        />
        {reason === 'sleep' && (
          <div className="rest-z">
            <span>z</span>
            <span>z</span>
            <span>z</span>
          </div>
        )}
      </div>
      <p className="rest-text">{r.say}</p>
    </div>
  );
}

/** «Тебя зовут!» (этап 29): совёнок прыгает, телефон вибрирует; через 8 с или по касанию — исчезает. */
export function CalledOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    void playSequence([ru(CALLED), ru(CALLED)]);
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="called" data-testid="called" onPointerDown={onDone} role="alert">
      <img src="/owl/wave.webp" alt="" draggable={false} />
      <p>{CALLED}</p>
    </div>
  );
}

/** Какой вызов «Тебя зовут!» ребёнок уже видел — чтобы не показывать его после перезапуска. */
const seen = {
  get: (): string | null => {
    try {
      return localStorage.getItem('kp-called');
    } catch {
      return null;
    }
  },
  set: (at: string) => {
    try {
      localStorage.setItem('kp-called', at);
    } catch {
      // без памяти — покажется ещё раз, не страшно
    }
  },
};

/** Последний вызов родителя (из дня ребёнка) и какой из них уже показан. */
let state = { at: null as string | null, seen: seen.get() };
const listeners = new Set<() => void>();
export const calledStore = {
  set(at: string | null) {
    if (at === state.at) return;
    state = { ...state, at };
    listeners.forEach((l) => l());
  },
  dismiss() {
    if (state.at) seen.set(state.at);
    state = { ...state, seen: state.at };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
};

/** Слой «Тебя зовут!» поверх любого экрана (подключён в main.tsx). */
export function CalledLayer() {
  const s = useSyncExternalStore(calledStore.subscribe, calledStore.get);
  return s.at && s.at !== s.seen ? <CalledOverlay onDone={calledStore.dismiss} /> : null;
}
