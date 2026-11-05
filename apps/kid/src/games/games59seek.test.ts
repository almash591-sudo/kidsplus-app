import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { seekFound, seekHere, seekOther, seekPhrases, seekWhere, seekWho } from '../phrases';
import type { SpecOf } from './common';
import {
  arrowTo,
  createGaze,
  dirOf,
  fingerView,
  focalOf,
  headingOf,
  offBy,
  pitchOf,
  project,
  turned,
  viewOf,
} from './gaze';
import {
  AIM_DEG,
  aimedAt,
  ANIMAL_NAMES,
  ANIMAL_WHOM,
  around,
  disarm,
  nearest,
  nextPlace,
  placesFor,
  planRounds,
  scatter,
  SEEK_ANIMALS,
  seekSprites,
  spotDir,
  tapped,
  type Spot,
} from './seekLogic';
import { dot, type Vec3 } from './tilt';

const spec = (over: object = {}) =>
  gameSpec.parse({ kind: 'seek', rounds: 3, ...over }) as SpecOf<'seek'>;

/** Предсказуемый генератор: тесты не зависят от удачи. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}
const near = (a: Vec3, b: readonly number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 5));
/** Разница углов по кругу. */
const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** Телефон держат вертикально и смотрят на az, el — как автопилот в e2e. */
const aimed = (az: number, el = 0) => viewOf(-az, 90 + el, 0);

describe('куда смотрит телефон', () => {
  it('лежит на столе — камера смотрит вниз, верх телефона на север', () => {
    const v = viewOf(0, 0, 0);
    near(v.fwd, [0, 0, -1]);
    near(v.up, [0, 1, 0]);
    near(v.right, [1, 0, 0]);
  });

  it('стоит вертикально — камера смотрит вперёд, верх телефона в потолок', () => {
    const v = viewOf(0, 90, 0);
    near(v.fwd, [0, 1, 0]);
    near(v.up, [0, 0, 1]);
    near(v.right, [1, 0, 0]);
  });

  it('повернулся направо — правая рука теперь на юге', () => {
    const v = viewOf(-90, 90, 0);
    near(v.fwd, [1, 0, 0]);
    near(v.right, [0, -1, 0]);
    expect(headingOf(v)).toBeCloseTo(90, 5);
  });

  it('оси всегда перпендикулярны, как ни держи', () => {
    const rnd = seeded(5);
    for (let i = 0; i < 200; i++) {
      const v = viewOf(rnd() * 360, rnd() * 360 - 180, rnd() * 180 - 90);
      expect(dot(v.fwd, v.fwd)).toBeCloseTo(1, 6);
      expect(dot(v.fwd, v.up)).toBeCloseTo(0, 6);
      expect(dot(v.fwd, v.right)).toBeCloseTo(0, 6);
      expect(dot(v.up, v.right)).toBeCloseTo(0, 6);
    }
  });

  it('автопилот и формула сходятся: наводим на az, el и туда смотрим', () => {
    for (const [az, el] of [
      [0, 0],
      [65, 0],
      [-65, 20],
      [180, -30],
      [130, 48],
    ] as const) {
      const v = aimed(az, el);
      expect(offBy(v, dirOf(az, el))).toBeLessThan(0.01);
      expect(pitchOf(v)).toBeCloseTo(el, 5);
      expect(apart(headingOf(v), az)).toBeLessThan(0.01);
    }
  });

  it('около вертикали углы датчика скачут, а взгляд нет', () => {
    // β перевалила за 90°: прежний поворот вокруг оси пошёл бы в другую сторону.
    const a = viewOf(10, 89.9, 0);
    const b = viewOf(10, 90.1, 0);
    expect(offBy(a, b.fwd)).toBeLessThan(0.3);
    expect(apart(headingOf(a), headingOf(b))).toBeLessThan(0.3);
  });

  it('смотрит почти в пол или потолок — направление не теряется', () => {
    expect(apart(headingOf(aimed(40, -80)), 40)).toBeLessThan(0.01);
    expect(apart(headingOf(aimed(40, 80)), 40)).toBeLessThan(0.01);
  });

  it('экран повернулся вместе с телефоном — вправо остаётся вправо', () => {
    // Телефон положили на левый бок: верх телефона теперь указывает влево.
    const v = viewOf(0, 90, 0);
    const side = { right: [0, 0, -1] as Vec3, up: [1, 0, 0] as Vec3, fwd: v.fwd };
    near(turned(side, 90).right, [-1, 0, 0]);
    near(turned(side, 90).up, [0, 0, -1]);
    near(turned(v, 0).right, v.right);
    near(turned(v, 180).up, [0, 0, -1]);
    near(turned(v, 270).right, [0, 0, 1]);
    near(turned(v, -90).right, [0, 0, 1]);
  });

  it('взгляд пальцем: горизонт ровный, в ту же сторону, что и по датчику', () => {
    const v = fingerView(30, 15);
    expect(v.right[2]).toBeCloseTo(0, 6);
    expect(offBy(v, dirOf(30, 15))).toBeLessThan(0.01);
    expect(v.up[2]).toBeGreaterThan(0);
    const same = aimed(30, 15);
    near(v.right, same.right);
    near(v.up, same.up);
  });
});

