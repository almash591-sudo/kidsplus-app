import type { KidSegment, VideoProvider } from '@kidsplus/shared/api';
import { createRuTubePlayer, type RuTubeState } from '@kidsplus/shared/rutube-iframe';
import {
  createYouTubePlayer,
  loadYouTubeApi,
  YT_STATE,
  type YTPlayer,
} from '@kidsplus/shared/youtube-iframe';

/** Состояние плеера, общее для YouTube и RuTube (этап 54). */
export type EngineState = 'playing' | 'paused' | 'buffering' | 'ended' | 'other';

/** Плеер фрагмента — одинаковый для детского экрана, какой бы ни был сервис. */
export interface Engine {
  play(): void;
  pause(): void;
  /** Текущее время, с; undefined — плеер ещё не сообщал. */
  currentTime(): number | undefined;
  state(): EngineState;
}

export interface EngineHandlers {
  onReady(engine: Engine): void;
  onState(state: EngineState, engine: Engine): void;
  /** Число — код YouTube (100/101/150 — видео недоступно), строка — сбой другого рода. */
  onError(code: number | string): void;
}

/** Создаёт плеер в контейнере и возвращает функцию уничтожения. */
export type CreateEngine = (
  container: HTMLElement,
  segment: KidSegment,
  handlers: EngineHandlers,
) => () => void;

/** Загружает нужный сервису плеер. Для YouTube — его IFrame API, RuTube ничего не грузит. */
export function loadEngine(provider: VideoProvider): Promise<CreateEngine> {
  if (provider === 'rutube') return Promise.resolve(createRuTube);
  return loadYouTubeApi().then((YT): CreateEngine => (container, segment, h) => {
    let engine: Engine | null = null;
    const wrap = (p: YTPlayer): Engine => ({
      play: () => p.playVideo(),
      pause: () => p.pauseVideo(),
      currentTime: () => p.getCurrentTime(),
      state: () => ytState(p.getPlayerState()),
    });
    return createYouTubePlayer(YT, container, {
      videoId: segment.externalId,
      startSec: segment.startSec,
      endSec: segment.endSec,
      controls: false,
      autoplay: true,
      onReady: (p) => h.onReady((engine = wrap(p))),
      onStateChange: (s, p) => h.onState(ytState(s), engine ?? wrap(p)),
      onError: (code) => h.onError(code),
    }).destroy;
  });
}

function ytState(s: number): EngineState {
  if (s === YT_STATE.PLAYING) return 'playing';
  if (s === YT_STATE.PAUSED) return 'paused';
  if (s === YT_STATE.BUFFERING) return 'buffering';
  if (s === YT_STATE.ENDED) return 'ended';
  return 'other';
}

/** Плеер RuTube не ответил за это время — считаем, что rutube.ru недоступен. */
export const RUTUBE_READY_TIMEOUT_MS = 15_000;
/**
 * RuTube сообщает время не на каждом кадре; между сообщениями досчитываем сами, но не дальше
 * этого запаса — если сообщения пропали, время не убегает вперёд.
 */
const RUTUBE_EXTRAPOLATE_SEC = 1.5;

const RUTUBE_STATES: Partial<Record<RuTubeState, EngineState>> = {
  playing: 'playing',
  paused: 'paused',
  stopped: 'paused',
  buffering: 'buffering',
  seeking: 'buffering',
  completed: 'ended',
};

const createRuTube: CreateEngine = (container, segment, h) => {
  let state: EngineState = 'other';
  let last: { time: number; at: number } | null = null;
  const now = () => performance.now();

  const engine: Engine = {
    play: () => player.play(),
    pause: () => player.pause(),
    currentTime() {
      if (!last) return undefined;
      if (state !== 'playing') return last.time;
      return last.time + Math.min(RUTUBE_EXTRAPOLATE_SEC, (now() - last.at) / 1000);
    },
    state: () => state,
  };

  const setState = (next: EngineState) => {
    // Досчитанное время фиксируем, иначе после паузы оно продолжило бы расти.
    const t = engine.currentTime();
    if (t !== undefined) last = { time: t, at: now() };
    state = next;
    h.onState(next, engine);
  };

  const readyTimer = setTimeout(() => h.onError('rutube_timeout'), RUTUBE_READY_TIMEOUT_MS);
  const player = createRuTubePlayer(container, {
    videoId: segment.externalId,
    startSec: segment.startSec,
    endSec: segment.endSec,
    onEvent: (e) => {
      switch (e.type) {
        case 'ready':
          clearTimeout(readyTimer);
          return h.onReady(engine);
        case 'time':
          last = { time: e.time, at: now() };
          return;
        case 'state':
          return setState(RUTUBE_STATES[e.state] ?? 'other');
        case 'complete':
          return setState('ended');
        case 'error':
          clearTimeout(readyTimer);
          return h.onError('rutube');
      }
    },
  });
  return () => {
    clearTimeout(readyTimer);
    player.destroy();
  };
};
