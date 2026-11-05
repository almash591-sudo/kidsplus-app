// «Прятки в комнате» (этап 59). Задняя камера показывает комнату, вокруг ребёнка спрятались глиняные
// зверята: он поворачивается вместе с телефоном и наводит кружок на укрытие. Кадр здесь не читается
// ни разу: картинку показывает только <video>, а зверят по экрану двигает датчик поворота. Нет
// камеры — вместо неё нарисованная комната, нет датчика — эту комнату двигают пальцем.
import { useEffect, useRef, useState } from 'react';
import { fx } from '../fx';
import { setKeepAwake } from '../kiosk';
import {
  BUBBLES_ASK,
  SEEK_ALL,
  SEEK_ASK,
  SEEK_END,
  SEEK_FINGER,
  SEEK_GO,
  SEEK_TURN,
  SEEK_WIN,
  seekFound,
  seekHere,
  seekOther,
  seekWhere,
  seekWho,
} from '../phrases';
import { afterSpeech, bump, clayUrl, praise, say, setTask, type GameProps } from './common';
import {
  arrowTo,
  createGaze,
  fingerView,
  focalOf,
  headingOf,
  pitchOf,
  project,
  turned,
  type View,
} from './gaze';
import { cameraState, createCamera, type CameraState } from './liveCamera';
import {
  aimedAt,
  around,
  disarm,
  DWELL_MS,
  nearest,
  nextPlace,
  planRounds,
  scatter,
  seekSprites,
  shuffled,
  spotDir,
  spotSize,
  tapped,
  type SeekPlace,
  type Spot,
} from './seekLogic';
import { askMotion, screenAngle, type Steer } from './tilt';

type Phase = 'ask' | 'wait' | 'play' | 'done' | 'finish';

const TAU = Math.PI * 2;
const COLORS = ['#ff7a6b', '#57b4ff', '#6fdc6a', '#ffd23f', '#c58cff'];
/** Цвета над и под нарисованной комнатой: потолок и пол продолжаются за картинку. */
const CEILING = '#e6c9b7';
const FLOOR = '#e8984e';
/** Телефон спрашивает про камеру: столько мс молчим, потом зовём взрослого. */
const ASK_AFTER = 1500;
/** Камера всё не отвечает — начинаем с нарисованной комнатой, появится — перейдём на неё. */
const WAIT_MS = 15000;
/** Не тот зверёнок показывается столько мс и прячется обратно. */
const SEEN_MS = 1500;
/** Стрелка появляется через столько мс без находки: в первом раунде сразу, потом ждём. */
const ARROW_FIRST = 1500;
const ARROW_AFTER = 7000;
/** Нажал не туда: напоминаем вопрос не чаще, чем раз в столько мс. */
const TOLD_MS = 4000;
/** Палец сдвинулся меньше — это нажатие, а не перетаскивание. */
const TAP_PX = 14;
/** Пальцем выше и ниже этого смотреть незачем. */
const PITCH_MAX = 55;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  color: string;
  kind: 'star' | 'confetti';
  rot: number;
}

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

