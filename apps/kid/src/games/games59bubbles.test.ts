// Этап 59: «Волшебные пузыри» — раунды, как рождаются и плывут пузыри, где на кадре взмах, камера
// включается и выключается когда надо, а кадры никуда не уходят.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameSpec, type GameSpec } from '@kidsplus/shared/games';
import { describe, expect, it } from 'vitest';
import {
  BUBBLES_ALL,
  BUBBLES_FINGER,
  BUBBLES_GO,
  bubblesColor,
  bubblesDigit,
  GAME_INTRO,
  gamePhrases,
} from '../phrases';
import type { SpecOf } from './common';
import {
  BUBBLE_COLORS,
  BUBBLE_DIGITS,
  bubblesSprites,
  charged,
  coverFit,
  drift,
  FRAME_LONG,
  frameSize,
  gapMs,
  gone,
  motionIn,
  motionOf,
  planRounds,
  POP_AT,
  radiusFor,
  sameFrame,
  SHAKEN,
  spawn,
  toGray,
  touched,
  type Bubble,
  type BubblesRound,
} from './bubblesLogic';
import { cameraState, createCamera, FROZEN_MS, type CameraHost } from './liveCamera';

const spec = (o: object) =>
  gameSpec.parse({ kind: 'bubbles', rounds: 4, ...o }) as SpecOf<'bubbles'>;
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('Раунды', () => {
  it('задания по очереди, цель пузырей у каждого раунда из спеки', () => {
    const rounds = planRounds(spec({ tasks: ['all', 'color', 'digit'], goal: 7 }), seeded(2));
    expect(rounds.map((r) => r.task)).toEqual(['all', 'color', 'digit', 'all']);
    expect(rounds.every((r) => r.goal === 7)).toBe(true);
    expect(rounds[0]).not.toHaveProperty('color');
    expect(BUBBLE_COLORS).toContain(rounds[1]!.color);
    expect(BUBBLE_DIGITS).toContain(rounds[2]!.digit);
  });

  it('цвет и цифра меняются от раунда к раунду', () => {
    const colors = planRounds(spec({ tasks: ['color'] }), seeded(3)).map((r) => r.color);
    expect(new Set(colors).size).toBe(4);
    const digits = planRounds(spec({ tasks: ['digit'] }), seeded(3)).map((r) => r.digit);
    expect(new Set(digits).size).toBe(4);
  });
});

