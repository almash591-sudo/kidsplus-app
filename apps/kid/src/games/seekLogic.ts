// Логика «Пряток в комнате» (этап 59): кто где спрятался и нашли ли его. Экран — в Seek.tsx.
import type { SeekTask } from '@kidsplus/shared/games';
import type { SpecOf } from './common';
import { dirOf, offBy, type View } from './gaze';

export type Rnd = () => number;

export const SEEK_ANIMALS = [
  'bear',
  'chick',
  'elephant',
  'frog',
  'mouse',
  'rabbit',
  'turtle',
] as const;
export type SeekAnimal = (typeof SEEK_ANIMALS)[number];
/** Кто это: «Вот зайка!». */
export const ANIMAL_NAMES: Record<SeekAnimal, string> = {
  bear: 'мишка',
  chick: 'цыплёнок',
  elephant: 'слонёнок',
  frog: 'лягушонок',
  mouse: 'мышонок',
  rabbit: 'зайка',
  turtle: 'черепашка',
};
/** Кого ищем: «Найди зайку!». */
export const ANIMAL_WHOM: Record<SeekAnimal, string> = {
  bear: 'мишку',
  chick: 'цыплёнка',
  elephant: 'слонёнка',
  frog: 'лягушонка',
  mouse: 'мышонка',
  rabbit: 'зайку',
  turtle: 'черепашку',
};

export const SEEK_PLACES = ['up', 'down', 'left', 'right', 'behind'] as const;
export type SeekPlace = (typeof SEEK_PLACES)[number];
export const PLACE_WORDS: Record<SeekPlace, string> = {
  up: 'наверху',
  down: 'внизу',
  left: 'слева',
  right: 'справа',
  behind: 'сзади',
};
/** Где это от ребёнка: сбоку и сзади — от того, куда он повёрнут в момент вопроса. */
const PLACE_AT: Record<SeekPlace, { az: number; el: number }> = {
  up: { az: 0, el: 48 },
  down: { az: 0, el: -42 },
  left: { az: -65, el: 0 },
  right: { az: 65, el: 0 },
  behind: { az: 180, el: 0 },
};

export const HIDES = ['bush', 'cloud', 'box'] as const;
export type Hide = (typeof HIDES)[number];

/** Кружок прицела: укрытие в нём считается найденным, градусов от середины экрана. */
export const AIM_DEG = 9;
/** Сколько мс держать укрытие в кружке. */
export const DWELL_MS = 450;
/** Прячутся перед ребёнком в таких пределах, градусов в обе стороны. */
const NEAR_DEG = 75;
/** Смотрит выше или ниже этого — не спрашиваем про то, что уже перед глазами. */
const LOOKING_DEG = 25;

export interface SeekRound {
  task: SeekTask;
  count: number;
  wide: boolean;
}

export type SpotState = 'hidden' | 'seen' | 'found';

export interface Spot {
  id: number;
  /** Направление в мире, градусы. */
  az: number;
  el: number;
  animal: SeekAnimal;
  hide: Hide;
  place?: SeekPlace;
  state: SpotState;
  /** Был ли взгляд вне укрытия: новое укрытие прямо перед глазами не срабатывает само. */
  armed: boolean;
  /** Когда появилось или сменило состояние, мс часов игры. */
  at: number;
}

