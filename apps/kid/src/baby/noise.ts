// Шум для сна малыша (этап 16б): генерирует сам телефон — без файлов и интернета.
// Белый, розовый (мягче), «шшш» (как мама шикает), сердцебиение, дождь. С таймером и затуханием.

export const NOISES = {
  white: { label: 'Белый', emoji: '⚪' },
  pink: { label: 'Мягкий', emoji: '🌸' },
  shush: { label: 'Шшш', emoji: '🤫' },
  heart: { label: 'Сердце', emoji: '❤️' },
  rain: { label: 'Дождь', emoji: '🌧️' },
} as const;
export type NoiseKind = keyof typeof NOISES;

const SECONDS = 4;

/** Буфер шума: white — равномерный, pink — фильтр Пола Келлета (мягче, «теплее»). */
function noiseBuffer(ctx: AudioContext, kind: 'white' | 'pink'): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * SECONDS, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') {
      d[i] = w * 0.5;
      continue;
    }
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

export interface NoisePlayer {
  stop(fadeSec?: number): void;
}

/** Запустить шум; громкость 0–1. Возвращает управление (стоп с плавным затуханием). */
export function playNoise(kind: NoiseKind, volume = 0.6): NoisePlayer | null {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  void ctx.resume();
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 2);
  out.connect(ctx.destination);
  const timers: ReturnType<typeof setInterval>[] = [];

  const loop = (type: 'white' | 'pink') => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, type);
    src.loop = true;
    src.start();
    return src;
  };

  if (kind === 'white' || kind === 'pink') {
    loop(kind).connect(out);
  } else if (kind === 'shush') {
    // «Шшш»: шум в полосе 2–6 кГц, громкость медленно дышит (раз в ~2 с).
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3500;
    f.Q.value = 0.8;
    const breath = ctx.createGain();
    breath.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.45;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(breath.gain);
    lfo.start();
    loop('white').connect(f).connect(breath).connect(out);
  } else if (kind === 'rain') {
    // Дождь: мягкий шум и редкие «капли» — короткие щелчки на высоких частотах.
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2500;
    loop('pink').connect(f).connect(out);
    timers.push(
      setInterval(() => {
        const t = ctx.currentTime + Math.random() * 0.2;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(1800 + Math.random() * 2500, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.08);
      }, 90),
    );
  } else {
    // Сердцебиение: «тук-тук» 65 ударов в минуту, низко и мягко — как у мамы в животике.
    const beat = () => {
      const t = ctx.currentTime + 0.05;
      for (const [at, gain] of [
        [0, 0.9],
        [0.28, 0.6],
      ] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(70, t + at);
        o.frequency.exponentialRampToValueAtTime(40, t + at + 0.15);
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(gain, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.22);
        o.connect(g).connect(out);
        o.start(t + at);
        o.stop(t + at + 0.25);
      }
    };
    beat();
    timers.push(setInterval(beat, 60_000 / 65));
    // Под стук — очень тихий фон, чтобы не было «пустоты».
    const bg = ctx.createGain();
    bg.gain.value = 0.15;
    loop('pink').connect(bg).connect(out);
  }

  let stopped = false;
  return {
    stop(fadeSec = 1.5) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
      setTimeout(
        () => {
          timers.forEach(clearInterval);
          void ctx.close();
        },
        fadeSec * 1000 + 100,
      );
    },
  };
}
