import type { KidPhrases, Speech } from '@kidsplus/shared/api';
import type { GameKind, GameSpec } from '@kidsplus/shared/games';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { pick } from '../quiz/engine';
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

/** Похвала: звук успеха, искры там, где палец, радость маскота и фраза. */
export const praise = (phrases: KidPhrases, at?: { x: number; y: number }) => {
  fx.success();
  burst(at);
  cheer('happy');
  return playSequence([pick(phrases.correct) ?? null]);
};
/** Мягкая подсказка: «бульк», маскот «ой» и «попробуй ещё». */
export const retry = (phrases: KidPhrases) => {
  fx.soft();
  cheer('oops');
  return playSequence([pick(phrases.retry) ?? null]);
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