describe('Пузыри', () => {
  const W = 412;
  const H = 915;
  const all: BubblesRound = { task: 'all', goal: 5 };
  const red: BubblesRound = { task: 'color', goal: 5, color: 'red' };
  const three: BubblesRound = { task: 'digit', goal: 5, digit: 3 };

  it('нужный пузырь всегда появится: нет его на экране — следующий нужный', () => {
    for (const round of [red, three])
      for (let seed = 1; seed < 200; seed++) {
        const rnd = seeded(seed);
        const others = [1, 2, 3].map((id) => ({ ...spawn(round, false, W, H, [], id, rnd) }));
        for (const b of others) b.target = false;
        expect(spawn(round, false, W, H, others, 9, rnd).target).toBe(true);
      }
  });

  it('задание совпадает с тем, что на пузыре', () => {
    const rnd = seeded(11);
    const live: Bubble[] = [];
    for (let i = 0; i < 400; i++) {
      const r = spawn(red, false, W, H, live, i, rnd);
      expect(r.target, 'красный — и только он нужный').toBe(r.color === 'red');
      const d = spawn(three, false, W, H, live, i, rnd);
      expect(d.target, 'тройка — и только она нужная').toBe(d.digit === 3);
      expect(spawn(all, false, W, H, live, i, rnd)).toMatchObject({
        target: true,
        digit: undefined,
      });
      if (i === 0) live.push(r, d);
    }
  });

  it('рождается внизу за экраном и целиком в ширину экрана', () => {
    const rnd = seeded(5);
    for (const [w, h] of [
      [412, 915],
      [915, 412],
      [320, 568],
    ] as const)
      for (let i = 0; i < 200; i++) {
        const b = spawn(all, false, w, h, [], i, rnd);
        expect(b.x0).toBeGreaterThanOrEqual(b.r);
        expect(b.x0).toBeLessThanOrEqual(w - b.r);
        expect(b.y).toBeGreaterThan(h);
      }
  });

  it('и пальцу, и взмаху есть куда попасть на самом маленьком экране', () => {
    expect(radiusFor(320, 568) * 2 * 0.9).toBeGreaterThan(60);
  });

  it('проплывает экран и уходит; быстрые — быстрее', () => {
    const time = (fast: boolean) => {
      const b = spawn(all, fast, W, H, [], 1, seeded(7));
      let t = 0;
      while (!gone(b) && t < 60) {
        drift(b, 1 / 60);
        t += 1 / 60;
      }
      return t;
    };
    expect(time(false)).toBeGreaterThan(6);
    expect(time(false)).toBeLessThan(10);
    expect(time(true)).toBeLessThan(time(false));
    expect(gapMs(true)).toBeLessThan(gapMs(false));
  });

  it('покачивается вокруг своей середины, а не уплывает вбок', () => {
    const b = spawn(all, false, W, H, [], 1, seeded(9));
    for (let i = 0; i < 300; i++) {
      drift(b, 1 / 60);
      expect(Math.abs(b.x - b.x0)).toBeLessThanOrEqual(b.sway);
    }
  });

  it('палец прощает чуть мимо, но не соседний пузырь', () => {
    const b = { ...spawn(all, false, W, H, [], 1, seeded(9)), x: 100, y: 100, r: 50 };
    expect(touched(b, 100, 100)).toBe(true);
    expect(touched(b, 155, 100)).toBe(true);
    expect(touched(b, 170, 100)).toBe(false);
  });
});

