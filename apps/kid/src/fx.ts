// Звуки интерфейса и вибро-отклик. Звуки синтезируются Web Audio — без файлов и лицензий.
// Тихие и мягкие (п. 5.1 ТЗ: без наказывающих звуков); ошибка звучит как «бульк», а не «бззз».

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;

/** Громкость эффектов относительно голоса. */
const VOLUME = 0.22;
/** Громкость музыкальных уроков: ноты должны быть слышны не тише голоса. */
const MUSIC_VOLUME = 0.75;

function audio(bus: 'fx' | 'music' = 'fx'): { ctx: Ctx; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(ctx.destination);
  }
  // Браузер запускает звук только после касания — первое касание его и «будит».
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: bus === 'music' ? musicBus! : master! };
}

/** Нота: частота, начало (с от сейчас), длительность, тембр, громкость; slideTo — скольжение высоты. */
function tone(
  freq: number,
  at: number,
  dur: number,
  o: { type?: OscillatorType; gain?: number; slideTo?: number; bus?: 'fx' | 'music' } = {},
) {
  const a = audio(o.bus);
  if (!a) return;
  const t = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  // Мягкая атака и затухание — без щелчков.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.6, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Шум с полосовым фильтром: «вжух», «хлоп». */
function noise(
  at: number,
  dur: number,
  o: { from: number; to: number; gain?: number; q?: number; bus?: 'fx' | 'music' },
) {
  const a = audio(o.bus);
  if (!a) return;
  const t = a.ctx.currentTime + at;
  const len = Math.ceil(a.ctx.sampleRate * dur);
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.from, t);
  f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.5, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // вибрация недоступна — не страшно
  }
}

// Ноты (Гц)
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;
/** До, ре, ми, соль, ля — пентатоника. */
const BELLS = [C5, 587.33, E5, G5, 880];

export const fx = {
  /** Касание кнопки: короткий мягкий щелчок, как клавиатура iPhone, и лёгкая вибрация. */
  tap() {
    noise(0, 0.035, { from: 3200, to: 1800, gain: 0.3, q: 1.2 });
    tone(1350, 0, 0.035, { type: 'triangle', gain: 0.12 });
    vibrate(6);
  },
  /** Переход между экранами: лёгкий «вжух». */
  whoosh() {
    noise(0, 0.28, { from: 400, to: 2400, gain: 0.25 });
  },
  /** Верно: восходящее арпеджио. */
  success() {
    [C5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.07, 0.22, { type: 'triangle', gain: 0.45 }));
    vibrate([15, 40, 15]);
  },
  /** Не то — мягкий «бульк» вниз, без наказания; лёгкая двойная вибрация. */
  soft() {
    tone(420, 0, 0.16, { slideTo: 300, gain: 0.3 });
    vibrate([8, 40, 8]);
  },
  /** Волшебный звон (наклейка, альбом): быстрые высокие нотки вверх. */
  sparkle() {
    [E6, G5 * 2, C6 * 2, E6 * 2].forEach((f, i) =>
      tone(f, i * 0.06, 0.18, { type: 'triangle', gain: 0.18 }),
    );
    vibrate([10, 30, 10]);
  },
  /** Предмет встал на место: двойной щелчок. */
  snap() {
    tone(1200, 0, 0.05, { type: 'triangle', gain: 0.35 });
    tone(1600, 0.06, 0.07, { type: 'triangle', gain: 0.3 });
    vibrate(12);
  },
  /** Карточка перевернулась. */
  flip() {
    noise(0, 0.12, { from: 1800, to: 3500, gain: 0.2, q: 2 });
  },
  /** Шарик лопнул. */
  pop() {
    noise(0, 0.09, { from: 2500, to: 600, gain: 0.7, q: 0.8 });
    tone(300, 0, 0.08, { slideTo: 120, gain: 0.4 });
    vibrate(15);
  },
  /** Краска выбрана / область закрашена: капелька. */
  drop() {
    tone(900, 0, 0.1, { slideTo: 1500, gain: 0.3 });
  },
  /** Колокольчик «Повтори мелодию»: i — номер (пентатоника, без фальши в любом порядке). */
  bell(i: number) {
    const f = BELLS[i % BELLS.length]!;
    tone(f, 0, 0.9, { gain: 0.5 });
    tone(f * 2, 0, 0.5, { gain: 0.15 });
    tone(f * 3.01, 0, 0.25, { type: 'triangle', gain: 0.06 });
  },
  /** Попал по зверьку: «боинг». */
  boing() {
    tone(220, 0, 0.25, { slideTo: 520, type: 'triangle', gain: 0.4 });
    vibrate(18);
  },
  /** Упёрся в стенку лабиринта: глухой «тук». */
  thud() {
    tone(160, 0, 0.08, { slideTo: 90, gain: 0.35 });
    vibrate(10);
  },
  /** Предмет прилетел / улетел. */
  fly() {
    noise(0, 0.22, { from: 800, to: 3000, gain: 0.18, q: 3 });
  },
  /** Шаг героя: тихий «тик». */
  step() {
    tone(880 + Math.random() * 200, 0, 0.04, { type: 'triangle', gain: 0.15 });
  },
  /** Праздник в конце: арпеджио и искорки. */
  fanfare() {
    [C5, E5, G5, C6, E6].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: 'triangle', gain: 0.4 }));
    for (let i = 0; i < 6; i++)
      tone(1800 + Math.random() * 1600, 0.5 + i * 0.07, 0.12, { gain: 0.15 });
    vibrate([20, 50, 20, 50, 40]);
  },
};

/** Глобальный «тык» на любую кнопку детского приложения. */
export function installTapFeedback(root: Document = document) {
  const onDown = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest?.('button');
    if (el && !el.hasAttribute('data-silent') && !(el as HTMLButtonElement).disabled) fx.tap();
  };
  root.addEventListener('pointerdown', onDown, { capture: true });
  return () => root.removeEventListener('pointerdown', onDown, { capture: true });
}

// ─── Музыка (этап 14б) ──────────────────────────────────────────────────────

/** Ноты от «до» первой октавы до «до» второй, Гц. */
export const NOTE_FREQ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

/** Звуки музыкальных уроков: инструмент, похожий на пианино, и барабан. */
export const music = {
  /** Нота «пианино»: основной тон с обертонами и затуханием. gain — громкость (0–1). */
  note(freq: number, at = 0, dur = 0.6, gain = 0.6) {
    const b = { bus: 'music' as const };
    tone(freq, at, dur, { ...b, type: 'triangle', gain });
    tone(freq * 2, at, dur * 0.6, { ...b, gain: gain * 0.25 });
    tone(freq * 3, at, dur * 0.3, { ...b, gain: gain * 0.08 });
  },
  /** Длинная ровная нота (для «долго»): без быстрого затухания. */
  long(freq: number, at = 0, dur = 1.6, gain = 0.5) {
    tone(freq, at, dur, { bus: 'music', type: 'triangle', gain });
    tone(freq * 2, at, dur, { bus: 'music', gain: gain * 0.15 });
  },
  /** Удар барабана: низкий «бум» с призвуком. */
  drum(at = 0, gain = 0.9) {
    tone(150, at, 0.32, { bus: 'music', slideTo: 55, gain });
    noise(at, 0.08, { from: 1800, to: 500, gain: gain * 0.4, q: 0.9, bus: 'music' });
  },
  /** Сейчас по часам звука, с — для точных интервалов. */
  now() {
    return audio('music')?.ctx.currentTime ?? 0;
  },
};