const pick = <T>(all: readonly T[], rnd: Rnd) => all[Math.floor(rnd() * all.length)]!;
export function shuffled<T>(all: readonly T[], rnd: Rnd) {
  const a = [...all];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Задания идут по очереди: так ребёнок успевает встретить каждое. */
export function planRounds(spec: SpecOf<'seek'>): SeekRound[] {
  return Array.from({ length: spec.rounds }, (_, k) => ({
    task: spec.tasks[k % spec.tasks.length]!,
    count: spec.animals,
    wide: spec.wide,
  }));
}

/** Картинки игры: зверята из общего набора, укрытия и нарисованная комната. */
export const seekSprites = () => [
  ...SEEK_ANIMALS.map((a) => `animal-${a}`),
  ...HIDES.map((h) => `seek-${h}`),
  'seek-room',
  'arrow-up',
];

/**
 * Зверята вокруг ребёнка: у каждого свой сектор, поэтому укрытия не слипаются. wide — по всему кругу,
 * иначе только перед ребёнком: маленькому незачем крутиться.
 */
export function scatter(
  count: number,
  wide: boolean,
  heading: number,
  firstId: number,
  rnd: Rnd = Math.random,
): Spot[] {
  const animals = shuffled(SEEK_ANIMALS, rnd);
  const range = wide ? 360 : NEAR_DEG * 2;
  const slot = range / count;
  const from = wide ? rnd() * 360 : -NEAR_DEG;
  return Array.from({ length: count }, (_, i) => ({
    id: firstId + i,
    az: heading + from + (i + 0.5 + (rnd() - 0.5) * 0.4) * slot,
    // Выше и ниже по очереди: так их легче различить и приятнее искать.
    el: (i % 2 ? 1 : -1) * (6 + rnd() * 14),
    animal: animals[i % animals.length]!,
    hide: i % 3 === 2 ? 'box' : i % 3 === 1 ? 'cloud' : 'bush',
    state: 'hidden' as SpotState,
    armed: true,
    at: 0,
  }));
}

/** Какие места есть в этой игре. */
export const placesFor = (wide: boolean) =>
  SEEK_PLACES.filter((p) => p !== 'behind' || wide) as SeekPlace[];

/** Куда спросить: не туда же, что и в прошлый раз, и не туда, куда ребёнок уже смотрит. */
export function nextPlace(
  wide: boolean,
  last: SeekPlace | undefined,
  pitch: number,
  rnd: Rnd = Math.random,
): SeekPlace {
  const all = placesFor(wide).filter(
    (p) =>
      p !== last && !(p === 'up' && pitch > LOOKING_DEG) && !(p === 'down' && pitch < -LOOKING_DEG),
  );
  return pick(all, rnd);
}

/** Вопрос «кто где»: по зверёнку в каждом месте, вокруг того, куда ребёнок повёрнут сейчас. */
export function around(wide: boolean, heading: number, firstId: number, rnd: Rnd = Math.random) {
  const animals = shuffled(SEEK_ANIMALS, rnd);
  return placesFor(wide).map((place, i): Spot => ({
    id: firstId + i,
    az: heading + PLACE_AT[place].az,
    el: PLACE_AT[place].el,
    animal: animals[i]!,
    hide: place === 'up' ? 'cloud' : i % 2 ? 'box' : 'bush',
    place,
    state: 'hidden',
    armed: true,
    at: 0,
  }));
}

export const spotDir = (s: Pick<Spot, 'az' | 'el'>) => dirOf(s.az, s.el);

/** Какое укрытие в кружке. Открытые не считаются, а незаряженное ждёт, пока взгляд с него уйдёт. */
export function aimedAt(view: View, spots: readonly Spot[]) {
  let best: Spot | undefined;
  let close = AIM_DEG;
  for (const s of spots) {
    const off = offBy(view, spotDir(s));
    if (off > AIM_DEG * 1.4) s.armed = true;
    if (s.state === 'hidden' && s.armed && off < close) {
      close = off;
      best = s;
    }
  }
  return best;
}

/** Что уже в кружке, само не сработает: сначала взгляд должен уйти и вернуться. */
export const disarm = (spots: readonly Spot[], view: View) => {
  for (const s of spots) if (offBy(view, spotDir(s)) < AIM_DEG * 1.4) s.armed = false;
};

/** Кого искать дальше, когда ищем всех: ближайшего к взгляду. */
export function nearest(view: View, spots: readonly Spot[]) {
  let best: Spot | undefined;
  for (const s of spots)
    if (s.state === 'hidden' && (!best || offBy(view, spotDir(s)) < offBy(view, spotDir(best))))
      best = s;
  return best;
}

/** Точка в круге укрытия: для пальца круг щедрее самой картинки. */
export const tapped = (x: number, y: number, sx: number, sy: number, size: number) =>
  Math.hypot(x - sx, y - sy) < size * 0.62;

/** Размер укрытия на экране. */
export const spotSize = (w: number, h: number) => Math.min(w, h) * 0.34;