describe('Взмах', () => {
  const FW = 96;
  const FH = 72;
  /** Тёмная комната с едва заметным шумом камеры. */
  const room = (seed: number, noise = 6) => {
    const rnd = seeded(seed);
    return Uint8Array.from({ length: FW * FH }, () => 60 + Math.floor(rnd() * noise));
  };
  const withHand = (frame: Uint8Array, x: number, y: number, size = 14) => {
    const out = frame.slice();
    for (let j = y; j < y + size; j++) for (let i = x; i < x + size; i++) out[j * FW + i] = 210;
    return out;
  };
  /** Весь кадр виден без обрезки: экран тех же пропорций, в четыре раза больше. */
  const SW = FW * 4;
  const SH = FH * 4;
  const fit = coverFit(FW, FH, SW, SH);
  /** Пузырь там, где на зеркальном экране окажется точка кадра. */
  const over = (x: number, y: number, r = 32) => ({ x: SW - x * 4, y: y * 4, r });

  it('рука шевельнулась — движение ровно там, где она была и где стала', () => {
    const { mask, share } = motionOf(withHand(room(1), 20, 20), withHand(room(2), 60, 40), FW, FH);
    expect(share).toBeLessThan(SHAKEN);
    expect(motionIn(mask, FW, FH, fit, SW, over(27, 27))).toBeGreaterThan(POP_AT);
    expect(motionIn(mask, FW, FH, fit, SW, over(67, 47))).toBeGreaterThan(POP_AT);
    expect(motionIn(mask, FW, FH, fit, SW, over(85, 10))).toBe(0);
  });

  it('шум камеры — не движение', () => {
    const { mask } = motionOf(room(3, 20), room(4, 20), FW, FH);
    expect(mask.some(Boolean)).toBe(false);
  });

  it('одиночная вспышка в пикселе — не движение', () => {
    const cur = room(5);
    cur[30 * FW + 30] = 250;
    expect(motionOf(room(5), cur, FW, FH).mask.some(Boolean)).toBe(false);
  });

  it('камера подстроила яркость: меняется весь кадр, но рук в нём нет', () => {
    const before = room(6);
    const { mask, share } = motionOf(
      before,
      before.map((v) => v + 50),
      FW,
      FH,
    );
    expect(mask.some(Boolean)).toBe(false);
    expect(share).toBeGreaterThan(SHAKEN);
  });

  it('телефон трясут: кадр поехал целиком — такой кадр не считаем', () => {
    const rnd = seeded(7);
    const texture = Uint8Array.from({ length: FW * FH }, () => Math.floor(rnd() * 255));
    const moved = texture.map((_, i) => texture[(i + 6) % (FW * FH)]!);
    expect(motionOf(texture, moved, FW, FH).share).toBeGreaterThan(SHAKEN);
  });

  it('большая рука у самой камеры — всё ещё взмах, а не тряска', () => {
    const before = withHand(room(8), 4, 4, 36);
    const after = withHand(room(9), 44, 28, 36);
    const { mask, share } = motionOf(before, after, FW, FH);
    expect(share).toBeLessThan(SHAKEN);
    expect(motionIn(mask, FW, FH, fit, SW, over(60, 45))).toBeGreaterThan(POP_AT);
  });

  it('передняя камера — зеркало: левый край кадра на экране справа', () => {
    const { mask } = motionOf(room(1), withHand(room(2), 10, 30), FW, FH);
    const right = { x: SW - 17 * 4, y: 37 * 4, r: 28 };
    const left = { x: 17 * 4, y: 37 * 4, r: 28 };
    expect(motionIn(mask, FW, FH, fit, SW, right)).toBeGreaterThan(POP_AT);
    expect(motionIn(mask, FW, FH, fit, SW, left)).toBe(0);
    // Задняя камера — без зеркала.
    expect(motionIn(mask, FW, FH, fit, SW, left, false)).toBeGreaterThan(POP_AT);
  });

  it('кадр шире экрана: обрезанные края на экран не попадают', () => {
    // Телефон стоит вертикально, камера снимает 4:3 лёжа: видна только середина кадра.
    const tall = coverFit(FW, FH, 412, 915);
    expect(tall.k).toBeCloseTo(915 / FH);
    expect(tall.oy).toBeCloseTo(0);
    expect(tall.ox).toBeLessThan(0);
    const { mask } = motionOf(room(1), withHand(room(2), 41, 29), FW, FH);
    const middle = { x: 412 / 2, y: 915 / 2, r: 53 };
    expect(motionIn(mask, FW, FH, tall, 412, middle)).toBeGreaterThan(POP_AT);
    const corner = { x: 40, y: 40, r: 53 };
    expect(motionIn(mask, FW, FH, tall, 412, corner)).toBe(0);
  });

  it('пузырь за краем кадра не ломает подсчёт', () => {
    const { mask } = motionOf(room(1), room(2), FW, FH);
    expect(motionIn(mask, FW, FH, fit, SW, { x: -500, y: -500, r: 30 })).toBe(0);
  });

  it('взмах заряжает за пару кадров, редкая соринка — никогда', () => {
    let charge = 0;
    for (let i = 0; i < 300; i++) charge = charged(charge, 0.1);
    expect(charge).toBeLessThan(POP_AT);
    expect(charged(charged(0, 0.25), 0.25)).toBeGreaterThan(POP_AT);
    expect(charged(0, 0.5)).toBeGreaterThan(POP_AT);
  });

  it('заряд гаснет, если рука ушла', () => {
    let charge = 0.3;
    for (let i = 0; i < 10; i++) charge = charged(charge, 0);
    expect(charge).toBeLessThan(0.01);
  });

  it('кадр уменьшается с теми же пропорциями', () => {
    expect(frameSize(640, 480)).toEqual({ w: FRAME_LONG, h: 72 });
    expect(frameSize(480, 640)).toEqual({ w: 72, h: FRAME_LONG });
    expect(frameSize(1920, 1080)).toEqual({ w: FRAME_LONG, h: 54 });
  });

  it('в серый: зелёный ярче синего, одинаковые кадры узнаются', () => {
    const out = new Uint8Array(3);
    toGray([255, 255, 255, 255, 0, 255, 0, 255, 0, 0, 255, 255], out);
    expect(out[0]).toBeGreaterThan(250);
    expect(out[1]).toBeGreaterThan(out[2]!);
    expect(sameFrame(out, out.slice())).toBe(true);
    const other = out.slice();
    other[2]!++;
    expect(sameFrame(out, other)).toBe(false);
  });
});

