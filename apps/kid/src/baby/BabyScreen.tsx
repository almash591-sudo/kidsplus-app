// Экран малыша (этап 16б): телефон на кронштейне, малыш его не трогает — включает мама.
// Четыре больших кнопки: песенки, логопед, шум для сна, мамин голос. Всё играет само по кругу;
// последний режим запоминается — после включения телефона в машине он продолжится.
// Голосовые команды («Малыш, дальше» и т. п., этап 16в) приходят событием kidsplus-voice.
import type { KidItem, KidPlaylist, KidSegment } from '@kidsplus/shared/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fx } from '../fx';
import { setKeepAwake, setNightMode, voiceControl } from '../kiosk';
import { KidPlayer } from '../player/KidPlayer';
import { NOISES, playNoise, type NoiseKind, type NoisePlayer } from './noise';
import './baby.css';

export type BabyMode = 'menu' | 'songs' | 'speech' | 'noise' | 'mama';
/** Команды голосом (этап 16в) и с кнопок. */
export type BabyCommand = Exclude<BabyMode, 'menu'> | 'next' | 'stop';

const STORE = 'kidsplus.baby';
const TIMERS = [15, 30, 60, 0] as const;

function load(): { mode: BabyMode; noise: NoiseKind } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as {
      mode?: BabyMode;
      noise?: NoiseKind;
    };
    return { mode: v.mode ?? 'menu', noise: v.noise && v.noise in NOISES ? v.noise : 'shush' };
  } catch {
    return { mode: 'menu', noise: 'shush' };
  }
}
function save(v: { mode: BabyMode; noise: NoiseKind }) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    // нет хранилища — просто без памяти
  }
}

type Seg = KidSegment & { kind: 'segment' };
const segments = (items: KidItem[]) =>
  items.filter((i): i is Seg & KidItem => i.kind === 'segment');

/**
 * Видео по режиму: песенки — тема «Музыка», логопед — тема «Разное» (видео про речь);
 * если тем не задано — песенками считаются все видео.
 */
export function babyVideos(items: KidItem[], mode: 'songs' | 'speech'): Seg[] {
  const all = segments(items) as Seg[];
  const speech = all.filter((s) => s.subject === 'other');
  if (mode === 'speech') return speech;
  const songs = all.filter((s) => s.subject === 'music');
  return songs.length ? songs : all.filter((s) => s.subject !== 'other');
}

const TILES: { mode: Exclude<BabyMode, 'menu'>; emoji: string; label: string }[] = [
  { mode: 'songs', emoji: '🎵', label: 'Песенки' },
  { mode: 'speech', emoji: '🗣️', label: 'Логопед' },
  { mode: 'noise', emoji: '🌙', label: 'Шум для сна' },
  { mode: 'mama', emoji: '💗', label: 'Мама' },
];

