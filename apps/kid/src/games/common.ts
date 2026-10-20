import type { KidPhrases, Speech } from '@kidsplus/shared/api';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { isRapidGuessing, RAPID_PAUSE_MS, WRONG_LOCK_MS } from '../quiz/engine';
import { praisePhrase, retryPhrase, slowPhrase, streak, STREAK_EVERY } from '../variety';
import { burst, burstAt, cheer } from './juice';

/** Параметры игры одного вида. */
export type SpecOf<K extends GameKind> = Extract<GameSpec, { kind: K }>;

export interface GameProps<K extends GameKind> {
  spec: SpecOf<K>;
  phrases: KidPhrases;
  /** Игра пройдена — похвала и следующий пункт. */
  onFinish: () => void;
}

export const ru = (text: string): Speech => ({ text, lang: 'ru', audioUrl: null });

/** Сказать фразы по-русски (новая фраза прерывает предыдущую). */
export const say = (...texts: string[]) => playSequence(texts.map(ru));

/** Как повторить текущее задание — для кнопки «ушко» и подсказки при бездействии. */
let repeatTask: (() => unknown) | null = null;

/** Задание игры: сказать и запомнить, чтобы его можно было повторить. */
export const ask = (...texts: string[]) => askSpeech(texts.map(ru));
export const askSpeech = (items: Speech[]) => {
  repeatTask = () => playSequence(items);
  return playSequence(items);
};
/** Запомнить задание, не произнося (например, если оно уже звучит частями). */
export const setTask = (repeat: (() => unknown) | null) => {
  repeatTask = repeat;
};
/** Повторить задание; false — у игры его нет. */
export const repeatCurrentTask = () => {
  if (!repeatTask) return false;
  repeatTask();
  return true;
};

/** Похвала: звук успеха, искры там, где палец, радость маскота и фраза (за серию — особая). */
export const praise = (phrases: KidPhrases, at?: { x: number; y: number }) => {
  fx.success();
  const phrase = praisePhrase(phrases);
  const series = streak.get() % STREAK_EVERY === 0;
  burst(at, series ? 28 : undefined);
  cheer(series ? 'wow' : 'happy');
  wrongTimes.length = 0;
  return playSequence([phrase ?? null]);
};

// ─── Реакция на ошибку (этап 30) ───────────────────────────────────────────────

/** Что сейчас с касаниями в игре: открыты, закрыты на миг после ошибки, пауза «не спеши». */
export type GameLock = 'none' | 'wait' | 'think';
let lock: GameLock = 'none';
let unlockTimer: ReturnType<typeof setTimeout> | undefined;
const lockListeners = new Set<() => void>();
const setLock = (next: GameLock, ms = 0) => {
  lock = next;
  lockListeners.forEach((l) => l());
  clearTimeout(unlockTimer);
  if (next !== 'none') unlockTimer = setTimeout(() => setLock('none'), ms);
};
export const gameLock = {
  get: () => lock,
  subscribe(l: () => void) {
    lockListeners.add(l);
    return () => lockListeners.delete(l);
  },
  reset: () => setLock('none'),
};

/** Время неверных ответов подряд — чтобы заметить «тыканье наугад». */
const wrongTimes: number[] = [];

/** Куда ребёнок нажал последним — это и трясётся при ошибке. */
let lastTap: Element | null = null;
if (typeof document !== 'undefined')
  document.addEventListener('pointerdown', (e) => (lastTap = e.target as Element), true);

/** Потрясти то, что ребёнок нажал (кнопку, картинку, фигуру), — «нет-нет». */
function shakeLastTap() {
  const t = lastTap;
  if (!t?.isConnected) return;
  const el = t.closest('button, [data-testid]:not([data-testid="game"])') ?? t;
  const box = el.getBoundingClientRect();
  if (box.width * box.height > window.innerWidth * window.innerHeight * 0.5) return;
  el.animate?.(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-12px) rotate(-3deg)' },
      { transform: 'translateX(10px) rotate(3deg)' },
      { transform: 'translateX(-7px) rotate(-2deg)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 500, easing: 'ease-in-out', composite: 'add' },
  );
}

/** Ошибки в текущей игре (этап 34): по ним сервер ведёт уровень сложности. */
let mistakes = 0;
export const gameMistakes = {
  reset: () => (mistakes = 0),
  get: () => mistakes,
};

/**
 * Неверно: «бом-бом», вибрация, нажатое трясётся, маскот «ой», касания на миг закрыты и
 * «попробуй ещё»; два неверных подряд в спешке — «не спеши» и пауза.
 */
export const retry = (phrases: KidPhrases) => {
  mistakes++;
  fx.wrong();
  cheer('oops');
  shakeLastTap();
  wrongTimes.push(Date.now());
  if (isRapidGuessing(wrongTimes)) {
    wrongTimes.length = 0;
    setLock('think', RAPID_PAUSE_MS);
    return playSequence([slowPhrase(phrases) ?? null]);
  }
  setLock('wait', WRONG_LOCK_MS);
  return playSequence([retryPhrase(phrases) ?? null]);
};
/**
 * Промах в игре на ловкость (тучка в «Совёнок летит»): засчитать для уровня и «бом», но без
 * паузы касаний — палец в это время держит экран.
 */
export const bump = () => {
  mistakes++;
  fx.wrong();
};
/** Маленький успех без фразы (предмет встал на место): щелчок и искры. */
export const nice = (el?: Element | null) => {
  fx.snap();
  if (el) burstAt(el, 8);
  else burst(undefined, 8);
};

/** Счёт вслух: «один», «два»… */
export const NUMBERS = [
  'ноль',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
  'двадцать',
];

/** Цвета красок: название (для озвучки) и творительный падеж («раскрась красным»). */
export const PALETTE = [
  { id: 'red', hex: '#E8453C', name: 'красный', with: 'красным' },
  { id: 'orange', hex: '#F59E0B', name: 'оранжевый', with: 'оранжевым' },
  { id: 'yellow', hex: '#FACC15', name: 'жёлтый', with: 'жёлтым' },
  { id: 'green', hex: '#22A55B', name: 'зелёный', with: 'зелёным' },
  { id: 'lightblue', hex: '#7DD3FC', name: 'голубой', with: 'голубым' },
  { id: 'blue', hex: '#2563EB', name: 'синий', with: 'синим' },
  { id: 'purple', hex: '#9B5DE5', name: 'фиолетовый', with: 'фиолетовым' },
  { id: 'pink', hex: '#F472B6', name: 'розовый', with: 'розовым' },
  { id: 'brown', hex: '#92400E', name: 'коричневый', with: 'коричневым' },
  { id: 'black', hex: '#222222', name: 'чёрный', with: 'чёрным' },
  { id: 'white', hex: '#FFFFFF', name: 'белый', with: 'белым' },
] as const;
export type PaintId = (typeof PALETTE)[number]['id'];
export const paint = (id: PaintId) => PALETTE.find((p) => p.id === id)!;

export function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Точка касания в координатах viewBox SVG. */
export function svgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }) {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** Глиняная картинка из /games (этап 35). */
export const clayUrl = (name: string) => `/games/${name}.webp`;
