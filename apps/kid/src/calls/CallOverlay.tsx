// Звонок поверх всего (этап 10): входящий — на весь экран с мелодией; исходящий — «Звоним…»;
// разговор — собеседники, своё окошко, микрофон, камера и «положить трубку».
import type { CallView } from '@kidsplus/shared/call-client';
import type { CallInfo, Peer } from '@kidsplus/shared/calls';
import { useEffect, useRef } from 'react';
import { contactEmoji } from './CallsScreen';
import { callEngine } from './engine';
import './calls.css';

/** Мелодия звонка (WebAudio): два тона, пауза — пока не ответили. */
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

function Video({
  stream,
  muted,
  mirrored,
}: {
  stream: MediaStream;
  muted?: boolean;
  mirrored?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  });
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={mirrored ? 'mirrored' : undefined}
    />
  );
}

const kindOf = (p: Peer) => (p.startsWith('c:') ? ('child' as const) : ('parent' as const));
const nameOf = (call: CallInfo, peer: Peer) => call.members.find((m) => m.id === peer)?.name ?? '';
const face = (call: CallInfo, peer: Peer) =>
  contactEmoji({ kind: kindOf(peer), name: nameOf(call, peer) });

export function CallOverlay({ view, me }: { view: CallView; me: Peer }) {
  const call = view.call;
  const mine = call?.members.find((m) => m.id === me)?.state;
  const incoming = Boolean(call && call.status !== 'ended' && mine === 'ringing');
  useRingtone(incoming);
  if (!call || call.status === 'ended' || (mine !== 'ringing' && mine !== 'joined')) return null;
  const engine = callEngine()!;

  if (incoming) {
    return (
      <div className="call-screen incoming" data-testid="call-incoming">
        <div className="call-who">
          <span className="call-emoji">{face(call, call.from)}</span>
          <span className="call-name">{nameOf(call, call.from)}</span>
          <span className="call-kind">{call.video ? '🎥' : '📞'}</span>
        </div>
        <div className="call-actions">
          <button
            type="button"
            className="call-btn decline"
            aria-label="Отклонить"
            data-testid="call-decline"
            onClick={() => void engine.decline()}
          >
            ✕
          </button>
          <button
            type="button"
            className="call-btn accept"
            aria-label="Ответить"
            data-testid="call-accept"
            onClick={() => void engine.answer()}
          >
            📞
          </button>
        </div>
      </div>
    );
  }

  const talking = view.remotes.filter((r) =>
    call.members.some((m) => m.id === r.peer && m.state === 'joined'),
  );
  const ringingOthers = call.members.filter((m) => m.id !== me && m.state === 'ringing');
  return (
    <div className="call-screen active" data-testid="call-active" data-status={call.status}>
      <div className={`call-remotes n${Math.max(1, talking.length)}`}>
        {talking.map((r) => (
          <div key={r.peer} className="call-remote" data-testid="call-remote" data-state={r.state}>
            <Video stream={r.stream} />
            {!(call.video && r.stream.getVideoTracks().length) && (
              <span className="call-emoji">{face(call, r.peer)}</span>
            )}
            <span className="call-label">{nameOf(call, r.peer)}</span>
          </div>
        ))}
        {!talking.length && (
          <div className="call-waiting" data-testid="call-waiting">
            {ringingOthers.map((m) => (
              <span key={m.id} className="call-emoji">
                {face(call, m.id)}
              </span>
            ))}
            <span className="call-dots">• • •</span>
          </div>
        )}
      </div>
      {view.local && call.video && (
        <div className="call-self">
          <Video stream={view.local} muted mirrored />
        </div>
      )}
      <div className="call-actions">
        <button
          type="button"
          className={`call-btn small${view.mic ? '' : ' off'}`}
          aria-label="Микрофон"
          data-testid="call-mic"
          onClick={() => engine.toggleMic()}
        >
          {view.mic ? '🎤' : '🔇'}
        </button>
        <button
          type="button"
          className="call-btn decline"
          aria-label="Положить трубку"
          data-testid="call-hangup"
          onClick={() => void engine.hangup()}
        >
          ✕
        </button>
        {call.video && (
          <button
            type="button"
            className={`call-btn small${view.cam ? '' : ' off'}`}
            aria-label="Камера"
            data-testid="call-cam"
            onClick={() => engine.toggleCam()}
          >
            {view.cam ? '🎥' : '🚫'}
          </button>
        )}
      </div>
    </div>
  );
}