export function BabyScreen({ playlist }: { playlist: KidPlaylist }) {
  const [state, setState] = useState(load);
  const [index, setIndex] = useState(0);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [seq, setSeq] = useState(0);
  const { mode, noise } = state;
  const set = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    setState(next);
    save(next);
  };

  const videos = useMemo(
    () => (mode === 'songs' || mode === 'speech' ? babyVideos(playlist.items, mode) : []),
    [mode, playlist.items],
  );

  // Голосовые команды (этап 16в): событие от киоска.
  const command = useRef<(c: BabyCommand) => void>(() => {});
  useEffect(() => {
    command.current = (c) => {
      if (c === 'stop') return set({ mode: 'menu' });
      if (c === 'next') {
        setIndex((i) => i + 1);
        setSeq((s) => s + 1);
        return;
      }
      setIndex(0);
      set({ mode: c });
    };
  });

  useEffect(() => {
    const on = (e: Event) => command.current((e as CustomEvent<BabyCommand>).detail);
    window.addEventListener('kidsplus-voice', on);
    // Киоск слушает «Малыш, …» (офлайн) — команды приходят сюда; громкость меняет сам киоск.
    const stopVoice = voiceControl((c) => {
      fx.bell(2); // маме слышно, что команда понята
      if (c !== 'louder' && c !== 'quieter')
        window.dispatchEvent(new CustomEvent('kidsplus-voice', { detail: c }));
    });
    return () => {
      window.removeEventListener('kidsplus-voice', on);
      stopVoice();
    };
  }, []);

  // Шум и мамин голос — ночной экран (тёмный, не гаснет); видео — обычный.
  useEffect(() => {
    void setNightMode(mode === 'noise' || mode === 'mama');
    // Видео — экран не гаснет, пока играет.
    void setKeepAwake(mode === 'songs' || mode === 'speech');
    return () => {
      void setNightMode(false);
      void setKeepAwake(false);
    };
  }, [mode]);

  if (mode === 'songs' || mode === 'speech') {
    if (!videos.length)
      return (
        <Empty
          text={mode === 'songs' ? 'Песенок пока нет' : 'Видео логопеда пока нет'}
          onBack={() => set({ mode: 'menu' })}
        />
      );
    const seg = videos[index % videos.length]!;
    return (
      <div className="baby baby-video" data-testid="baby-video" data-mode={mode}>
        <KidPlayer
          key={`${seq}-${seg.id}-${index}`}
          segment={seg}
          onExit={(reason) => {
            if (reason === 'exit') set({ mode: 'menu' });
            else setIndex((i) => i + 1);
          }}
        />
      </div>
    );
  }

  if (mode === 'noise')
    return (
      <NoiseView
        kind={noise}
        timer={timer}
        onKind={(k) => set({ noise: k })}
        onTimer={setTimer}
        onBack={() => set({ mode: 'menu' })}
      />
    );

  if (mode === 'mama')
    return <MamaView lullabies={playlist.lullabies ?? []} onBack={() => set({ mode: 'menu' })} />;

  return (
    <div className="baby baby-menu" data-testid="baby-menu">
      {TILES.map((t) => (
        <button
          key={t.mode}
          type="button"
          className={`baby-tile ${t.mode}`}
          data-testid="baby-tile"
          data-mode={t.mode}
          onClick={() => {
            setIndex(0);
            set({ mode: t.mode });
          }}
        >
          <span className="baby-emoji" aria-hidden="true">
            {t.emoji}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="baby-back" onClick={onBack} data-testid="baby-back">
      ◀ Меню
    </button>
  );
}

function Empty({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="baby baby-dark">
      <p className="baby-note">{text} — добавьте и одобрите в кабинете.</p>
      <Back onBack={onBack} />
    </div>
  );
}

function NoiseView(props: {
  kind: NoiseKind;
  timer: (typeof TIMERS)[number];
  onKind: (k: NoiseKind) => void;
  onTimer: (t: (typeof TIMERS)[number]) => void;
  onBack: () => void;
}) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const p: NoisePlayer | null = playNoise(props.kind);
    let end: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    if (props.timer) {
      const until = Date.now() + props.timer * 60_000;
      // Конец таймера — шум плавно затихает за 30 секунд.
      end = setTimeout(() => p?.stop(30), props.timer * 60_000 - 30_000);
      tick = setInterval(
        () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 60_000))),
        5000,
      );
    }
    return () => {
      p?.stop();
      clearTimeout(end);
      clearInterval(tick);
      setLeft(null);
    };
  }, [props.kind, props.timer]);

  return (
    <div className="baby baby-dark" data-testid="baby-noise" data-noise={props.kind}>
      <div className="baby-moon" aria-hidden="true">
        🌙
      </div>
      <div className="baby-chips">
        {(Object.keys(NOISES) as NoiseKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className={k === props.kind ? 'on' : ''}
            onClick={() => props.onKind(k)}
          >
            {NOISES[k].emoji} {NOISES[k].label}
          </button>
        ))}
      </div>
      <div className="baby-chips">
        {TIMERS.map((t) => (
          <button
            key={t}
            type="button"
            className={t === props.timer ? 'on' : ''}
            onClick={() => props.onTimer(t)}
          >
            {t ? `${t} мин` : 'Без конца'}
          </button>
        ))}
      </div>
      {left !== null && <p className="baby-note">Осталось около {left} мин</p>}
      <Back onBack={props.onBack} />
    </div>
  );
}

function MamaView({
  lullabies,
  onBack,
}: {
  lullabies: { label: string; url: string }[];
  onBack: () => void;
}) {
  const [i, setI] = useState(0);
  const current = lullabies.length ? lullabies[i % lullabies.length]! : null;
  useEffect(() => {
    if (!current) return;
    const a = new Audio(current.url);
    a.onended = () => setI((x) => x + 1);
    a.onerror = () => setTimeout(() => setI((x) => x + 1), 1000);
    void a.play().catch(() => {});
    return () => a.pause();
  }, [current, i]);

  return (
    <div className="baby baby-dark" data-testid="baby-mama">
      <div className="baby-heart" aria-hidden="true">
        💗
      </div>
      <p className="baby-note">
        {current ? current.label : 'Мама ещё не записала колыбельные — кабинет → «Мамин голос».'}
      </p>
      <Back onBack={onBack} />
    </div>
  );
}