export function Seek({ spec, phrases, onFinish }: GameProps<'seek'>) {
  const [rounds] = useState(() => planRounds(spec));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('wait');
  const [steer, setSteer] = useState<Steer>('tilt');
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const hintTo = useRef<HTMLDivElement>(null);
  const press = useRef<() => void>(() => {});

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const screen = video.current!;
    const ctx = cv.getContext('2d')!;
    const img = new Map<string, HTMLImageElement>();
    for (const name of seekSprites()) {
      const i = new Image();
      i.src = clayUrl(name);
      img.set(name, i);
    }
    const ok = (name: string) => {
      const i = img.get(name);
      return i && i.complete && i.naturalWidth > 0 ? i : undefined;
    };

    let w = 0;
    let h = 0;
    let f = 1;
    let dpr = 1;
    const measure = () => {
      const box = el.getBoundingClientRect();
      w = box.width || window.innerWidth;
      h = box.height || window.innerHeight;
      f = focalOf(w, h);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const webdriver = navigator.webdriver;
    /** Часы игры, мс: идут только с кадрами — погашенный экран ставит игру на паузу. */
    let clock = 0;
    const s = {
      k: 0,
      R: rounds[0]!,
      phase: 'wait' as Phase,
      launched: false,
      launchedAt: 0,
      steer: 'tilt' as Steer,
      /** Камера включена: нужна только тем, кто поворачивается с телефоном. */
      filming: false,
      camera: 'wait' as CameraState,
      /** Что ответила камера; null — ещё думает или телефон спрашивает разрешение. */
      answer: null as boolean | null,
      answeredAt: 0,
      lastLive: null as number | null,
      videoAt: -1,
      asked: false,
      greeted: false,
      fingerTold: false,
      turnTold: false,
      arrowTold: false,
      /** Взгляд пальцем, градусы. */
      yaw: 0,
      pitch: 0,
      spots: [] as Spot[],
      /** Кого ищем сейчас; без него — любого спрятанного. */
      target: null as Spot | null,
      queue: [] as Spot[],
      lastPlace: undefined as SeekPlace | undefined,
      got: 0,
      goal: 1,
      nextId: 1,
      aimId: 0,
      aimFrom: 0,
      /** Голос рассказывает о находке: новый вопрос ещё не задан. */
      busy: false,
      foundAt: 0,
      toldAt: -1e9,
      timers: [] as { at: number; fn: () => void }[],
      particles: [] as Particle[],
      stopped: false,
    };

    const gaze = createGaze();
    const camera = createCamera(screen, 'environment', undefined, (granted) => {
      if (s.stopped) return;
      s.answer = granted;
      s.answeredAt = clock;
      s.lastLive = null;
    });

    const go = (p: Phase) => {
      s.phase = p;
      setPhase(p);
    };
    const later = (ms: number, fn: () => void) => s.timers.push({ at: clock + ms, fn });
    /** Куда смотрит экран: по датчику или пальцем. */
    const look = (): View => {
      const seen = s.steer === 'tilt' ? gaze.read() : null;
      return seen ? turned(seen, screenAngle()) : fingerView(s.yaw, s.pitch);
    };

    const stars = (x: number, y: number) => {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU;
        const v = 80 + Math.random() * 220;
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 3 + Math.random() * 5,
          life: 0.7,
          age: 0,
          color: COLORS[i % COLORS.length]!,
          kind: 'star',
          rot: 0,
        });
      }
    };
    const confetti = () => {
      for (let i = 0; i < 110; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = 320 + Math.random() * 520;
        s.particles.push({
          x: w * (0.15 + Math.random() * 0.7),
          y: h * 0.85,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: 5 + Math.random() * 5,
          life: 2.8,
          age: 0,
          color: COLORS[i % COLORS.length]!,
          kind: 'confetti',
          rot: Math.random() * 6,
        });
      }
    };

    // ─── Раунды ───
    const taskText = () => {
      const t = s.target;
      if (s.R.task === 'who' && t) return seekWho(t.animal);
      if (s.R.task === 'where' && t) return seekWhere(t.place!);
      return SEEK_ALL;
    };
    const place = (spots: Spot[], view: View) => {
      s.nextId += spots.length;
      for (const p of spots) p.at = clock;
      disarm(spots, view);
      s.spots = spots;
      s.aimId = 0;
    };
    /** Новый вопрос «кто где». Слева и справа — от того, куда ребёнок повёрнут сейчас. */
    const question = (intro: string[] = []) => {
      const view = look();
      place(around(s.R.wide, headingOf(view), s.nextId), view);
      s.lastPlace = nextPlace(s.R.wide, s.lastPlace, pitchOf(view));
      s.target = s.spots.find((p) => p.place === s.lastPlace)!;
      s.foundAt = clock;
      s.arrowTold = false;
      s.busy = false;
      void say(...intro, taskText());
    };
    const start = (k: number) => {
      s.k = k;
      setRound(k);
      s.R = rounds[k]!;
      s.got = 0;
      s.goal = s.R.count;
      s.target = null;
      s.queue = [];
      s.lastPlace = undefined;
      s.foundAt = clock;
      s.arrowTold = false;
      s.busy = false;
      go('play');
      let intro: string[] = [];
      if (!s.greeted) {
        s.greeted = true;
        const turning = s.steer === 'tilt';
        s.turnTold = turning;
        s.fingerTold = !turning;
        intro = [turning ? SEEK_GO : SEEK_FINGER];
      }
      if (s.R.task === 'where') {
        question(intro);
        return;
      }
      const view = look();
      place(scatter(s.R.count, s.R.wide, headingOf(view), s.nextId), view);
      if (s.R.task === 'who') {
        s.queue = shuffled(s.spots, Math.random);
        s.target = s.queue.shift()!;
      }
      void say(...intro, taskText());
    };
    const next = (k: number) => {
      if (s.stopped || s.k !== k) return;
      if (k + 1 < rounds.length) {
        fx.whoosh();
        later(420, () => start(k + 1));
        return;
      }
      // Игра кончилась — камере и датчику здесь больше нечего делать.
      camera.stop();
      gaze.stop();
      s.filming = false;
      s.answer = false;
      confetti();
      go('finish');
      void afterSpeech(say(SEEK_END), 2600).then(() => {
        if (!s.stopped) onFinish();
      });
    };
    const win = (told: string) => {
      const k = s.k;
      go('done');
      void afterSpeech(praise(phrases, undefined, [told, SEEK_WIN]), 2800).then(() => next(k));
    };

    const peek = (p: Spot, byFinger: boolean) => {
      p.state = 'seen';
      p.at = clock;
      p.armed = false;
      fx.soft();
      later(SEEN_MS, () => {
        if (p.state !== 'seen') return;
        p.state = 'hidden';
        p.at = clock;
      });
      // Заглянуть в чужое укрытие можно: вопрос «кто где» про место, и нажатие мимо него — ошибка.
      const missed = byFinger && s.R.task === 'where';
      if (missed) bump();
      if (s.R.task !== 'where' || clock - s.toldAt > TOLD_MS) {
        s.toldAt = clock;
        void say(seekOther(p.animal), ...(s.R.task === 'where' ? [taskText()] : []));
      }
    };
    const open = (p: Spot, byFinger: boolean) => {
      if (s.phase !== 'play' || s.busy || p.state !== 'hidden') return;
      if (s.target && p !== s.target) {
        peek(p, byFinger);
        return;
      }
      p.state = 'found';
      p.at = clock;
      p.armed = false;
      s.got++;
      s.foundAt = clock;
      s.arrowTold = false;
      fx.pop();
      fx.sparkle();
      const q = project(look(), spotDir(p), f, w, h);
      if (q.front) stars(q.x, q.y);
      const told = s.R.task === 'where' ? seekHere(p.place!, p.animal) : seekFound(p.animal);
      if (s.got >= s.goal) {
        win(told);
        return;
      }
      if (s.R.task === 'where') {
        const k = s.k;
        s.busy = true;
        void afterSpeech(say(told), 1400).then(() => {
          if (!s.stopped && s.k === k && s.phase === 'play') question();
        });
        return;
      }
      if (s.R.task === 'who') {
        s.target = s.queue.shift()!;
        void say(told, taskText());
        return;
      }
      void say(told);
    };

    const remind = () => {
      void say(s.phase === 'ask' ? SEEK_ASK : s.phase === 'wait' ? BUBBLES_ASK : taskText());
    };
    setTask(remind);

    // ─── Датчик и камера ───
    const launch = () => {
      if (s.stopped || s.launched) return;
      s.launched = true;
      s.launchedAt = clock;
      go('wait');
      gaze.start();
    };
    press.current = () => {
      fx.click();
      void askMotion().then(launch);
    };
    void askMotion().then((a) => {
      if (s.stopped) return;
      if (a !== 'gesture') {
        launch();
        return;
      }
      go('ask');
      void say(SEEK_ASK);
    });
    const onVisibility = () => {
      if (!s.launched || s.phase === 'finish') return;
      if (document.hidden) gaze.stop();
      else gaze.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    /** Камера нужна, только пока ребёнок поворачивается: пальцем двигают нарисованную комнату. */
    const sense = () => {
      const now = gaze.steer();
      const seen = gaze.heard();
      if (now === 'tilt' && seen && !s.filming) {
        s.filming = true;
        s.answer = null;
        s.answeredAt = clock;
        s.lastLive = null;
        camera.start();
      } else if (now === 'finger' && s.filming) {
        s.filming = false;
        s.answer = false;
        camera.stop();
      }
      if (now === s.steer) return;
      // Взгляд пальцем продолжается оттуда, куда смотрел телефон: комната не прыгает.
      const view = look();
      s.yaw = headingOf(view);
      s.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitchOf(view)));
      s.steer = now;
      setSteer(now);
    };

    // ─── Палец: работает всегда, даже с камерой ───
    let drag: { x: number; y: number; moved: number } | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.corner-button, .seek-start')) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.hypot(dx, dy);
      if (s.steer !== 'finger') return;
      s.yaw -= (dx / f) * (180 / Math.PI);
      s.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, s.pitch + (dy / f) * (180 / Math.PI)));
    };
    const up = (e: PointerEvent) => {
      const tap = drag && drag.moved < TAP_PX;
      drag = null;
      if (!tap || s.phase !== 'play') return;
      const box = el.getBoundingClientRect();
      const view = look();
      const size = spotSize(w, h);
      const hit = s.spots.find((p) => {
        const q = project(view, spotDir(p), f, w, h);
        return (
          p.state === 'hidden' &&
          q.front &&
          tapped(e.clientX - box.left, e.clientY - box.top, q.x, q.y, size)
        );
      });
      if (hit) open(hit, true);
    };
    const cancel = () => {
      drag = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);

    // Поворотом играют без касаний: иначе экран погаснет посреди раунда.
    setKeepAwake(true);

    // ─── Рисование ───
    const centered = (name: string, x: number, y: number, bw: number) => {
      const im = ok(name);
      if (!im) return false;
      const bh = (bw * im.naturalHeight) / im.naturalWidth;
      ctx.drawImage(im, x - bw / 2, y - bh / 2, bw, bh);
      return true;
    };
    /** Нарисованная комната по кругу: картинка и её зеркало по полкруга, поэтому стыков нет. */
    const drawRoom = (view: View) => {
      const y0 = h / 2 + (pitchOf(view) * Math.PI * f) / 180;
      ctx.fillStyle = CEILING;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = FLOOR;
      ctx.fillRect(0, Math.max(0, y0), w, h);
      const im = ok('seek-room');
      if (!im) return;
      const bw = Math.PI * f;
      const bh = (bw * im.naturalHeight) / im.naturalWidth;
      const yaw = ((headingOf(view) % 360) + 360) % 360;
      for (let k = -1; k <= 2; k++) {
        // Начинаем с середины картинки: там окно и полка, а не пустая стена на стыке.
        const x = w / 2 + ((k * 180 - 90 - yaw) / 180) * bw;
        if (x > w || x + bw < 0) continue;
        if (k % 2 === 0) {
          ctx.drawImage(im, x - 0.5, y0 - bh / 2, bw + 1, bh);
          continue;
        }
        ctx.save();
        ctx.translate(x + bw, y0 - bh / 2);
        ctx.scale(-1, 1);
        // Половинки заходят друг на друга на пиксель, иначе на стыке видна полоска.
        ctx.drawImage(im, -0.5, 0, bw + 1, bh);
        ctx.restore();
      }
      ctx.fillStyle = CEILING;
      ctx.fillRect(0, 0, w, Math.max(0, y0 - bh / 2));
      ctx.fillStyle = FLOOR;
      ctx.fillRect(0, y0 + bh / 2, w, h);
    };
    const drawSpot = (p: Spot, view: View) => {
      const q = project(view, spotDir(p), f, w, h);
      const size = spotSize(w, h);
      if (!q.front || q.x < -size || q.x > w + size || q.y < -size || q.y > h + size) return;
      const age = clock - p.at;
      // Спрятанный зверёнок иногда выглядывает, открытый поднимается над укрытием.
      const wink = Math.max(0, Math.sin(clock / 700 + p.id * 1.7) - 0.55) / 0.45;
      const rise = p.state === 'hidden' ? wink * 0.2 : easeOut(clamp01(age / 280));
      const hop = p.state === 'found' ? Math.abs(Math.sin(clock / 240)) * size * 0.04 : 0;
      if (rise > 0) centered(`animal-${p.animal}`, q.x, q.y - size * 0.58 * rise - hop, size * 0.8);
      const grow = p.state === 'hidden' ? 0.7 + 0.3 * easeOut(clamp01(age / 240)) : 1;
      if (centered(`seek-${p.hide}`, q.x, q.y, size * grow)) return;
      ctx.fillStyle = '#6fbf63';
      ctx.beginPath();
      ctx.arc(q.x, q.y, size * 0.4, 0, TAU);
      ctx.fill();
    };
    /** Кружок прицела; пока укрытие в нём, по кругу бежит золотая дорожка. */
    const drawAim = (share: number) => {
      const r = spotSize(w, h) * 0.6;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, TAU);
      ctx.stroke();
      if (share <= 0) return;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + TAU * share);
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    /** Кого ищем и сколько осталось — наверху, между кнопками. */
    const drawTop = () => {
      const t = s.R.task === 'who' ? s.target : null;
      if (t) {
        const r = 28;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(w / 2, 48, r + 8, 0, TAU);
        ctx.fill();
        centered(`animal-${t.animal}`, w / 2, 48, r * 2);
      }
      const n = s.goal;
      const size = Math.min(22, (w - 200) / n);
      const y = t ? 100 : 52;
      for (let i = 0; i < n; i++) {
        const x = w / 2 + (i - (n - 1) / 2) * size;
        ctx.fillStyle = i < s.got ? '#ffd23f' : 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = 'rgba(40,50,90,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.38, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    };
    /** Куда показать стрелку: по кругу от середины, чтобы не заехать под кнопки. */
    const arrowAt = (a: number) => ({
      x: w / 2 + Math.sin(a) * w * 0.36,
      y: h / 2 - Math.cos(a) * h * 0.34,
    });
    const drawArrow = (a: number) => {
      const p = arrowAt(a);
      const size = Math.min(w, h) * 0.2 * (1 + 0.08 * Math.sin(clock / 160));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      centered('arrow-up', 0, 0, size);
      ctx.restore();
    };

    // ─── Кадр ───
    let raf = 0;
    let last = 0;
    let frameNo = 0;
    const frame = (raw: number) => {
      const gap = Math.max(0, raw - (last || raw));
      const dt = Math.min(0.05, gap / 1000);
      const span = Math.min(gap, 250);
      last = raw;
      clock += span;
      frameNo++;
      const due = s.timers.filter((t) => t.at <= clock);
      s.timers = s.timers.filter((t) => t.at > clock);
      for (const t of due) t.fn();

      if (s.launched && s.phase !== 'finish') sense();
      // Живо ли видео, видно по его часам: сами кадры игре не нужны.
      if (screen.readyState >= 2 && screen.currentTime !== s.videoAt) {
        s.videoAt = screen.currentTime;
        s.lastLive = clock;
      }
      const state = s.filming ? cameraState(s.answer, clock, s.lastLive, s.answeredAt) : 'off';
      s.camera = state;

      if (s.phase === 'wait' && s.launched) {
        const waited = clock - s.launchedAt;
        if (s.steer === 'finger' || (s.filming && state !== 'wait') || waited > WAIT_MS) start(0);
        else if (s.filming && !s.asked && waited > ASK_AFTER) {
          s.asked = true;
          void say(BUBBLES_ASK);
        }
      }

      const view = look();
      let share = 0;
      if (s.phase === 'play') {
        if (s.steer === 'finger' && !s.fingerTold) {
          s.fingerTold = true;
          void say(SEEK_FINGER);
        } else if (s.steer === 'tilt' && !s.turnTold) {
          s.turnTold = true;
          void say(SEEK_GO);
        }
        const aimed = s.busy ? undefined : aimedAt(view, s.spots);
        if (!aimed) s.aimId = 0;
        else if (aimed.id !== s.aimId) {
          s.aimId = aimed.id;
          s.aimFrom = clock;
        } else {
          share = clamp01((clock - s.aimFrom) / DWELL_MS);
          if (share >= 1) {
            s.aimId = 0;
            share = 0;
            open(aimed, false);
          }
        }
      }

      // ─── Сцена: с камерой поверх живой картинки, без неё — нарисованная комната ───
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (state !== 'on') drawRoom(view);
      for (const p of s.spots) drawSpot(p, view);

      const goal = s.phase === 'play' && !s.busy ? (s.target ?? nearest(view, s.spots)) : undefined;
      let arrow: number | null = null;
      if (goal) {
        const q = project(view, spotDir(goal), f, w, h);
        const seen = q.front && q.x > 0 && q.x < w && q.y > 0 && q.y < h;
        const quiet = clock - s.foundAt;
        if (!seen && quiet > (s.k === 0 ? ARROW_FIRST : ARROW_AFTER)) {
          arrow = arrowTo(view, spotDir(goal));
          if (!s.arrowTold && s.steer === 'tilt' && quiet > ARROW_AFTER) {
            s.arrowTold = true;
            void say(SEEK_TURN);
          }
        }
      }
      if (s.phase === 'play') {
        drawAim(share);
        drawTop();
        if (arrow !== null) drawArrow(arrow);
      }

      // ─── Искры и конфетти ───
      for (const p of s.particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += dt * 6;
        ctx.globalAlpha = Math.max(0, Math.min(1, (1 - p.age / p.life) * 1.5));
        if (p.kind === 'confetti') {
          p.vx *= 1 - dt * 1.2;
          p.vy = p.vy * (1 - dt * 1.2) + 420 * dt;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
          ctx.restore();
        } else {
          p.vy += 260 * dt;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      s.particles = s.particles.filter((p) => p.age < p.life);

      // Палец подсказки (IdleHint): на укрытие, а если его не видно — тянуть комнату к середине.
      if (frameNo % 6 === 0 && hint.current && hintTo.current) {
        const size = spotSize(w, h);
        const put = (div: HTMLDivElement, x: number, y: number) => {
          div.style.display = 'block';
          div.style.left = `${x - size / 2}px`;
          div.style.top = `${y - size / 2}px`;
          div.style.width = `${size}px`;
          div.style.height = `${size}px`;
        };
        const show = !!goal && s.steer === 'finger';
        const pull = show && arrow !== null;
        if (show) {
          const q = project(view, spotDir(goal), f, w, h);
          const from = pull ? arrowAt(arrow!) : q;
          put(hint.current, from.x, from.y);
        } else hint.current.style.display = 'none';
        if (pull) put(hintTo.current, w / 2, h / 2);
        else hintTo.current.style.display = 'none';
        hint.current.toggleAttribute('data-hint', show);
        hintTo.current.toggleAttribute('data-hint-target', pull);
      }
      // Для автотестов — каждый кадр.
      if (webdriver) {
        el.dataset.camera = state;
        el.dataset.steer = s.steer;
        el.dataset.task = s.R.task;
        el.dataset.got = String(s.got);
        el.dataset.goal = String(s.goal);
        el.dataset.busy = String(s.busy);
        el.dataset.target = String(s.target?.id ?? '');
        el.dataset.arrow = String(arrow !== null);
        el.dataset.heading = headingOf(view).toFixed(1);
        el.dataset.pitch = pitchOf(view).toFixed(1);
        el.dataset.spots = JSON.stringify(
          s.spots.map((p) => {
            const q = project(view, spotDir(p), f, w, h);
            return {
              id: p.id,
              az: p.az,
              el: p.el,
              animal: p.animal,
              place: p.place,
              state: p.state,
              x: Math.round(q.x),
              y: Math.round(q.y),
              front: q.front,
            };
          }),
        );
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      s.stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      camera.stop();
      gaze.stop();
      setKeepAwake(false);
      document.removeEventListener('visibilitychange', onVisibility);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="game seek"
      data-testid="game-seek"
      data-phase={phase}
      data-round={round}
      data-no-idle={phase !== 'play' || steer === 'tilt' || undefined}
      ref={root}
    >
      <video ref={video} className="seek-video" muted playsInline autoPlay />
      <canvas ref={canvas} className="seek-canvas" />
      <div ref={hint} className="seek-hint" />
      <div ref={hintTo} className="seek-hint" />
      {phase === 'ask' && (
        <button
          type="button"
          className="seek-start"
          data-testid="seek-start"
          aria-label="Начать"
          onClick={() => press.current()}
        >
          ▶
        </button>
      )}
    </div>
  );
}
