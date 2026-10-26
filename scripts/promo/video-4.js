// Ролик №4 «35 видов игр» (этап 48): 1080×1920, клипы снимает capture-4.mjs.
// Нарезка игр под навыки — по куску на игру, подпись с её значком; потом «35 видов», наклейка, призыв.
import {
  Bubbles,
  Captions,
  clamp,
  ease,
  el,
  keys,
  lerp,
  line,
  logo,
  Phone,
  pop,
  prog,
  said,
  setSrc,
  shotAt,
  style,
} from './stage.js';

const DURATION = 38.5;

/** Самый короткий кусок игры в нарезке, с. */
const CUT = 0.95;

// Навык — фраза диктора — игры под ней: с какой секунды клипа и как быстро (момент удачи — в куске).
const GROUPS = [
  {
    id: 'n-math',
    cap: '*Счёт* и цифры',
    cuts: [
      // Планеты с ответами подлетают, ракета садится на верную.
      { kind: 'rocket', name: 'Ракета', clip: '4-rocket-fly', from: 7.5, speed: 1.3 },
      { kind: 'fishing', name: 'Рыбалка', clip: '4-fishing', from: 0.35, speed: 1.5 },
    ],
  },
  {
    id: 'n-mind',
    cap: '*Память* и внимание',
    cuts: [
      { kind: 'memory', name: 'Найди пару', clip: '4-memory', from: 3, speed: 2.4 },
      { kind: 'differences', name: 'Найди отличия', clip: '4-differences', from: 0.55, speed: 1.8 },
    ],
  },
  {
    id: 'n-ear',
    cap: '*Слух*',
    cuts: [{ kind: 'piano', name: 'Пианино', clip: '4-piano', from: 3.75 }],
  },
  {
    id: 'n-read',
    cap: '*Чтение*',
    cuts: [
      {
        kind: 'syllableWord',
        name: 'Слово из слогов',
        clip: '4-syllableWord',
        from: 0.45,
        speed: 2.3,
      },
    ],
  },
  {
    id: 'n-logic',
    cap: 'И *логика*',
    cuts: [
      { kind: 'sudoku', name: 'Судоку', clip: '4-sudoku', from: 0.5, speed: 2.2 },
      { kind: 'clock', name: 'Который час?', clip: '4-clock', from: 0.15 },
    ],
  },
];

/** Сколько видов игр — как на лендинге. */
const KINDS = 35;
const LEVELS = 4;

/** «1 вид», «2 вида», «5 видов» — пока число досчитывает. */
const kinds = (n) =>
  n % 10 === 1 && n % 100 !== 11
    ? 'вид игр'
    : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
      ? 'вида игр'
      : 'видов игр';

