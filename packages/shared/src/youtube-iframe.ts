// Браузерный загрузчик YouTube IFrame Player API и минимальные типы.
// Плеер встраивается с youtube-nocookie.com; видео не скачиваются.

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTEvent<T = unknown> {
  target: YTPlayer;
  data: T;
}

interface YTPlayerOptions {
  host?: string;
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTEvent) => void;
    onStateChange?: (e: YTEvent<number>) => void;
    onError?: (e: YTEvent<number>) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

/** Загружает IFrame API один раз; повторные вызовы получают тот же промис. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('не удалось загрузить плеер YouTube'));
    };
    document.head.append(script);
  });
  return loading;
}

export interface CreatePlayerOptions {
  videoId: string;
  startSec: number;
  endSec: number;
  /** Показывать ли элементы управления YouTube (родителю — да, ребёнку — нет). */
  controls: boolean;
  autoplay: boolean;
  onReady?: (player: YTPlayer) => void;
  onStateChange?: (state: number, player: YTPlayer) => void;
  onError?: (code: number) => void;
}

/**
 * Создаёт плеер внутри `container`. Плеер заменяет собой отдельный дочерний элемент,
 * поэтому React-разметку контейнера не трогает. Вернёт функцию уничтожения.
 */
export function createYouTubePlayer(
  YT: YTNamespace,
  container: HTMLElement,
  o: CreatePlayerOptions,
) {
  const mount = document.createElement('div');
  container.replaceChildren(mount);
  const player = new YT.Player(mount, {
    host: 'https://www.youtube-nocookie.com',
    videoId: o.videoId,
    width: '100%',
    height: '100%',
    // Параметры из п. 5.3 ТЗ.
    playerVars: {
      start: o.startSec,
      end: o.endSec,
      controls: o.controls ? 1 : 0,
      disablekb: o.controls ? 0 : 1,
      fs: 0,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
      enablejsapi: 1,
      autoplay: o.autoplay ? 1 : 0,
      origin: window.location.origin,
    },
    events: {
      onReady: (e) => o.onReady?.(e.target),
      onStateChange: (e) => o.onStateChange?.(e.data, e.target),
      onError: (e) => o.onError?.(e.data),
    },
  });
  return {
    player,
    destroy() {
      try {
        player.destroy();
      } catch {
        // плеер мог не успеть инициализироваться
      }
      container.replaceChildren();
    },
  };
}
