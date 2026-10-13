// Плеер аудиотеки (этап 20): песни и сказки, которые родитель отметил «Детям». Крупные плитки:
// нажал — играет, ещё раз — пауза; после трека сам включается следующий.
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

  const play = (i: number) => {
    const el = audio.current;
    if (!el) return;
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
                {on && playing ? '❚❚' : '▶'}
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
          if (current !== null && current + 1 < tracks.length) play(current + 1);
        }}
      />
    </div>
  );
}
