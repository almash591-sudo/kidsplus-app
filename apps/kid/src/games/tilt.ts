// Этап 59: наклон телефона для игр. Датчик отдаёт углы beta и gamma, из них — куда тянет сила
// тяжести в осях телефона. Наклон считается от положения, в котором ребёнок держит телефон, а не
// от горизонта: играть удобно и сидя, и лёжа. Ничего не записывается и никуда не уходит — в памяти
// только текущее значение.

export type Vec3 = readonly [number, number, number];
export interface Vec {
  x: number;
  y: number;
}
/** Чем сейчас управляется игра. */
export type Steer = 'tilt' | 'finger';

/** Наклон на столько градусов от «нуля» — уже полный. */
export const FULL_DEG = 24;
/** Дрожание рук: меньше этого наклона (доля полного) шарик не чувствует. */
export const DEAD = 0.06;
/** Датчик ни разу не отозвался за столько мс — управляем пальцем. */
export const LOST_MS = 1500;
/**
 * Телефон не сдвинулся за столько мс — лежит на столе или датчик завис: управляем пальцем. Отдельно
 * «датчик замолчал» не считаем: неподвижный телефон в Chrome событий и не шлёт.
 */
export const STILL_MS = 8000;
/** Насколько должен сдвинуться вектор тяжести, чтобы считать телефон в руках (≈ 0,7°). */
const MOVED = 0.012;
/** Сглаживание: какая доля нового значения берётся с каждого события датчика. */
const SMOOTH = 0.35;

const rad = (deg: number) => (deg * Math.PI) / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scaled = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const n = Math.sqrt(dot(a, a));
  return n < 1e-6 ? a : scaled(a, 1 / n);
};
/** Часть вектора в плоскости, перпендикулярной n. */
const flat = (a: Vec3, n: Vec3) => minus(a, scaled(n, dot(a, n)));

/** Куда тянет тяжесть в осях телефона: x — к правому краю, y — к верхнему, z — из экрана. */
export function gravityOf(beta: number, gamma: number): Vec3 {
  const b = rad(beta);
  const g = rad(gamma);
  return [Math.sin(g) * Math.cos(b), -Math.sin(b), -Math.cos(g) * Math.cos(b)];
}

/** Оси плоскости наклона: вправо и вниз по экрану, какой бы стороной телефон ни держали. */
function axes(n: Vec3) {
  const side = flat([1, 0, 0], n);
  if (dot(side, side) > 0.1) {
    const ex = unit(side);
    return { ex, ey: cross(n, ex) };
  }
  // Телефон держат боком: правый край смотрит вниз или вверх.
  const ey = unit(flat([0, -1, 0], n));
  return { ex: cross(ey, n), ey };
}

/**
 * Наклон от «нуля» в осях телефона: x — к правому краю, y — к нижнему, длина не больше 1.
 * Считается в плоскости, перпендикулярной «нулю»: телефон в руках под углом чувствует наклон так
 * же, как лежащий на столе.
 */
export function tiltFrom(g: Vec3, zero: Vec3): Vec {
  const n = unit(zero);
  const { ex, ey } = axes(n);
  const u = flat(unit(g), n);
  const full = Math.sin(rad(FULL_DEG));
  const x = dot(u, ex) / full;
  const y = dot(u, ey) / full;
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

/** Убрать дрожание рук: маленький наклон — ноль, дальше плавно до единицы. */
export function calmed(t: Vec): Vec {
  const len = Math.hypot(t.x, t.y);
  if (len <= DEAD) return { x: 0, y: 0 };
  const k = (len - DEAD) / (1 - DEAD) / len;
  return { x: t.x * k, y: t.y * k };
}

/** Наклон в осях экрана: телефон мог повернуть экран (angle — как у screen.orientation). */
export function onScreen(t: Vec, angle: number): Vec {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return { x: t.y, y: -t.x };
    case 180:
      return { x: -t.x, y: -t.y };
    case 270:
      return { x: -t.y, y: t.x };
    default:
      return t;
  }
}

/** На сколько сейчас повёрнут экран (старый Safari знает только window.orientation). */
export function screenAngle() {
  const old = (window as unknown as { orientation?: number }).orientation;
  return screen.orientation?.angle ?? old ?? 0;
}

/** Что показывает датчик: когда включили, когда отзывался, когда телефон сдвинулся. */
export interface SensorTimes {
  startedAt: number;
  lastAt: number;
  movedAt: number;
}

/** Наклоном или пальцем: датчик молчит с самого начала или телефон лежит неподвижно — пальцем. */
export function steerBy(now: number, t: SensorTimes): Steer {
  if (t.lastAt < t.startedAt) return now - t.startedAt > LOST_MS ? 'finger' : 'tilt';
  return now - Math.max(t.movedAt, t.startedAt) > STILL_MS ? 'finger' : 'tilt';
}

/** Разрешено ли читать датчик: на iPhone спрашивает система, и только после нажатия. */
export type MotionAccess = 'granted' | 'denied' | 'gesture';
export async function askMotion(): Promise<MotionAccess> {
  const api = window.DeviceOrientationEvent as unknown as
    { requestPermission?: () => Promise<string> } | undefined;
  if (!api?.requestPermission) return 'granted';
  try {
    return (await api.requestPermission()) === 'granted' ? 'granted' : 'denied';
  } catch {
    // Не было нажатия: спросим по кнопке.
    return 'gesture';
  }
}

type Source = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** Датчик наклона. stop обязателен: подписка на событие живёт, пока её не снимут. */
export function createTilt(source: Source = window, clock = () => performance.now()) {
  let g: Vec3 | null = null;
  let zero: Vec3 | null = null;
  let mark: Vec3 | null = null;
  const times: SensorTimes = { startedAt: Infinity, lastAt: -Infinity, movedAt: -Infinity };

  const listen = (e: Event) => {
    const { beta, gamma } = e as DeviceOrientationEvent;
    if (beta == null || gamma == null) return;
    const now = clock();
    const next = gravityOf(beta, gamma);
    g = g ? minus(g, scaled(minus(g, next), SMOOTH)) : next;
    times.lastAt = now;
    const d = mark ? minus(g, mark) : null;
    if (!d || dot(d, d) > MOVED * MOVED) {
      mark = g;
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
    /** Как ребёнок держит телефон сейчас — это и есть «ровно». */
    center() {
      zero = g;
    },
    /** Наклон от «нуля» в осях телефона, без дрожания рук. */
    read(): Vec {
      if (!g) return { x: 0, y: 0 };
      zero ??= g;
      return calmed(tiltFrom(g, zero));
    },
    steer: (): Steer => steerBy(clock(), times),
  };
}
