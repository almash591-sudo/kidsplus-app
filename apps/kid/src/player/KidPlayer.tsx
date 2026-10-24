import type { KidSegment } from '@kidsplus/shared/api';
import {
  createYouTubePlayer,
  loadYouTubeApi,
  YT_STATE,
  type YTPlayer,
} from '@kidsplus/shared/youtube-iframe';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sendEvent } from '../api';
import { allowLandscape } from '../kiosk';
import { GUARD_INTERVAL_MS, shouldFinish } from './guard';
import { Icon } from '../ui/icons';
import { fromPayload, type From } from '../visit';

export type ExitReason = 'complete' | 'exit' | 'error';

/**
 * tap-video — наша кнопка не смогла запустить видео (Safari на iPhone: первое нажатие должно
 * прийти в сам плеер YouTube): защита от касаний на миг убрана, палец показывает, куда нажать.
 */
type View = 'loading' | 'playing' | 'paused' | 'needs-tap' | 'tap-video' | 'buffering' | 'finished';

/** Если за это время видео не заиграло само — показываем большую кнопку «играть». */
const AUTOPLAY_WAIT_MS = 1500;
/** Сколько показывать «молодец» после досмотра. */
const CELEBRATE_MS = 1800;

/**
 * Детский плеер (п. 5.3 ТЗ):
 * - прозрачный слой поверх iframe перехватывает все касания;
 * - конец фрагмента контролирует приложение: плеер уничтожается до заставки с рекомендациями;
 * - пока видео не играет, его закрывает своя заглушка (на паузе YouTube показывает «другие видео»);
 * - при сворачивании — пауза.
 */
export function KidPlayer({
  segment,
  from,
  onExit,
}: {
  segment: KidSegment;
  /** Урок «Сегодня» или сам выбрал (этап 44); у экрана малыша — нет. */
  from?: From;
  onExit: (reason: ExitReason) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const destroyPlayer = useRef<(() => void) | null>(null);
  const done = useRef(false);
  const started = useRef(false);
  const [view, setView] = useState<View>('loading');
  // В ref, чтобы новая функция onExit у родителя не пересоздавала плеер посреди видео.
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  // Видео можно смотреть и лёжа на боку: поворот — только пока открыт плеер.
  useEffect(() => {
    allowLandscape(true);
    return () => allowLandscape(false);
  }, []);

  /** Завершение ровно один раз: сразу уничтожаем плеер, затем отчёт и выход. */
  const finish = useCallback(
    (reason: ExitReason, payload?: Record<string, number | string>) => {
      if (done.current) return;
      done.current = true;
      const at = player.current ? Math.round(player.current.getCurrentTime()) : undefined;
      destroyPlayer.current?.();
      destroyPlayer.current = null;
      player.current = null;

      const type =
        reason === 'complete'
          ? 'segment_complete'
          : reason === 'exit'
            ? 'segment_exit'
            : 'segment_error';
      sendEvent({
        type,
        segmentId: segment.id,
        payload: { ...(at !== undefined ? { at } : {}), ...fromPayload(from), ...payload },
      });

      if (reason === 'complete') {
        setView('finished');
        setTimeout(() => onExitRef.current('complete'), CELEBRATE_MS);
      } else {
        onExitRef.current(reason);
      }
    },
    [segment.id, from],
  );

  useEffect(() => {
    let cancelled = false;
    let autoplayTimer: ReturnType<typeof setTimeout> | undefined;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !container.current) return;
        const created = createYouTubePlayer(YT, container.current, {
          videoId: segment.externalId,
          startSec: segment.startSec,
          endSec: segment.endSec,
          controls: false,
          autoplay: true,
          onReady: (p) => {
            player.current = p;
            p.playVideo();
            autoplayTimer = setTimeout(() => {
              if (!done.current && p.getPlayerState() !== YT_STATE.PLAYING) setView('needs-tap');
            }, AUTOPLAY_WAIT_MS);
          },
          onStateChange: (state, p) => {
            if (done.current) return;
            if (shouldFinish(p.getCurrentTime(), segment.endSec, state)) return finish('complete');
            if (state === YT_STATE.PLAYING) {
              setView('playing');
              if (!started.current) {
                started.current = true;
                sendEvent({
                  type: 'segment_start',
                  segmentId: segment.id,
                  payload: fromPayload(from),
                });
              }
            } else if (state === YT_STATE.PAUSED) setView('paused');
            else if (state === YT_STATE.BUFFERING)
              setView((v) => (v === 'playing' ? 'buffering' : v));
          },
          onError: (code) => finish('error', { code }),
        });
        destroyPlayer.current = created.destroy;
      })
      .catch(() => finish('error', { code: 'api_load_failed' }));

    // Страховка: событие ENDED может прийти поздно — проверяем время сами.
    const guard = setInterval(() => {
      const p = player.current;
      if (
        p &&
        !done.current &&
        shouldFinish(p.getCurrentTime(), segment.endSec, p.getPlayerState())
      ) {
        finish('complete');
      }
    }, GUARD_INTERVAL_MS);

    // Свернули приложение или погасили экран — пауза; учёт времени остановится вместе с ней.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        player.current?.pauseVideo();
        sendEvent({ type: 'app_hidden', segmentId: segment.id });
      } else {
        sendEvent({ type: 'app_visible', segmentId: segment.id });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(autoplayTimer);
      clearInterval(guard);
      document.removeEventListener('visibilitychange', onVisibility);
      destroyPlayer.current?.();
      destroyPlayer.current = null;
      player.current = null;
    };
  }, [segment, finish, from]);

  const play = () => {
    const p = player.current;
    if (!p) return;
    p.playVideo();
    setTimeout(() => {
      const state = player.current?.getPlayerState();
      if (!done.current && state !== YT_STATE.PLAYING && state !== YT_STATE.BUFFERING)
        setView('tap-video');
    }, AUTOPLAY_WAIT_MS);
  };
  const pause = () => player.current?.pauseVideo();

  if (view === 'finished') {
    return (
      <div className="player-screen" data-testid="celebrate">
        <div className="celebrate" aria-hidden="true">
          ⭐
        </div>
      </div>
    );
  }

  const covered = view !== 'playing' && view !== 'tap-video';
  return (
    <div className="player-screen" data-testid="player">
      <div ref={container} className="player-frame" data-testid="player-frame" />
      {/* Перехватывает все касания: до iframe YouTube ничего не доходит (кроме tap-video). */}
      <div
        className={view === 'tap-video' ? 'touch-shield open' : 'touch-shield'}
        data-testid="touch-shield"
        onPointerDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      />
      {covered && (
        <div
          className="player-cover"
          style={{
            backgroundImage: segment.thumbnailUrl ? `url(${segment.thumbnailUrl})` : undefined,
          }}
        >
          {view === 'loading' || view === 'buffering' ? (
            <div className="spinner" aria-label="загрузка" />
          ) : (
            <button
              type="button"
              className="big-button play"
              aria-label="Играть"
              onClick={play}
              data-testid="play"
            >
              ▶
            </button>
          )}
        </div>
      )}
      {view === 'tap-video' && (
        <div className="tap-video-hint" aria-hidden="true" data-testid="tap-video">
          👆
        </div>
      )}
      {view === 'playing' && (
        <button
          type="button"
          className="corner-button pause"
          aria-label="Пауза"
          onClick={pause}
          data-testid="pause"
        >
          ❚❚
        </button>
      )}
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={() => finish('exit')}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
