// Этап 59: «Катись, шарик» — наклон телефона, проходимость дощечек на всех экранах, физика,
// автопилот от старта до цели, раунды, раскладка, фразы.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import { GAME_INTRO, gamePhrases, MARBLE_GO, MARBLE_PIT, marbleWord } from '../phrases';
import type { SpecOf } from './common';
import {
  aimFrom,
  BALL_R,
  BOARD_W,
  flowTo,
  fingerWish,
  free,
  fromPx,
  heightFor,
  inHole,
  inPit,
  makeBoard,
  marbleSprites,
  MARBLE_WORDS,
  onToken,
  pathFrom,
  PIT_R,
  planRounds,
  pull,
  roll,
  slotsFor,
  toBoard,
  toPx,
  toView,
  viewFor,
  WALL_R,
  type Ball,
  type Board,
  type MarbleRound,
  type P,
} from './marbleLogic';
import {
  calmed,
  createTilt,
  DEAD,
  FULL_DEG,
  gravityOf,
  LOST_MS,
  onScreen,
  STILL_MS,
  steerBy,
  tiltFrom,
} from './tilt';

const spec = (o: object) => gameSpec.parse({ kind: 'marble', rounds: 4, ...o }) as SpecOf<'marble'>;
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SCREENS = [
  [412, 915],
  [915, 412],
  [393, 659],
  [320, 568],
  [360, 640],
  [640, 360],
  [393, 852],
  [852, 393],
  [768, 1024],
  [1024, 768],
] as const;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

/** Все сочетания заданий и препятствий одной дощечки. */
const ROUNDS: MarbleRound[] = [0, 1, 2, 3, 4].flatMap((walls) =>
  [false, true].flatMap((pits) =>
    [false, true].flatMap((flip) => [
      { task: 'hole' as const, walls, pits, flip, labels: [] },
      { task: 'count' as const, walls, pits, flip, labels: ['1', '2', '3', '4', '5'] },
      { task: 'word' as const, walls, pits, flip, labels: ['К', 'О', 'Т'], word: 'кот' },
    ]),
  ),
);