export default {
  duration: DURATION,
  async build(stage) {
    // ── Озвучка и сцены: сцены встают под фразы диктора ──
    const voice = [];
    /** Фраза id с момента at; возвращает, когда она кончится. */
    const say = (id, at) => {
      voice.push({ at, id });
      return at + line(id).sec;
    };
    const sec = (id) => line(id).sec;

    // Вступление: отсчёт и пуск ракеты, пока звучит «Это не мультик…»
    const hookEnd = say('n-hook', 0.05);
    // Вторая фраза («Это игры…») — с середины: в первой 16 букв из 39.
    const HOOK_B = 0.05 + sec('n-hook') * 0.4;

    // Нарезка: у каждого навыка — его фраза и куски игр, кусок не короче CUT.
    const shots = [];
    const tags = [];
    const caps = [];
    let t = hookEnd + 0.15;
    // Ракета взлетает (3,3 с клипа) к концу первой фразы.
    shots.push({ at: 0, clip: '4-rocket-launch', from: 0.2, speed: 3.1 / (hookEnd - 0.5) });
    caps.push({ from: 0.1, to: HOOK_B, text: 'Это не *мультик*' });
    caps.push({ from: HOOK_B, to: t, text: 'Это *игры*,\nкоторые учат' });
    for (const g of GROUPS) {
      const len = Math.max(g.cuts.length * CUT, sec(g.id) + 0.35);
      say(g.id, t + 0.1);
      caps.push({ from: t, to: t + len, text: g.cap });
      g.cuts.forEach((c, i) => {
        const at = t + (i * len) / g.cuts.length;
        shots.push({ at, clip: c.clip, from: c.from, speed: c.speed ?? 1 });
        tags.push({
          from: at,
          to: t + ((i + 1) * len) / g.cuts.length,
          kind: c.kind,
          name: c.name,
        });
      });
      t += len;
    }
    const CUTS_END = t;

    // Гонки: совёнок говорит, в какие ворота; ворота пройдены (5,1 с клипа) к концу фразы.
    const RACE = CUTS_END + 0.1;
    const raceEnd = say('n-voice', RACE + 0.15) + 0.25;
    const raceSpeed = (5.1 - 1.1) / (raceEnd - 0.3 - RACE);
    shots.push({ at: RACE, clip: '4-race', from: 1.1, speed: raceSpeed });
    tags.push({ from: RACE, to: raceEnd, kind: 'race', name: 'Гонки' });
    caps.push({ from: RACE, to: raceEnd, text: 'Совёнок объясняет —\n*читать не нужно*' });
    const ask = said('4-race', 'один')[0];
    const askAt = RACE + (ask.sec - 1.1) / raceSpeed;

    // Лабиринт: уровень растёт, пока зайка идёт к морковке.
    const MAZE = raceEnd;
    const mazeEnd = say('n-level', MAZE + 0.2) + 0.3;
    shots.push({ at: MAZE, clip: '4-maze', speed: 2.5 / (mazeEnd - 0.4 - MAZE) });
    tags.push({ from: MAZE, to: mazeEnd, kind: 'maze', name: 'Лабиринт' });
    caps.push({ from: MAZE, to: mazeEnd, text: 'Получается —\nстанет *сложнее*' });

    // Стена плиток: «Игры» открываются и листаются, число досчитывает до 35.
    const WALL = mazeEnd;
    const wallEnd = say('n-count', WALL + 0.25) + 0.3;
    shots.push({ at: WALL, clip: '4-wall', from: 0.3, xf: 0.3 });

    // Наклейка: пазл собран — тигрёнок влетает, совёнок радуется; потом альбом.
    const PUZZLE = wallEnd;
    shots.push({ at: PUZZLE, clip: '4-puzzle', from: 2.3, speed: 2, xf: 0.25 });
    shots.push({ at: PUZZLE + 0.6, clip: '4-sticker', from: 1 });
    const cheer = say('o-sticker', PUZZLE + 1.2) + 0.15;
    const ALBUM = cheer + 0.1;
    shots.push({ at: ALBUM, clip: '4-album', from: 0.2, xf: 0.2 });
    const CTA = say('n-sticker', ALBUM + 0.1) + 0.3;
    caps.push({ from: PUZZLE + 0.2, to: CTA - 0.1, text: 'За каждую игру —\n*наклейка*' });

    const end = say('n-cta', say('n-trust', CTA + 0.3) + 0.2);
    if (end > DURATION - 0.8) throw new Error(`озвучка не влезает: ${end.toFixed(2)} с`);
    caps.push({ from: CTA + 1, to: 61, text: 'Играет —\n*и учится*', cls: 'center' });

    // ── Сцена: кремовый фон, мягкие пятна ──
    const day = el(stage, 'div', 'layer');
    day.style.background = 'var(--cream)';
    for (const [x, y, r, c] of [
      [120, 420, 520, '--blush'],
      [980, 1250, 620, '--sage'],
      [260, 1820, 520, '--sky'],
    ])
      style(el(day, 'div', 'blob'), {
        left: `${x - r / 2}px`,
        top: `${y - r / 2}px`,
        width: `${r}px`,
        height: `${r}px`,
        background: `var(${c})`,
      });

    const kid = new Phone(day);

    // Подпись игры: значок с плитки и название
    const tag = el(day, 'div', 'tag');
    const tagIcon = el(tag, 'img');
    const tagName = el(tag, 'span');
    let tagCur = null;

    // Уровень: точки загораются по одной
    const level = el(day, 'div', 'chip level', '<span>Уровень</span>');
    const dots = Array.from({ length: LEVELS }, () => el(level, 'i'));
    style(level, { left: '540px', top: '1745px' });

    // «35 видов игр»
    const count = el(day, 'div', 'count', '<b></b><span>видов игр</span>');
    const countNum = count.querySelector('b');
    const countWord = count.querySelector('span');
    const noRow = el(day, 'div');
    style(noRow, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '620px',
      display: 'flex',
      justifyContent: 'center',
      gap: '24px',
    });
    const noChips = ['Без рекламы', 'Без покупок'].map((text) => {
      const chip = el(noRow, 'div', 'chip', text);
      chip.style.position = 'relative';
      return chip;
    });

    // Призыв в конце
    const ctaBrand = el(day, 'div', 'brand', `${logo()}<span>KidsPlus</span>`);
    style(ctaBrand, { position: 'absolute', left: '0', right: '0', top: '560px' });
    const ctaOwl = el(day, 'img', 'owl');
    setSrc(ctaOwl, '/landing/img/owl/point.webp');
    style(ctaOwl, { left: '340px', top: '720px', width: '400px', height: '400px' });
    const row = el(day, 'div');
    style(row, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '1140px',
      display: 'flex',
      justifyContent: 'center',
      gap: '24px',
    });
    const chips = ['Бесплатно', 'iPhone и Android'].map((text) => {
      const chip = el(row, 'div', 'chip', text);
      chip.style.position = 'relative';
      return chip;
    });
    const cta = el(day, 'div', 'cta', '<small>Напишите в директ</small>«Хочу подключить»');
    style(cta, { top: '1270px' });

    const captions = new Captions(day, caps);
    const bubbles = new Bubbles(day, [
      // Совёнок в игре: «Проезжай в ворота с цифрой один!» — над трассой.
      { from: askAt, to: askAt + 2.4, text: ask.text, y: 930 },
      ...voice
        .filter((v) => line(v.id).voice === 'owl')
        .map((v) => ({ from: v.at, to: v.at + sec(v.id) + 0.4, text: line(v.id).text, y: 1480 })),
    ]);

    // Камера: {s, u, v, px, py} — точку экрана (u, v) ставим в точку кадра (px, py).
    const GAME = { s: 0.47, u: 0.5, v: 0.5, px: 540, py: 1290 };
    const WIDE = { s: 0.4, u: 0.5, v: 0.5, px: 540, py: 1360 };
    const cam = [
      { t: 0, ...GAME, s: 0.5 },
      { t: hookEnd, ...GAME },
      { t: WALL, ...GAME },
      { t: WALL + 0.6, ...WIDE },
      { t: PUZZLE - 0.3, ...WIDE },
      { t: PUZZLE + 0.3, ...GAME },
      { t: ALBUM, ...GAME },
      { t: CTA - 0.2, ...GAME, s: 0.5 },
      { t: CTA + 0.5, ...GAME, s: 0.5, py: 2900 },
    ];
    /** Начала кусков нарезки: на каждом — лёгкий «наезд». */
    const punches = tags.map((x) => x.from).filter((x) => x < CUTS_END);

    const render = (t) => {
      const at = keys(cam, t);
      const hit = punches.findLast((x) => x <= t);
      const punch = hit === undefined ? 0 : 0.02 * (1 - ease.out(prog(t, hit, hit + 0.3)));
      kid.place({ ...at, s: at.s + punch });
      kid.show(shotAt(shots, t));
      kid.root.style.display = t > CTA + 0.5 ? 'none' : '';

      const tg = tags.find((x) => t >= x.from && t < x.to) ?? null;
      if (tg !== tagCur) {
        tagCur = tg;
        if (tg) {
          setSrc(tagIcon, `/games/icon-${tg.kind}.webp`);
          tagName.textContent = tg.name;
        }
      }
      if (tg) pop(tag, t, tg.from, tg.to + 0.3, { pre: 'translateX(-50%)', dy: 24, scale: 0.9 });
      else style(tag, { opacity: '0', visibility: 'hidden' });

      // Уровень 1 → 2 → 3, пока звучит «становится сложнее».
      const lv = 1 + (t > MAZE + 1.1) + (t > MAZE + 1.9);
      dots.forEach((d, i) => {
        d.className = i < lv ? 'on' : '';
        const k = prog(t, MAZE + 0.3 + 0.8 * i, MAZE + 0.6 + 0.8 * i);
        d.style.transform = i === lv - 1 && i ? `scale(${1 + 0.5 * Math.sin(Math.PI * k)})` : '';
      });
      pop(level, t, MAZE + 0.3, mazeEnd, { pre: 'translateX(-50%)' });

      // 35 — досчитывает, пока звучит «Тридцать пять видов игр».
      const n = Math.round(lerp(1, KINDS, ease.out(prog(t, WALL + 0.3, WALL + 1.6))));
      countNum.textContent = String(clamp(n, 1, KINDS));
      countWord.textContent = kinds(clamp(n, 1, KINDS));
      pop(count, t, WALL + 0.2, PUZZLE + 0.1, { dy: 30, scale: 0.7 });
      noChips.forEach((c, i) =>
        pop(c, t, WALL + 0.25 + sec('n-count') * (0.5 + 0.22 * i), PUZZLE + 0.1),
      );

      // Призыв: «Кидс Плюс» звучит с CTA + 0,3.
      pop(ctaBrand, t, CTA + 0.3);
      pop(ctaOwl, t, CTA + 0.5, Infinity, { pre: `rotate(${Math.sin(t * 3) * 4}deg)`, dy: 80 });
      chips.forEach((c, i) => pop(c, t, CTA + 0.9 + i * 0.15));
      const pulse = t > CTA + 2.2 ? 1 + 0.035 * Math.sin((t - CTA - 2.2) * 5) : 1;
      pop(cta, t, CTA + 1.5, Infinity, { pre: `scale(${pulse})`, dy: 60 });

      captions.render(t);
      bubbles.render(t);
    };
    return { render, voice };
  },
};
