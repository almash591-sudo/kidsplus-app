// Плеер аудиотеки (этап 20): песни и сказки, которые родитель отметил «Детям». Крупные плитки:
// нажал — играет, ещё раз — пауза; после трека сам включается следующий. Видео семьи (этап 42)
// открывается на весь экран: касание — пауза, ✕ — назад; в конце закрывается само.
import type { KidAudioTrack } from '@kidsplus/shared/audio';
import { useEffect, useRef, useState } from 'react';
import { kidApi } from '../api';
import { fx } from '../fx';
import { Icon } from '../ui/icons';

const COLORS = ['#ff6b5c', '#f5a000', '#2fb67c', '#2d9cff', '#8e5cf6', '#ff5fa2', '#00a9bd'];

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
      <span aria-hidden="true">🎧</span>
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
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<KidAudioTrack | null>(null);

  const play = (i: number) => {
    const el = audio.current;
    if (!el) return;
    if (tracks[i]!.video) {
      el.pause();
      setVideo(tracks[i]!);
      return;
    }
    if (i === current) {
      if (el.paused) void el.play().catch(() => {});
      else el.pause();
      return;
    }
    setCurrent(i);
    setProgress(0);
    el.src = tracks[i]!.url;
    void el.play().catch(() => {});
  };

  return (
    <div className="screen audio-library" data-testid="audio-library">
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={() => {
          audio.current?.pause();
          onExit();
        }}
        data-testid="audio-close"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
      <header className="audio-head">
        <h1>Песенки и сказки</h1>
      </header>
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
              style={{ '--c': COLORS[i % COLORS.length] } as React.CSSProperties}
              data-testid="audio-tile"
              onClick={() => play(i)}
            >
              <span className="audio-icon" aria-hidden="true">
                {t.video ? '🎬' : on && playing ? '❚❚' : '▶'}
              </span>
              <span className="audio-title">{t.title}</span>
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
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
  const [paused, setPaused] = useState(false);
  return (
    <div className="kid-video" data-testid="kid-video">
      <video
        ref={ref}
        src={track.url}
        autoPlay
        playsInline
        disablePictureInPicture
        controlsList="nodownload noremoteplayback"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={onClose}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          fx.tap();
          if (el.paused) void el.play().catch(() => {});
          else el.pause();
        }}
      />
      {paused && (
        <span className="kid-video-paused" aria-hidden="true">
          ▶
        </span>
      )}
      <button
        type="button"
        className="corner-button kid-video-close"
        aria-label="Закрыть"
        data-testid="kid-video-close"
        onClick={() => {
          fx.tap();
          onClose();
        }}
      >
        <Icon name="close" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
