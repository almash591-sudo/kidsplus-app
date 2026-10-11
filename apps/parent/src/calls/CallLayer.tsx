// Звонки в кабинете (этап 10): клиент звонков на всё приложение, живой канал /api/parent/live,
// экран звонка поверх любой страницы. Входящий при закрытом кабинете — push (push-sw.js).
import { CallEngine, type CallView } from '@kidsplus/shared/call-client';
import type { CallEvent, CallInfo, Peer } from '@kidsplus/shared/calls';
import { useEffect, useRef, useState } from 'react';
import './calls.css';

let engine: CallEngine | null = null;
const listeners = new Set<(e: CallEngine) => void>();

async function request(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export const parentCalls = () => engine;

/** Клиент звонков, когда он готов. */
export function useCallEngine(): CallEngine | null {
  const [e, setE] = useState(engine);
  useEffect(() => {
    if (engine) return;
    const fn = (x: CallEngine) => setE(x);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  return e;
}

/** Мелодия входящего (WebAudio). */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on || typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    const beep = () => {
      const t = ctx.currentTime;
      [660, 880, 660, 880].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.25);
        g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.25 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(t + i * 0.25);
        o.stop(t + i * 0.25 + 0.24);
      });
    };
    beep();
    const timer = setInterval(beep, 2500);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [on]);
}

function Video({ stream, muted }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  });
  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

function Audio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  });
  return <audio ref={ref} autoPlay />;
}

const nameOf = (call: CallInfo, peer: Peer) => call.members.find((m) => m.id === peer)?.name ?? '';

function Overlay({ view, me, engine: e }: { view: CallView; me: Peer; engine: CallEngine }) {
  const call = view.call;
  const mine = call?.members.find((m) => m.id === me)?.state;
  const incoming = Boolean(call && call.status !== 'ended' && mine === 'ringing');
  useRingtone(incoming);
  if (!call || call.status === 'ended' || (mine !== 'ringing' && mine !== 'joined')) return null;

  // Радионяня: полоска внизу, звук комнаты — пока не остановят.
  if (call.monitor) {
    const child = call.members.find((m) => m.id !== me);
    return (
      <div className="pmonitor" data-testid="monitor-listening">
        {view.remotes.map((r) => (
          <Audio key={r.peer} stream={r.stream} />
        ))}
        <span>
          🌙 Слушаю комнату{child ? ` — ${child.name}` : ''}
          {view.remotes.some((r) => r.state === 'connected') ? '' : ' · соединяю…'}
        </span>
        <button type="button" className="pcall-btn decline" onClick={() => void e.hangup()}>
          Остановить
        </button>
      </div>
    );
  }

  if (incoming)
    return (
      <div className="pcall incoming" data-testid="call-incoming">
        <div className="pcall-who">
          <div className="pcall-name">{nameOf(call, call.from)}</div>
          <div>{call.video ? 'Видеозвонок' : 'Звонок'}</div>
        </div>
        <div className="pcall-actions">
          <button type="button" className="pcall-btn decline" onClick={() => void e.decline()}>
            Отклонить
          </button>
          <button
            type="button"
            className="pcall-btn accept"
            data-testid="call-accept"
            onClick={() => void e.answer()}
          >
            Ответить
          </button>
        </div>
      </div>
    );

  const talking = view.remotes.filter((r) =>
    call.members.some((m) => m.id === r.peer && m.state === 'joined'),
  );
  return (
    <div className="pcall active" data-testid="call-active">
      <div className={`pcall-remotes n${Math.max(1, talking.length)}`}>
        {talking.map((r) => (
          <div key={r.peer} className="pcall-remote" data-state={r.state}>
            <Video stream={r.stream} />
            <span className="pcall-label">{nameOf(call, r.peer)}</span>
          </div>
        ))}
        {!talking.length && (
          <div className="pcall-waiting">
            Звоним:{' '}
            {call.members
              .filter((m) => m.id !== me && m.state === 'ringing')
              .map((m) => m.name)
              .join(', ')}
            …
          </div>
        )}
      </div>
      {view.local && call.video && (
        <div className="pcall-self">
          <Video stream={view.local} muted />
        </div>
      )}
      {view.mediaError && (
        <div className="pcall-warning">
          Нет доступа к камере или микрофону — разрешите в браузере.
        </div>
      )}
      <div className="pcall-actions">
        <button type="button" className="pcall-btn small" onClick={() => e.toggleMic()}>
          {view.mic ? '🎤' : '🔇'}
        </button>
        <button
          type="button"
          className="pcall-btn decline"
          data-testid="call-hangup"
          onClick={() => void e.hangup()}
        >
          Положить трубку
        </button>
        {call.video && (
          <button type="button" className="pcall-btn small" onClick={() => e.toggleCam()}>
            {view.cam ? '🎥' : '🚫'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Слой звонков: подключается в Layout после входа. */
export function CallLayer() {
  const [view, setView] = useState<CallView | null>(null);
  const [me, setMe] = useState<Peer | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let off: (() => void) | undefined;
    let cancelled = false;
    void request('GET', '/calls/me')
      .then((r: { id: Peer }) => {
        if (cancelled) return;
        engine ??= new CallEngine(r.id, request);
        const e = engine;
        setMe(r.id);
        listeners.forEach((fn) => fn(e));
        listeners.clear();
        const unsubscribe = e.subscribe(setView);
        off = () => void unsubscribe();
        es = new EventSource('/api/parent/live');
        const onEvent = (m: Event) => {
          try {
            void e.handle(JSON.parse((m as MessageEvent<string>).data) as CallEvent);
          } catch {
            // повреждённое событие — пропускаем
          }
        };
        es.addEventListener('call', onEvent);
        es.addEventListener('signal', onEvent);
        void e.sync();
      })
      .catch(() => {});
    const onVisible = () => document.visibilityState === 'visible' && void engine?.sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      es?.close();
      off?.();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!view || !me || !engine) return null;
  return <Overlay view={view} me={me} engine={engine} />;
}
