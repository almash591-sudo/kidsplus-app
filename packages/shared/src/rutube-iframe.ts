// Встраиваемый плеер RuTube (этап 54): iframe с rutube.ru, управление через postMessage.
// Видео не скачиваются. Сообщения принимаются только от своего iframe и с origin rutube.ru.

export const RUTUBE_ORIGIN = 'https://rutube.ru';

export type RuTubeState =
  'playing' | 'paused' | 'stopped' | 'seeking' | 'buffering' | 'completed' | 'unknown';

export type RuTubeEvent =
  | { type: 'ready' }
  | { type: 'state'; state: RuTubeState }
  | { type: 'time'; time: number; duration: number | null }
  | { type: 'duration'; duration: number }
  | { type: 'complete' }
  | { type: 'error'; message: string };

/** Адрес плеера: старт и (необязательно) конец отрезка в секундах. */
export function ruTubeEmbedUrl(videoId: string, startSec: number, endSec?: number): string {
  const q = new URLSearchParams({ t: String(Math.max(0, Math.floor(startSec))) });
  if (endSec) q.set('stopTime', String(Math.floor(endSec)));
  return `${RUTUBE_ORIGIN}/play/embed/${videoId}/?${q}`;
}

const STATES: Record<string, RuTubeState> = {
  playing: 'playing',
  play: 'playing',
  pause: 'paused',
  paused: 'paused',
  stopped: 'stopped',
  seeking: 'seeking',
  seeked: 'playing',
  buffering: 'buffering',
  completed: 'completed',
  ended: 'completed',
};

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Разбор сообщения плеера (строка JSON `{type, data}`); незнакомое — null. */
export function parseRuTubeMessage(raw: unknown): RuTubeEvent | null {
  let msg: unknown = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!msg || typeof msg !== 'object') return null;
  const { type, data } = msg as { type?: unknown; data?: Record<string, unknown> | null };
  const d = data && typeof data === 'object' ? data : {};
  switch (type) {
    case 'player:ready':
      return { type: 'ready' };
    case 'player:changeState':
      return { type: 'state', state: STATES[String(d.state)] ?? 'unknown' };
    case 'player:currentTime': {
      const time = num(d.time) ?? num(d.currentTime);
      return time === null ? null : { type: 'time', time, duration: num(d.duration) };
    }
    case 'player:durationChange': {
      const duration = num(d.duration);
      return duration === null ? null : { type: 'duration', duration };
    }
    case 'player:playComplete':
      return { type: 'complete' };
    case 'player:error':
      return { type: 'error', message: String(d.message ?? d.type ?? 'ошибка плеера') };
    default:
      return null;
  }
}

export interface RuTubePlayer {
  readonly iframe: HTMLIFrameElement;
  play(): void;
  pause(): void;
  seek(sec: number): void;
  /** Последнее время, о котором сообщил плеер; null — ещё не сообщал. */
  currentTime(): number | null;
  state(): RuTubeState | null;
  destroy(): void;
}

export interface CreateRuTubeOptions {
  videoId: string;
  startSec: number;
  endSec?: number;
  title?: string;
  onEvent?: (e: RuTubeEvent, player: RuTubePlayer) => void;
}

/** Создаёт iframe плеера внутри `container` и слушает его сообщения. */
export function createRuTubePlayer(
  container: HTMLElement,
  opts: CreateRuTubeOptions,
): RuTubePlayer {
  const iframe = document.createElement('iframe');
  iframe.src = ruTubeEmbedUrl(opts.videoId, opts.startSec, opts.endSec);
  iframe.title = opts.title ?? 'Видео';
  iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block';
  container.replaceChildren(iframe);

  let time: number | null = null;
  let state: RuTubeState | null = null;
  const send = (type: string, data: object = {}) =>
    iframe.contentWindow?.postMessage(JSON.stringify({ type, data }), RUTUBE_ORIGIN);

  const player: RuTubePlayer = {
    iframe,
    play: () => send('player:play'),
    pause: () => send('player:pause'),
    seek: (sec) => {
      time = sec;
      send('player:setCurrentTime', { time: sec });
    },
    currentTime: () => time,
    state: () => state,
    destroy: () => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
    },
  };

  function onMessage(e: MessageEvent) {
    if (e.origin !== RUTUBE_ORIGIN || e.source !== iframe.contentWindow) return;
    const ev = parseRuTubeMessage(e.data);
    if (!ev) return;
    if (ev.type === 'time') time = ev.time;
    if (ev.type === 'state') state = ev.state;
    if (ev.type === 'complete') state = 'completed';
    opts.onEvent?.(ev, player);
  }
  window.addEventListener('message', onMessage);
  return player;
}