describe('куда катить', () => {
  it('у стенки и у ямки цель впереди, а не под самим шариком', () => {
    const rounds = ROUNDS.filter((r) => r.task === 'hole' && (r.walls > 0 || r.pits));
    let checked = 0;
    for (const [i, r] of rounds.entries()) {
      const rnd = seeded(i * 101 + 7);
      const b = makeBoard(r, 17, rnd);
      const flow = flowTo(b, b.goal!);
      for (let k = 0; k < 1500; k++) {
        const at = { x: rnd() * b.w, y: rnd() * b.h };
        if (free(b, at) || pathFrom(flow, at).length < 5) continue;
        checked++;
        expect(dist(aimFrom(b, flow, at), at)).toBeGreaterThan(0.15);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('Наклон', () => {
  const flat = gravityOf(0, 0);

  it('лёжа экраном вверх тяжесть уходит в экран', () => {
    near(flat[0], 0);
    near(flat[1], 0);
    near(flat[2], -1);
  });

  it('шарик катится к опущенному краю', () => {
    // Правый край ниже — вправо; верхний край выше — вниз.
    expect(tiltFrom(gravityOf(0, 12), flat).x).toBeGreaterThan(0.4);
    expect(tiltFrom(gravityOf(0, -12), flat).x).toBeLessThan(-0.4);
    expect(tiltFrom(gravityOf(12, 0), flat).y).toBeGreaterThan(0.4);
    expect(tiltFrom(gravityOf(-12, 0), flat).y).toBeLessThan(-0.4);
  });

  it('считается от того, как держат: в руках под углом чувствуется как на столе', () => {
    const held = gravityOf(40, 0);
    const still = tiltFrom(held, held);
    near(still.x, 0);
    near(still.y, 0);
    expect(tiltFrom(gravityOf(52, 0), held).y).toBeGreaterThan(0.4);
    expect(tiltFrom(gravityOf(28, 0), held).y).toBeLessThan(-0.4);
    const right = tiltFrom(gravityOf(40, 15), held);
    expect(right.x).toBeGreaterThan(0.25);
    expect(Math.abs(right.y)).toBeLessThan(0.2);
  });

  it('телефон стоит вертикально или боком — оси не ломаются', () => {
    const up = gravityOf(90, 0);
    const tip = tiltFrom(gravityOf(75, 0), up);
    expect(tip.y).toBeLessThan(-0.4);
    expect(Number.isFinite(tip.x)).toBe(true);
    const side = gravityOf(0, 90);
    const a = tiltFrom(gravityOf(0, 75), side);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(0.4);
    // Рядом с «боком» те же оси, что и точно боком: шарик не перескакивает.
    const b = tiltFrom(gravityOf(0, 74), gravityOf(0, 89));
    expect(Math.sign(a.x)).toBe(Math.sign(b.x));
  });

  it('полный наклон — единица, больше не бывает', () => {
    const flatTilt = (deg: number) =>
      Math.hypot(...Object.values(tiltFrom(gravityOf(deg, 0), flat)));
    near(flatTilt(FULL_DEG), 1);
    near(flatTilt(70), 1);
    expect(flatTilt(FULL_DEG / 2)).toBeLessThan(0.6);
  });

  it('дрожание рук шарик не двигает, дальше — плавно', () => {
    expect(calmed({ x: DEAD * 0.9, y: 0 })).toEqual({ x: 0, y: 0 });
    near(calmed({ x: 1, y: 0 }).x, 1);
    const small = calmed({ x: DEAD * 1.2, y: 0 }).x;
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(0.05);
  });

  it('повёрнутый экран: наклон остаётся в сторону опущенного края', () => {
    const t = { x: 0.3, y: 0.7 };
    expect(onScreen(t, 0)).toEqual(t);
    expect(onScreen(t, 90)).toEqual({ x: 0.7, y: -0.3 });
    expect(onScreen(t, 180)).toEqual({ x: -0.3, y: -0.7 });
    expect(onScreen(t, 270)).toEqual({ x: -0.7, y: 0.3 });
    expect(onScreen(t, -90)).toEqual(onScreen(t, 270));
    expect(onScreen(onScreen(t, 90), 270)).toEqual(t);
  });

  it('датчик молчит или телефон лежит — управляем пальцем', () => {
    const started = { startedAt: 100, lastAt: -Infinity, movedAt: -Infinity };
    expect(steerBy(100 + LOST_MS - 1, started)).toBe('tilt');
    expect(steerBy(100 + LOST_MS + 1, started)).toBe('finger');
    const live = { startedAt: 100, lastAt: 200, movedAt: 200 };
    expect(steerBy(200 + STILL_MS - 1, live)).toBe('tilt');
    expect(steerBy(200 + STILL_MS + 1, live)).toBe('finger');
    // Неподвижный телефон событий не шлёт, но пока недолго — не «потерян».
    expect(steerBy(200 + LOST_MS * 2, live)).toBe('tilt');
    expect(steerBy(9000, { ...live, lastAt: 8990, movedAt: 8900 })).toBe('tilt');
  });

  describe('датчик', () => {
    const fake = () => {
      const on = new Set<(e: Event) => void>();
      return {
        on,
        addEventListener: (_: string, fn: (e: Event) => void) => on.add(fn),
        removeEventListener: (_: string, fn: (e: Event) => void) => on.delete(fn),
        fire(beta: number | null, gamma: number | null) {
          for (const fn of on) fn({ beta, gamma } as unknown as Event);
        },
      };
    };
    const make = () => {
      const source = fake();
      let now = 0;
      const tilt = createTilt(source as unknown as Window, () => now);
      return { source, tilt, go: (ms: number) => (now += ms) };
    };

    it('считает от первого положения, а center задаёт новый ноль', () => {
      const { source, tilt } = make();
      tilt.start();
      expect(tilt.read()).toEqual({ x: 0, y: 0 });
      source.fire(30, 0);
      expect(tilt.read()).toEqual({ x: 0, y: 0 });
      for (let i = 0; i < 30; i++) source.fire(30, 14);
      expect(tilt.read().x).toBeGreaterThan(0.4);
      tilt.center();
      near(tilt.read().x, 0);
    });

    it('центровка до первого события не ломает отсчёт', () => {
      const { source, tilt } = make();
      tilt.start();
      tilt.center();
      source.fire(25, 3);
      expect(tilt.read()).toEqual({ x: 0, y: 0 });
    });

    it('пустые значения датчика — как будто его нет', () => {
      const { source, tilt, go } = make();
      tilt.start();
      source.fire(null, null);
      go(LOST_MS + 1);
      expect(tilt.steer()).toBe('finger');
    });

    it('лежит на столе → палец, взяли в руки → снова наклон', () => {
      const { source, tilt, go } = make();
      tilt.start();
      source.fire(1, 0);
      go(STILL_MS + 1);
      source.fire(1, 0.05);
      expect(tilt.steer()).toBe('finger');
      for (let i = 0; i < 5; i++) source.fire(9, 6);
      expect(tilt.steer()).toBe('tilt');
    });

    it('stop снимает подписку', () => {
      const { source, tilt } = make();
      tilt.start();
      expect(source.on.size).toBe(1);
      tilt.stop();
      expect(source.on.size).toBe(0);
    });
  });
});

describe('Дощечка', () => {
  const targets = (b: Board) => [...b.tokens.map((t) => t.at), ...(b.goal ? [b.goal] : [])];

  it('на любом экране проходима, и ничто не лежит друг на друге', () => {
    for (const [w, h] of SCREENS)
      for (const r of ROUNDS)
        for (let seed = 1; seed <= 3; seed++) {
          const b = makeBoard(r, heightFor(w, h), seeded(seed * 7919 + w));
          const name = `${w}×${h} ${r.task} ${r.walls} ${r.pits} ${seed}`;
          expect(b.tokens.length, name).toBe(r.labels.length);
          expect(!!b.goal, name).toBe(r.task === 'hole');
          const items = [b.start, ...targets(b)];
          for (const p of b.pits)
            for (const it of items) expect(dist(p, it), name).toBeGreaterThan(2);
          for (let i = 0; i < items.length; i++)
            for (let k = i + 1; k < items.length; k++)
              expect(dist(items[i]!, items[k]!), name).toBeGreaterThan(1.7);
          // От старта — к каждой цели по очереди.
          let from = b.start;
          for (const t of targets(b)) {
            expect(pathFrom(flowTo(b, t), from).length, name).toBeGreaterThan(0);
            from = t;
          }
        }
  });

  it('ямки есть, когда попросили; перегородки — сколько задано', () => {
    const r = ROUNDS.find((x) => x.task === 'hole' && x.walls === 2 && x.pits)!;
    const b = makeBoard(r, 18, seeded(5));
    expect(b.pits.length).toBeGreaterThan(0);
    expect(b.walls.length).toBe(2);
    const none = makeBoard({ ...r, pits: false }, 18, seeded(5));
    expect(none.pits).toEqual([]);
  });

  it('flip меняет местами верх и низ: старт и цель не копят наклон', () => {
    const r: MarbleRound = { task: 'hole', walls: 0, pits: false, flip: false, labels: [] };
    const down = makeBoard(r, 18, seeded(3));
    const up = makeBoard({ ...r, flip: true }, 18, seeded(3));
    expect(down.goal!.y).toBeGreaterThan(down.start.y);
    expect(up.goal!.y).toBeLessThan(up.start.y);
  });
});

describe('Шарик', () => {
  const still = (x: number, y: number): Ball => ({ x, y, vx: 0, vy: 0 });
  const box = { w: BOARD_W, h: 14, walls: [] };

  it('катится туда, куда наклонили, и не быстрее предела', () => {
    const ball = still(4, 7);
    for (let i = 0; i < 30; i++) roll(ball, { x: 1, y: 0 }, 1 / 60, box);
    expect(ball.x).toBeGreaterThan(4.5);
    near(ball.y, 7);
    for (let i = 0; i < 600; i++) roll(ball, { x: 0, y: 1 }, 1 / 60, { ...box, h: 1e4 });
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThanOrEqual(8.0001);
  });

  it('без наклона останавливается', () => {
    const ball = { ...still(4, 7), vx: 5 };
    for (let i = 0; i < 400; i++) roll(ball, { x: 0, y: 0 }, 1 / 60, box);
    expect(Math.abs(ball.vx)).toBeLessThan(0.02);
  });

  it('не вылетает за край и отдаёт силу удара', () => {
    const ball = { ...still(BOARD_W - 0.6, 7), vx: 6 };
    let hit = 0;
    for (let i = 0; i < 5; i++) hit = Math.max(hit, roll(ball, { x: 1, y: 0 }, 1 / 60, box));
    expect(hit).toBeGreaterThan(4);
    expect(ball.x).toBeLessThanOrEqual(BOARD_W - BALL_R);
  });

  it('не проскакивает перегородку даже при редких кадрах и на полной скорости', () => {
    const wall = { a: { x: 0, y: 7 }, b: { x: BOARD_W, y: 7 } };
    for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
      const ball = { ...still(4, 3), vy: 8 };
      for (let i = 0; i < 300; i++) roll(ball, { x: 0, y: 1 }, dt, { ...box, walls: [wall] });
      expect(ball.y).toBeLessThanOrEqual(7 - WALL_R - BALL_R + 1e-6);
    }
  });

  it('лунка подтягивает шарик и ловит его, ямка ловит только по центру', () => {
    const goal = { x: 4, y: 7 };
    const ball = still(4.9, 7);
    for (let i = 0; i < 120 && !inHole(ball, goal); i++) {
      pull(ball, goal, 1 / 60);
      roll(ball, { x: 0, y: 0 }, 1 / 60, box);
    }
    expect(inHole(ball, goal)).toBe(true);
    expect(inPit({ x: 4 + PIT_R, y: 7 }, goal)).toBe(false);
    expect(inPit({ x: 4 + PIT_R * 0.5, y: 7 }, goal)).toBe(true);
  });

  it('палец ведёт шарик и не даёт ему промахнуться мимо', () => {
    const ball = still(1, 1);
    const finger = { x: 6, y: 9 };
    for (let i = 0; i < 300; i++) roll(ball, fingerWish(ball, finger), 1 / 60, box);
    expect(dist(ball, finger)).toBeLessThan(0.5);
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThan(0.8);
  });

  it('автопилот: на любой дощечке от старта до цели, в обход ямок', () => {
    for (const [w, h] of [SCREENS[0], SCREENS[1], SCREENS[3]])
      for (const r of ROUNDS) {
        const b = makeBoard(r, heightFor(w, h), seeded(r.walls * 31 + w));
        const ball = still(b.start.x, b.start.y);
        const todo = b.tokens.map((t) => t);
        let flow = flowTo(b, todo[0]?.at ?? b.goal!);
        let time = 0;
        let done = false;
        for (; time < 120 && !done; time += 1 / 60) {
          roll(ball, fingerWish(ball, aimFrom(b, flow, ball)), 1 / 60, b);
          if (b.goal) pull(ball, b.goal, 1 / 60);
          const name = `${w}×${h} ${r.task} ${r.walls} ${r.pits} ${r.flip}`;
          expect(
            b.pits.some((p) => inPit(ball, p)),
            name,
          ).toBe(false);
          if (b.goal && inHole(ball, b.goal)) done = true;
          if (todo[0] && onToken(ball, todo[0])) {
            todo.shift();
            if (todo[0]) flow = flowTo(b, todo[0].at);
            else done = true;
          }
        }
        expect(done, `${w}×${h} ${r.task} ${r.walls} ${r.pits} ${r.flip}`).toBe(true);
      }
  });
});

describe('Раунды', () => {
  it('задания по очереди, старт чередуется сверху и снизу', () => {
    const rounds = planRounds(spec({ tasks: ['hole', 'count'], rounds: 4 }), seeded(2));
    expect(rounds.map((r) => r.task)).toEqual(['hole', 'count', 'hole', 'count']);
    expect(rounds.map((r) => r.flip)).toEqual([false, true, false, true]);
  });

  it('числа — по порядку, с перегородками их больше', () => {
    const few = planRounds(spec({ tasks: ['count'], walls: 0 }), seeded(2))[0]!;
    const many = planRounds(spec({ tasks: ['count'], walls: 4 }), seeded(2))[0]!;
    expect(few.labels).toEqual(['1', '2', '3']);
    expect(many.labels).toEqual(['1', '2', '3', '4', '5']);
  });

  it('слова не повторяются, буквы в них разные', () => {
    const rounds = planRounds(spec({ tasks: ['word'], rounds: 6 }), seeded(4));
    const words = rounds.map((r) => r.word!);
    expect(new Set(words).size).toBe(6);
    for (const r of rounds) expect(r.labels.join('').toLowerCase()).toBe(r.word);
    for (const w of MARBLE_WORDS) expect(new Set(w).size).toBe(w.length);
  });
});

describe('Экран', () => {
  it('дощечка на экране, мимо кнопок в углах; точки переводятся туда и обратно', () => {
    for (const [w, h] of SCREENS) {
      const bh = heightFor(w, h);
      const v = viewFor(w, h, bh);
      const f = v.floor;
      expect(f.x - v.rim).toBeGreaterThanOrEqual(0);
      expect(f.y - v.rim).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w + v.rim).toBeLessThanOrEqual(w + 0.01);
      expect(f.y + f.h + v.rim).toBeLessThanOrEqual(h + 0.01);
      // Кнопки — квадраты 16…88 в верхних углах.
      if (v.land) {
        expect(f.x - v.rim).toBeGreaterThanOrEqual(88);
        expect(f.x + f.w + v.rim).toBeLessThanOrEqual(w - 88);
      } else expect(f.y - v.rim).toBeGreaterThanOrEqual(88);
      // Шарик на таком экране виден и пальцу есть за что взяться.
      expect(v.cell).toBeGreaterThan(20);
      const p = { x: 2.5, y: bh - 3 };
      const back = fromPx(v, toPx(v, p));
      near(back.x, p.x);
      near(back.y, p.y);
      for (const c of [
        { x: 0, y: 0 },
        { x: BOARD_W, y: bh },
      ]) {
        const px = toPx(v, c);
        expect(px.x).toBeGreaterThanOrEqual(f.x - 0.01);
        expect(px.x).toBeLessThanOrEqual(f.x + f.w + 0.01);
        expect(px.y).toBeGreaterThanOrEqual(f.y - 0.01);
        expect(px.y).toBeLessThanOrEqual(f.y + f.h + 0.01);
      }
    }
  });

  it('наклон вправо по экрану катит шарик вправо по экрану и лёжа', () => {
    for (const [w, h] of [SCREENS[0], SCREENS[1]]) {
      const v = viewFor(w, h, heightFor(w, h));
      for (const t of [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]) {
        const wish = toBoard(v, t);
        const a = toPx(v, { x: 4, y: 7 });
        const b = toPx(v, { x: 4 + wish.x, y: 7 + wish.y });
        near(Math.sign(b.x - a.x), Math.sign(t.x));
        near(Math.sign(b.y - a.y), Math.sign(t.y));
        expect(toView(v, wish)).toEqual(t);
      }
    }
  });

  it('ряд собранного не заходит на кнопки и за край', () => {
    for (const [w, h] of SCREENS)
      for (const n of [3, 5]) {
        const slots = slotsFor(w, h, n);
        expect(slots.length).toBe(n);
        for (const s of slots) {
          expect(s.size).toBeGreaterThan(20);
          expect(s.x + s.size / 2).toBeLessThanOrEqual(w);
          expect(s.y + s.size / 2).toBeLessThanOrEqual(h);
          if (w > h) expect(s.y - s.size / 2).toBeGreaterThanOrEqual(88);
          else {
            expect(s.x - s.size / 2).toBeGreaterThanOrEqual(88);
            expect(s.x + s.size / 2).toBeLessThanOrEqual(w - 88);
          }
        }
      }
  });
});

describe('Фразы и картинки', () => {
  it('озвучка знает всё, что игра скажет', () => {
    expect(GAME_INTRO.marble).toBe(MARBLE_GO);
    const all = gamePhrases(spec({ tasks: ['hole', 'word'], pits: true, rounds: 3 }) as GameSpec);
    expect(all).toContain(MARBLE_PIT);
    for (const w of MARBLE_WORDS) expect(all).toContain(marbleWord(w));
    const plain = gamePhrases(spec({ tasks: ['hole'] }) as GameSpec);
    expect(plain).not.toContain(MARBLE_PIT);
  });

  it('все картинки на месте', () => {
    for (const name of marbleSprites())
      expect(
        existsSync(fileURLToPath(new URL(`../../public/games/${name}.webp`, import.meta.url))),
        name,
      ).toBe(true);
  });
});