describe('Камера', () => {
  class FakeTrack {
    stopped = false;
    stop() {
      this.stopped = true;
    }
  }
  const stream = () => {
    const track = new FakeTrack();
    return { track, getTracks: () => [track] } as unknown as MediaStream & { track: FakeTrack };
  };
  const setup = (hidden = false) => {
    const asks: { constraints: MediaStreamConstraints; give: (s: MediaStream) => void }[] = [];
    const refusals: ((e: Error) => void)[] = [];
    const listeners = new Set<() => void>();
    const doc = {
      hidden,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    const host = {
      doc,
      media: {
        getUserMedia: (constraints: MediaStreamConstraints) =>
          new Promise<MediaStream>((give, refuse) => {
            asks.push({ constraints, give });
            refusals.push(refuse);
          }),
      },
    } as unknown as CameraHost;
    const video = { srcObject: null as MediaStream | null, play: () => Promise.resolve() };
    const answers: boolean[] = [];
    const camera = createCamera(video as never, 'user', host, (a) => answers.push(a));
    const flip = (to: boolean) => {
      doc.hidden = to;
      for (const fn of [...listeners]) fn();
    };
    return { asks, refusals, listeners, video, answers, camera, flip, host };
  };
  const tick = () => new Promise<void>((done) => setTimeout(done));

  it('просит только видео и нужной камеры, звук не трогает', () => {
    const t = setup();
    t.camera.start();
    expect(t.asks).toHaveLength(1);
    const c = t.asks[0]!.constraints;
    expect(c.audio).toBe(false);
    expect(c.video).toMatchObject({ facingMode: 'user' });
  });

  it('поток приходит на экран, игра узнаёт об этом', async () => {
    const t = setup();
    t.camera.start();
    const s = stream();
    t.asks[0]!.give(s);
    await tick();
    expect(t.video.srcObject).toBe(s);
    expect(t.answers).toEqual([true]);
  });

  it('выход из игры выключает камеру и снимает картинку', async () => {
    const t = setup();
    t.camera.start();
    const s = stream();
    t.asks[0]!.give(s);
    await tick();
    t.camera.stop();
    expect(s.track.stopped).toBe(true);
    expect(t.video.srcObject).toBeNull();
    expect(t.listeners.size).toBe(0);
  });

  it('поток, пришедший к закрытой игре, сразу гасится', async () => {
    const t = setup();
    t.camera.start();
    t.camera.stop();
    const s = stream();
    t.asks[0]!.give(s);
    await tick();
    expect(s.track.stopped).toBe(true);
    expect(t.video.srcObject).toBeNull();
    expect(t.answers).toEqual([]);
  });

  it('погасший экран останавливает камеру, вернулись — включается заново', async () => {
    const t = setup();
    t.camera.start();
    const first = stream();
    t.asks[0]!.give(first);
    await tick();
    t.flip(true);
    expect(first.track.stopped).toBe(true);
    expect(t.video.srcObject).toBeNull();
    t.flip(false);
    expect(t.asks).toHaveLength(2);
    const second = stream();
    t.asks[1]!.give(second);
    await tick();
    expect(t.video.srcObject).toBe(second);
    expect(second.track.stopped).toBe(false);
  });

  it('поток, пришедший на погасший экран, не включается', async () => {
    const t = setup();
    t.camera.start();
    t.flip(true);
    const s = stream();
    t.asks[0]!.give(s);
    await tick();
    expect(s.track.stopped).toBe(true);
    expect(t.video.srcObject).toBeNull();
  });

  it('игра открыта на погашенном экране: камера ждёт, пока экран зажгут', () => {
    const t = setup(true);
    t.camera.start();
    expect(t.asks).toHaveLength(0);
    t.flip(false);
    expect(t.asks).toHaveLength(1);
  });

  it('после выхода экран камеру не будит', () => {
    const t = setup();
    t.camera.start();
    t.camera.stop();
    t.flip(true);
    t.flip(false);
    expect(t.asks).toHaveLength(1);
  });

  it('отказ — игра узнаёт и играет пальцем', async () => {
    const t = setup();
    t.camera.start();
    t.refusals[0]!(new Error('NotAllowedError'));
    await tick();
    expect(t.answers).toEqual([false]);
  });

  it('камеры нет совсем — тоже палец', () => {
    const answers: boolean[] = [];
    const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
    const video = { srcObject: null, play: () => Promise.resolve() };
    createCamera(video as never, 'user', { doc } as unknown as CameraHost, (a) =>
      answers.push(a),
    ).start();
    expect(answers).toEqual([false]);
  });

  it('состояние: ждём ответа, кадры идут, кадры замёрзли', () => {
    expect(cameraState(null, 60000, null, 0), 'спрашивает разрешение').toBe('wait');
    expect(cameraState(false, 0, null, 0), 'отказ').toBe('off');
    expect(cameraState(true, 1000, null, 0), 'первый кадр в пути').toBe('wait');
    expect(cameraState(true, FROZEN_MS + 1, null, 0), 'кадр так и не пришёл').toBe('off');
    expect(cameraState(true, 5000, 4500, 0), 'кадры идут').toBe('on');
    expect(cameraState(true, 5000 + FROZEN_MS, 4500, 0), 'камера зависла').toBe('off');
  });
});

describe('Кадры остаются в телефоне', () => {
  const FILES = ['Bubbles.tsx', 'bubblesLogic.ts', 'liveCamera.ts'];
  const source = (name: string) =>
    readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

  it.each(FILES)('%s не умеет ни сохранить кадр, ни отправить его', (name) => {
    expect(source(name)).not.toMatch(
      /fetch|XMLHttpRequest|sendBeacon|WebSocket|kidApi|toDataURL|toBlob|convertToBlob|MediaRecorder|localStorage|sessionStorage|indexedDB|caches\.|createObjectURL/,
    );
  });

  it('видео не просит звук и живёт только в этом экране', () => {
    expect(source('liveCamera.ts')).toMatch(/audio: false/);
    expect(source('Bubbles.tsx')).toMatch(/camera\.stop\(\);\s+cur\.fill\(0\);/);
  });
});

describe('Фразы и картинки', () => {
  it('в подготовке все фразы заданий и нет лишних', () => {
    expect(GAME_INTRO.bubbles).toBe(BUBBLES_GO);
    const plain = gamePhrases(spec({ tasks: ['all'] }) as GameSpec);
    expect(plain).toEqual(expect.arrayContaining([BUBBLES_GO, BUBBLES_FINGER, BUBBLES_ALL]));
    expect(plain).not.toContain(bubblesColor('red'));
    const full = gamePhrases(spec({ tasks: ['all', 'color', 'digit'] }) as GameSpec);
    for (const c of BUBBLE_COLORS) expect(full).toContain(bubblesColor(c));
    for (const d of BUBBLE_DIGITS) expect(full).toContain(bubblesDigit(d));
  });

  it('цифры и цвета звучат словами', () => {
    expect(bubblesColor('yellow')).toBe('Лопай только жёлтые пузыри!');
    expect(bubblesDigit(3)).toBe('Лопай пузыри с цифрой три!');
  });

  it('картинки на месте', () => {
    for (const name of bubblesSprites())
      expect(
        existsSync(fileURLToPath(new URL(`../../public/games/${name}.webp`, import.meta.url))),
        name,
      ).toBe(true);
  });
});
