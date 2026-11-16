// Плеер аудиотеки (этап 20): песни и сказки, которые родитель отметил «Детям». Крупные плитки:
// нажал — играет, ещё раз — пауза; после трека сам включается следующий. Видео семьи (этап 42)
// открывается на весь экран: касание — пауза, ✕ — назад; в конце закрывается само.
import type { KidAudioTrack } from '@kidsplus/shared/audio';
import { useEffect, useRef, useState } from 'react';
import { kidApi } from '../api';
import { fx } from '../fx';
import { Icon } from '../ui/icons';
import { FairyHeader } from '../ui/FairyGuide';
import { ROOM_PHRASES } from '../phrases';

export function AudioButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="audio-open"
      aria-label="Песенки и сказки"
      data-testid="audio-open"
      onClick={() => {
        fx.tap();
        onOpen();
      }}
    >
      <Icon name="music" size={32} />
    </button>
  );
}

/** Есть ли что слушать — без треков кнопку в доке не показываем. */
export function useAudioTracks(enabled: boolean): KidAudioTrack[] {
  const [tracks, setTracks] = useState<KidAudioTrack[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      kidApi
        .audio()
        .then((t) => alive && setTracks(t))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);
  return tracks;
}

export function AudioScreen({ tracks, onExit }: { tracks: KidAudioTrack[]; onExit: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playAttempt = useRef(0);
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<KidAudioTrack | null>(null);
  const [failed, setFailed] = useState(false);

  const play = (i: number) => {
    const el = audio.current;
    if (!el) return;
    const attempt = ++playAttempt.current;
    setFailed(false);
    const start = () =>
      void el.play().catch(() => {
        if (playAttempt.current === attempt) setFailed(true);
      });
    if (tracks[i]!.video) {
      el.pause();
      setVideo(tracks[i]!);
      return;
    }
    if (i === current) {
      if (el.paused) {
        if (el.error) el.load();
        start();
      } else el.pause();
      return;
    }
    setCurrent(i);
    setProgress(0);
    el.src = tracks[i]!.url;
    start();
  };

  return (
    <div className="screen audio-library fairy-page fairy-audio" data-testid="audio-library">
      <FairyHeader
        title="Песенки и сказки"
        picture="/games/music-note.webp"
        hint={ROOM_PHRASES.audio}
        onBack={() => {
          audio.current?.pause();
          onExit();
        }}
        backTestId="audio-close"
      />
      {failed && (
        <p className="fairy-audio-error" role="status">
          Не включилось. Нажми ещё раз.
        </p>
      )}
      <div className="audio-list">
        {tracks.map((t, i) => {
          const on = i === current;
          return (
            <button
              key={t.id}
              type="button"
              className={['audio-tile', on && 'on', on && playing && 'playing']
                .filter(Boolean)
                .join(' ')}
              data-testid="audio-tile"
              data-kind={t.video ? 'video' : 'audio'}
              aria-label={`${t.video ? 'Посмотреть' : on && playing ? 'Пауза' : 'Послушать'}: ${t.title}`}
              aria-pressed={on && playing && !t.video}
              onClick={() => play(i)}
            >
              <img
                className="fairy-audio-art"
                src={t.video ? '/playroom/tablet.webp' : '/games/music-note.webp'}
                alt=""
              />
              <span className="audio-title">{t.title}</span>
              <span className="audio-icon" aria-hidden="true">
                <Icon name={on && playing && !t.video ? 'pause' : 'play'} size={28} />
              </span>
              {on && (
                <span className="audio-progress" aria-hidden="true">
                  <span style={{ width: `${progress * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          setFailed(false);
        }}
        onPause={() => setPlaying(false)}
        onError={(e) => {
          if (e.currentTarget.error) setFailed(true);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
        onEnded={() => {
          setPlaying(false);
          // Следующая песня — без видео: видео ребёнок включает сам.
          const next = current === null ? -1 : tracks.findIndex((t, k) => k > current && !t.video);
          if (next >= 0) play(next);
        }}
      />
      {video && <VideoView track={video} onClose={() => setVideo(null)} />}
    </div>
  );
}

/** Видео на весь экран: без перемотки и ссылок; касание — пауза/дальше. */
function VideoView({ track, onClose }: { track: KidAudioTrack; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    const before = opener.current;
    element.showModal();
    return () => {
      element.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    fx.tap();
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  };
  return (
    <dialog
      ref={dialog}
      className="kid-video fairy-family-video"
      data-testid="kid-video"
      aria-label={track.title}
      onCancel={onClose}
    >
      <video
        ref={ref}
        src={track.url}
        autoPlay
        playsInline
        disablePictureInPicture
        controlsList="nodownload noremoteplayback"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onError={() => setFailed(true)}
        onEnded={onClose}
        onClick={toggle}
      />
      {failed ? (
        <p className="fairy-family-video-error" role="status">
          Видео не открылось
        </p>
      ) : (
        <button
          type="button"
          className={`fairy-video-toggle${paused ? ' is-paused' : ''}`}
          aria-label={paused ? 'Продолжить' : 'Пауза'}
          onClick={toggle}
        >
          <Icon name={paused ? 'play' : 'pause'} size={30} />
        </button>
      )}
      <button
        type="button"
        className="fairy-back kid-video-close"
        aria-label="Закрыть"
        data-testid="kid-video-close"
        onClick={() => {
          fx.tap();
          onClose();
        }}
      >
        <Icon name="close" size={34} stroke={2.6} />
      </button>
    </dialog>
  );
}
