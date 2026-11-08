// Этап 59: куда смотрит телефон. Тот же датчик, что у наклона, но здесь важен и поворот вокруг себя.
// Всё считается векторами: телефон в игре стоит вертикально, а там углы датчика скачут, хотя сам
// телефон почти не двигается. Север у датчика условный, и это не мешает: важно только, как телефон
// повернулся с начала игры. Оси мира: x — восток, y — север, z — вверх.
import {
  cross,
  dot,
  minus,
  scaled,
  steerBy,
  unit,
  type SensorTimes,
  type Steer,
  type Vec3,
} from './tilt';

/** Оси экрана в мире: вправо, вверх и куда смотрит задняя камера. */
export interface View {
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
}

/** Угол зрения камеры телефона по длинной стороне, градусов. */
const FOV = 62;
/** Насколько должна сдвинуться ось взгляда, чтобы считать, что телефон в руках. */
const MOVED = 0.012;
/** Сглаживание: какая доля нового значения берётся с каждого события. */
const SMOOTH = 0.35;
/** Взгляд почти вертикальный: направление по нему уже не понять. */
const STEEP = 0.9;

const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

/** Оси телефона в мире по событию deviceorientation (Z-X'-Y'', как в спецификации). */
export function viewOf(alpha: number, beta: number, gamma: number): View {
  const [cA, sA] = [Math.cos(rad(alpha)), Math.sin(rad(alpha))];
  const [cB, sB] = [Math.cos(rad(beta)), Math.sin(rad(beta))];
  const [cG, sG] = [Math.cos(rad(gamma)), Math.sin(rad(gamma))];
  return {
    right: [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG],
    up: [-cB * sA, cA * cB, sB],
    fwd: [-(cG * sA * sB + cA * sG), cA * cG * sB - sA * sG, -cB * cG],
  };
}

/** Экран мог повернуться вместе с телефоном (angle — как у screen.orientation). */
export function turned(v: View, angle: number): View {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return { right: scaled(v.up, -1), up: v.right, fwd: v.fwd };
    case 180:
      return { right: scaled(v.right, -1), up: scaled(v.up, -1), fwd: v.fwd };
    case 270:
      return { right: v.up, up: scaled(v.right, -1), fwd: v.fwd };
    default:
      return v;
  }
}

/** Направление по компасу и высоте, градусы: 0 — север, по часовой; 90 — зенит. */
export function dirOf(az: number, el: number): Vec3 {
  const [a, e] = [rad(az), rad(el)];
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

/** Куда повёрнут ребёнок, градусы. Смотрит в пол или в потолок — судим по верху телефона. */
export function headingOf(v: View) {
  const steep = Math.abs(v.fwd[2]) > STEEP;
  const a = steep ? scaled(v.up, v.fwd[2] > 0 ? -1 : 1) : v.fwd;
  return deg(Math.atan2(a[0], a[1]));
}

/** Высота взгляда над горизонтом, градусы. */
export const pitchOf = (v: View) => deg(Math.asin(Math.max(-1, Math.min(1, v.fwd[2]))));

/** Взгляд без датчика: комнату двигают пальцем. Горизонт всегда ровный. */
export function fingerView(az: number, el: number): View {
  const fwd = dirOf(az, el);
  const right: Vec3 = [Math.cos(rad(az)), -Math.sin(rad(az)), 0];
  return { right, up: cross(right, fwd), fwd };
}

/** Фокусное расстояние в точках экрана: большой предмет на экране такой же, как в комнате. */
export const focalOf = (w: number, h: number) => Math.max(w, h) / (2 * Math.tan(rad(FOV / 2)));

export interface Projected {
  x: number;
  y: number;
  /** Точка перед камерой: за спиной рисовать нечего. */
  front: boolean;
}

/** Где на экране окажется направление. */
export function project(v: View, dir: Vec3, f: number, w: number, h: number): Projected {
  const z = dot(dir, v.fwd);
  if (z < 0.05) return { x: 0, y: 0, front: false };
  return {
    x: w / 2 + (f * dot(dir, v.right)) / z,
    y: h / 2 - (f * dot(dir, v.up)) / z,
    front: true,
  };
}

/** Угол между взглядом и направлением, градусы. */
export const offBy = (v: View, dir: Vec3) =>
  deg(Math.acos(Math.max(-1, Math.min(1, dot(dir, v.fwd)))));

/**
 * Куда показать стрелкой, радианы: 0 — вверх, по часовой. Цель за спиной — только вбок: стрелка «через
 * голову» просила бы запрокинуться, а надо повернуться всем телом.
 */
export function arrowTo(v: View, dir: Vec3) {
  const x = dot(dir, v.right);
  const y = dot(dir, v.up);
  if (dot(dir, v.fwd) < 0) return x < 0 ? -Math.PI / 2 : Math.PI / 2;
  return Math.atan2(x, y);
}

const blend = (a: Vec3, b: Vec3) => minus(a, scaled(minus(a, b), SMOOTH));

/** Плавно к новому положению; оси остаются перпендикулярными. */
function eased(from: View, to: View): View {
  const fwd = unit(blend(from.fwd, to.fwd));
  const raw = blend(from.up, to.up);
  const up = unit(minus(raw, scaled(fwd, dot(raw, fwd))));
  return { right: cross(fwd, up), up, fwd };
}

type Source = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** Датчик взгляда. stop обязателен: подписка на событие живёт, пока её не снимут. */
export function createGaze(source: Source = window, clock = () => performance.now()) {
  let view: View | null = null;
  let mark: Vec3 | null = null;
  const times: SensorTimes = { startedAt: Infinity, lastAt: -Infinity, movedAt: -Infinity };

  const listen = (e: Event) => {
    const { alpha, beta, gamma } = e as DeviceOrientationEvent;
    if (alpha == null || beta == null || gamma == null) return;
    const now = clock();
    const next = viewOf(alpha, beta, gamma);
    view = view ? eased(view, next) : next;
    times.lastAt = now;
    const d = mark ? minus(view.fwd, mark) : null;
    if (!d || dot(d, d) > MOVED * MOVED) {
      mark = view.fwd;
      times.movedAt = now;
    }
  };

  return {
    start() {
      times.startedAt = clock();
      source.addEventListener('deviceorientation', listen);
    },
    stop() {
      source.removeEventListener('deviceorientation', listen);
    },
    /** Куда смотрит телефон; null — датчик ещё не отозвался. */
    read: () => view,
    steer: (): Steer => steerBy(clock(), times),
    /** Датчик хоть раз отозвался с начала игры. */
    heard: () => times.lastAt >= times.startedAt,
  };
}