describe('где на экране', () => {
  const w = 412;
  const h = 915;
  const f = focalOf(w, h);

  it('то, на что смотрим, в середине экрана', () => {
    const q = project(aimed(50, 10), dirOf(50, 10), f, w, h);
    expect(q.front).toBe(true);
    expect(q.x).toBeCloseTo(w / 2, 4);
    expect(q.y).toBeCloseTo(h / 2, 4);
  });

  it('справа — правее середины, выше — выше', () => {
    const v = aimed(0);
    expect(project(v, dirOf(10, 0), f, w, h).x).toBeGreaterThan(w / 2);
    expect(project(v, dirOf(-10, 0), f, w, h).x).toBeLessThan(w / 2);
    expect(project(v, dirOf(0, 10), f, w, h).y).toBeLessThan(h / 2);
  });

  it('за спиной на экране ничего нет', () => {
    expect(project(aimed(0), dirOf(180, 0), f, w, h).front).toBe(false);
    expect(project(aimed(0), dirOf(95, 0), f, w, h).front).toBe(false);
  });

  it('повернулись вправо — предмет уехал влево', () => {
    const dir = dirOf(0, 0);
    expect(project(aimed(20), dir, f, w, h).x).toBeLessThan(w / 2);
    expect(project(aimed(-20), dir, f, w, h).x).toBeGreaterThan(w / 2);
  });

  it('стрелка показывает на цель', () => {
    const v = aimed(0);
    expect(arrowTo(v, dirOf(80, 0))).toBeCloseTo(Math.PI / 2, 5);
    expect(arrowTo(v, dirOf(-80, 0))).toBeCloseTo(-Math.PI / 2, 5);
    expect(arrowTo(v, dirOf(0, 60))).toBeCloseTo(0, 5);
    expect(Math.abs(arrowTo(v, dirOf(0, -60)))).toBeCloseTo(Math.PI, 5);
  });

  it('цель за спиной — стрелка вбок, а не «запрокинься назад»', () => {
    const v = aimed(0);
    expect(arrowTo(v, dirOf(150, 0))).toBeCloseTo(Math.PI / 2, 5);
    expect(arrowTo(v, dirOf(-150, 0))).toBeCloseTo(-Math.PI / 2, 5);
    expect(Math.abs(arrowTo(v, dirOf(180, 10)))).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('датчик взгляда', () => {
  /** Поддельное окно: события доставляются вручную. */
  function fake() {
    const heard = new Set<(e: Event) => void>();
    return {
      addEventListener: (_: string, fn: (e: Event) => void) => heard.add(fn),
      removeEventListener: (_: string, fn: (e: Event) => void) => heard.delete(fn),
      send: (alpha: number | null, beta: number | null, gamma: number | null) =>
        heard.forEach((fn) => fn({ alpha, beta, gamma } as unknown as Event)),
      count: () => heard.size,
    };
  }
  const make = () => {
    const win = fake();
    let now = 0;
    const gaze = createGaze(win as unknown as Window, () => now);
    return { win, gaze, at: (t: number) => (now = t) };
  };

  it('сразу отвечает тем, что показал датчик, а потом сглаживает', () => {
    const { win, gaze } = make();
    gaze.start();
    expect(gaze.read()).toBeNull();
    win.send(0, 90, 0);
    near(gaze.read()!.fwd, [0, 1, 0]);
    win.send(-90, 90, 0);
    const half = gaze.read()!;
    expect(offBy(half, dirOf(0, 0))).toBeGreaterThan(5);
    expect(offBy(half, dirOf(90, 0))).toBeGreaterThan(5);
    for (let i = 0; i < 40; i++) win.send(-90, 90, 0);
    expect(offBy(gaze.read()!, dirOf(90, 0))).toBeLessThan(0.5);
  });

  it('сглаженные оси остаются перпендикулярными', () => {
    const { win, gaze } = make();
    gaze.start();
    win.send(0, 90, 0);
    win.send(-120, 60, 30);
    const v = gaze.read()!;
    expect(dot(v.fwd, v.up)).toBeCloseTo(0, 6);
    expect(dot(v.fwd, v.right)).toBeCloseTo(0, 6);
    expect(dot(v.up, v.up)).toBeCloseTo(1, 6);
  });

  it('пустое событие — датчика нет, играем пальцем', () => {
    const { win, gaze, at } = make();
    gaze.start();
    win.send(null, null, null);
    expect(gaze.read()).toBeNull();
    expect(gaze.heard()).toBe(false);
    at(1000);
    expect(gaze.steer()).toBe('tilt');
    at(2000);
    expect(gaze.steer()).toBe('finger');
  });

  it('телефон отложили — пальцем, взяли снова — снова поворотом', () => {
    const { win, gaze, at } = make();
    gaze.start();
    win.send(0, 90, 0);
    expect(gaze.heard()).toBe(true);
    at(5000);
    win.send(0, 90, 0);
    expect(gaze.steer()).toBe('tilt');
    at(9000);
    win.send(0, 90, 0);
    expect(gaze.steer()).toBe('finger');
    win.send(-40, 90, 0);
    expect(gaze.steer()).toBe('tilt');
  });

  it('stop снимает подписку', () => {
    const { win, gaze } = make();
    gaze.start();
    expect(win.count()).toBe(1);
    gaze.stop();
    expect(win.count()).toBe(0);
  });
});

describe('кто где спрятался', () => {
  it('задания идут по очереди, раундов сколько задано', () => {
    const r = planRounds(
      spec({ tasks: ['all', 'who', 'where'], rounds: 4, animals: 4, wide: true }),
    );
    expect(r.map((x) => x.task)).toEqual(['all', 'who', 'where', 'all']);
    expect(r[0]).toMatchObject({ count: 4, wide: true });
  });

  it('зверята разные, укрытия далеко друг от друга и достижимы', () => {
    for (let seed = 1; seed < 200; seed++) {
      const rnd = seeded(seed);
      const count = 2 + (seed % 4);
      const wide = seed % 2 === 0;
      const heading = rnd() * 360;
      const spots = scatter(count, wide, heading, 1, rnd);
      expect(spots).toHaveLength(count);
      expect(new Set(spots.map((s) => s.animal)).size).toBe(count);
      expect(new Set(spots.map((s) => s.id)).size).toBe(count);
      for (const a of spots) {
        expect(Math.abs(a.el)).toBeLessThanOrEqual(20);
        if (!wide) expect(apart(a.az, heading)).toBeLessThanOrEqual(75);
        for (const b of spots)
          if (a !== b) expect(offBy(fingerView(a.az, a.el), spotDir(b))).toBeGreaterThan(25);
      }
    }
  });

  it('wide — зверята и за спиной', () => {
    let behind = 0;
    for (let seed = 1; seed < 40; seed++)
      behind += scatter(4, true, 0, 1, seeded(seed)).filter((s) => apart(s.az, 0) > 100).length;
    expect(behind).toBeGreaterThan(20);
  });

  it('«кто где» строится от того, куда ребёнок повёрнут сейчас', () => {
    const spots = around(false, 100, 1, seeded(3));
    const at = (p: string) => spots.find((s) => s.place === p)!;
    expect(spots.map((s) => s.place)).toEqual(['up', 'down', 'left', 'right']);
    // Смотрит на восток-юго-восток: справа — на юге, а не «справа от начала игры».
    expect(apart(at('right').az, 165)).toBeLessThan(0.01);
    expect(apart(at('left').az, 35)).toBeLessThan(0.01);
    expect(at('up').el).toBeGreaterThan(40);
    expect(at('down').el).toBeLessThan(-35);
    const v = aimed(100);
    const f = focalOf(412, 915);
    expect(project(v, spotDir(at('right')), f, 412, 915).x).toBeGreaterThan(206);
    expect(project(v, spotDir(at('left')), f, 412, 915).x).toBeLessThan(206);
    expect(new Set(spots.map((s) => s.animal)).size).toBe(4);
  });

  it('«сзади» — только когда можно прятаться за спиной', () => {
    expect(placesFor(false)).not.toContain('behind');
    expect(placesFor(true)).toContain('behind');
    const spot = around(true, 20, 1, seeded(1)).find((s) => s.place === 'behind')!;
    expect(apart(spot.az, 200)).toBeLessThan(0.01);
    for (let seed = 1; seed < 50; seed++)
      expect(nextPlace(false, undefined, 0, seeded(seed))).not.toBe('behind');
  });

  it('вопрос не повторяет прошлый и не про то, что уже перед глазами', () => {
    for (let seed = 1; seed < 100; seed++) {
      expect(nextPlace(false, 'left', 0, seeded(seed))).not.toBe('left');
      expect(nextPlace(false, undefined, 45, seeded(seed))).not.toBe('up');
      expect(nextPlace(false, undefined, -40, seeded(seed))).not.toBe('down');
    }
  });

  const spot = (over: Partial<Spot> = {}): Spot => ({
    id: 1,
    az: 0,
    el: 0,
    animal: 'bear',
    hide: 'bush',
    state: 'hidden',
    armed: true,
    at: 0,
    ...over,
  });

  it('в кружке — то укрытие, что ближе к середине', () => {
    const a = spot({ az: 6 });
    const b = spot({ id: 2, az: -3 });
    expect(aimedAt(aimed(0), [a, b])).toBe(b);
    expect(aimedAt(aimed(40), [a, b])).toBeUndefined();
    expect(aimedAt(aimed(AIM_DEG + 1), [spot()])).toBeUndefined();
  });

  it('открытое укрытие в кружке не считается', () => {
    expect(aimedAt(aimed(0), [spot({ state: 'found' })])).toBeUndefined();
    expect(aimedAt(aimed(0), [spot({ state: 'seen' })])).toBeUndefined();
  });

  it('укрытие прямо перед глазами срабатывает, только когда взгляд ушёл и вернулся', () => {
    const a = spot();
    const b = spot({ id: 2, az: 90 });
    disarm([a, b], aimed(0));
    expect(a.armed).toBe(false);
    expect(b.armed).toBe(true);
    expect(aimedAt(aimed(0), [a])).toBeUndefined();
    // Чуть дрогнула рука — это ещё не «ушёл».
    expect(aimedAt(aimed(AIM_DEG), [a])).toBeUndefined();
    expect(a.armed).toBe(false);
    expect(aimedAt(aimed(30), [a])).toBeUndefined();
    expect(a.armed).toBe(true);
    expect(aimedAt(aimed(0), [a])).toBe(a);
  });

  it('ближайшего ищем среди спрятанных', () => {
    const a = spot({ az: 5, state: 'found' });
    const b = spot({ id: 2, az: 90 });
    const c = spot({ id: 3, az: -40 });
    expect(nearest(aimed(0), [a, b, c])).toBe(c);
    expect(nearest(aimed(0), [a])).toBeUndefined();
  });

  it('нажатие: круг щедрее картинки, мимо не считается', () => {
    expect(tapped(100, 100, 100, 100, 100)).toBe(true);
    expect(tapped(160, 100, 100, 100, 100)).toBe(true);
    expect(tapped(170, 100, 100, 100, 100)).toBe(false);
  });
});

describe('голос и картинки', () => {
  it('у каждого зверёнка есть оба падежа, а картинка — в наборе', () => {
    for (const a of SEEK_ANIMALS) {
      expect(ANIMAL_NAMES[a]).toBeTruthy();
      expect(ANIMAL_WHOM[a]).toBeTruthy();
      expect(seekSprites()).toContain(`animal-${a}`);
    }
    for (const n of seekSprites())
      expect(
        existsSync(fileURLToPath(new URL(`../../public/games/${n}.webp`, import.meta.url))),
      ).toBe(true);
  });

  it('фразы складываются по-русски', () => {
    expect(seekWho('rabbit')).toBe('Найди зайку!');
    expect(seekWho('chick')).toBe('Найди цыплёнка!');
    expect(seekFound('frog')).toBe('Вот лягушонок!');
    expect(seekOther('turtle')).toBe('Это черепашка.');
    expect(seekWhere('up')).toBe('Кто прячется наверху?');
    expect(seekHere('right', 'bear')).toBe('Справа прячется мишка!');
    expect(seekHere('behind', 'rabbit')).toBe('Сзади прячется зайка!');
  });

  it('озвучиваем только то, что прозвучит в этой игре', () => {
    const first = seekPhrases(spec());
    expect(first).toContain('Найди всех зверят!');
    expect(first).toContain('Вот мышонок!');
    expect(first).not.toContain('Найди мышонка!');
    expect(first.some((t) => t.startsWith('Кто прячется'))).toBe(false);
    const all = seekPhrases(spec({ tasks: ['all', 'who', 'where'], wide: true }));
    expect(all).toContain('Найди мышонка!');
    expect(all).toContain('Это слонёнок.');
    expect(all).toContain('Кто прячется сзади?');
    expect(all).toContain('Слева прячется слонёнок!');
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('кадры камеры', () => {
  const source = (name: string) =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

  it('игра не читает кадр: ни рисования видео, ни выгрузки, ни записи', () => {
    const code = [source('./Seek.tsx'), source('./seekLogic.ts'), source('./gaze.ts')].join('\n');
    expect(code).not.toMatch(/drawImage\(\s*screen/);
    for (const banned of [
      'getImageData',
      'toDataURL',
      'toBlob',
      'convertToBlob',
      'MediaRecorder',
      'captureStream',
      'fetch(',
      'XMLHttpRequest',
      'sendBeacon',
      'localStorage',
      'indexedDB',
    ])
      expect(code).not.toContain(banned);
  });

  it('просит заднюю камеру без микрофона и выключает её при уходе', () => {
    const code = source('./Seek.tsx');
    expect(code).toContain("createCamera(screen, 'environment'");
    expect(code.match(/camera\.stop\(\)/g)!.length).toBeGreaterThanOrEqual(3);
    expect(source('./liveCamera.ts')).toContain('audio: false');
  });
});
