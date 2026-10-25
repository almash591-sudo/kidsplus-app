// Ролик №3 «Смотрит часами, а в голове пусто» (этап 48): 1080×1920, клипы снимает capture-3.mjs.
// Сцены встают под фразы озвучки (voice-3.json), куски клипов — под реплики телефона (said).
import {
  Bubbles,
  Captions,
  clipSec,
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

const DURATION = 44;

// Автовоспроизведение «обычного» видеоприложения: мультик за мультиком, все досмотрены.
// Картинки — наши, пластилиновые; чужих кадров и логотипов в ролике нет.
const FEED = [
  ['1f98a', '#cfe8d8', '#9fcfb2', '8:12'],
  ['1f430', '#ffe0da', '#f7b3a6', '5:40'],
  ['1f43b', '#fbe9c4', '#ecc77f', '11:03'],
  ['1f431', '#dfe5ff', '#b7c3f5', '6:27'],
  ['1f436', '#ffe9d1', '#f5c08e', '9:15'],
  ['1f438', '#dff3cf', '#a9d98c', '4:58'],
  ['1f680', '#e3e0ff', '#b2a8f2', '12:30'],
  ['1f697', '#ffe0e0', '#f3a3a3', '7:44'],
  ['1f42e', '#eef0f4', '#c9cfda', '10:21'],
  ['1f41f', '#d7f0fb', '#94d2ee', '6:03'],
  ['26f5', '#dceffd', '#9cc8ef', '8:39'],
  ['2708', '#e6f0ff', '#a9c4f3', '5:17'],
  ['1f989', '#f1e6d8', '#d9bf9c', '9:48'],
];
const CARD_H = 880;
/** Где лента останавливается: предпоследний мультик вверху экрана. */
const LAND = (FEED.length - 2) * CARD_H;
// Во вступлении (n-hook): «…подряд» кончается на 1,9 с, «пусто» звучит с 3,4 с.
const STOP = 2.6;
const EMPTY = 3.38;

/** Прокрутка ленты в момент t: всё быстрее, потом стоп. */
const feedAt = (t) => LAND * ease.inOut(prog(t, 0.25, STOP));

/** Сколько «смотрит без перерыва» в момент t, с: три часа к концу фразы. */
const watched = (t) => 3 * 3600 * ease.in(prog(t, 0.15, 2.1));
const hms = (s) =>
  `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:` +
  String(Math.floor(s) % 60).padStart(2, '0');

const CLOUD =
  '<svg viewBox="0 0 800 540"><g fill="currentColor">' +
  [
    [240, 300, 150],
    [410, 220, 185],
    [585, 290, 160],
    [330, 380, 125],
    [505, 385, 125],
    [150, 375, 95],
    [665, 385, 100],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
    .join('') +
  '</g></svg>';

const CLOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
  'stroke-linecap="round"><circle cx="12" cy="13.5" r="8"/><path d="M12 9.5v4l2.8 1.8M9.5 2.5h5"/></svg>';

/** Рамка вокруг места [u0, v0, u1, v1] экрана телефона в положении p. */
function frameOn(e, p, [u0, v0, u1, v1]) {
  const a = Phone.point(p, u0, v0);
  const b = Phone.point(p, u1, v1);
  style(e, {
    left: `${a.x - 12}px`,
    top: `${a.y - 12}px`,
    width: `${b.x - a.x + 24}px`,
    height: `${b.y - a.y + 24}px`,
    borderRadius: `${90 * p.s}px`,
  });
}

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
    // Когда в клипах появляются карточки и когда звучит похвала за ответ.
    const foxSec = said('3-lesson', 'лиса')[0].sec;
    const bearSec = said('3-lesson', 'медведь')[0].sec;
    const ringSec = said('3-quiz', 'умница')[0].sec;

    const REVEAL = say('n-hook', 0.05) + 0.2;
    const KID = REVEAL + 0.1;
    const FOX = say('n-lesson', KID + 0.25) + 0.1;
    const BEAR = say('n-cards', FOX + 0.3) + 0.1;
    const VIDEO = say('o-bear', BEAR + 0.2) + 0.3;
    const quizAt = say('n-video', VIDEO + 0.2) + 0.2;
    const askAt = say('n-quiz', quizAt) + 0.15;
    const QUIZ = askAt - 1;
    const TAP = say('o-ask', askAt) + 0.05;
    const SEE = say('o-yes', TAP + 0.5) + 0.1;
    const SCROLL = say('n-see', SEE + 0.3) + 0.1;
    const PLAN = say('n-repeat', SCROLL + 0.2) + 0.2;
    const CTA = say('n-plan', PLAN + 0.2) + 0.15;
    const end = say('n-cta', say('n-trust', CTA + 0.3) + 0.2);
    if (end > DURATION - 0.8) throw new Error(`озвучка не влезает: ${end.toFixed(2)} с`);

    // ── Вступление: мультик за мультиком, три часа ──
    const night = el(stage, 'div', 'layer night');
    const feedPhone = new Phone(night);
    const screen = feedPhone.a.parentElement;
    feedPhone.a.remove();
    feedPhone.b.remove();
    const feed = el(screen, 'div', 'feed');
    const list = el(feed, 'div', 'feed-list');
    for (const [code, a, b, dur] of FEED) {
      const c = el(list, 'div', 'feed-card');
      const thumb = el(c, 'div', 'feed-thumb');
      thumb.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      setSrc(el(thumb, 'img'), `/landing/img/kid/${code}.webp`);
      thumb.insertAdjacentHTML(
        'beforeend',
        `<span class="dur">${dur}</span><span class="seen"></span>`,
      );
      el(
        c,
        'div',
        'feed-meta',
        `<span class="ava" style="background:${b}"></span>` +
          '<div class="lines"><i></i><i style="width:62%"></i></div>',
      );
    }
    const head = el(
      feed,
      'div',
      'feed-head',
      '<div class="bar"><span class="t"></span><span>100%</span></div><div class="search">Поиск</div>',
    );
    const clockText = head.querySelector('.t');
    const dim = el(screen, 'div', 'dim');
    const counter = el(night, 'div', 'counter', '<i></i><b></b><small>без перерыва</small>');
    const counterText = counter.querySelector('b');
    const puffs = [
      [330, 1295, 36],
      [262, 1380, 24],
      [215, 1446, 15],
    ].map(([x, y, r]) => {
      const p = el(night, 'div', 'puff');
      style(p, {
        left: `${x - r}px`,
        top: `${y - r}px`,
        width: `${2 * r}px`,
        height: `${2 * r}px`,
      });
      return p;
    });
    const think = el(night, 'div', 'think', `${CLOUD}<span>пусто</span>`);
    const thinkWord = think.querySelector('span');
    const nightCaps = [
      new Captions(night, [
        {
          from: -0.3,
          to: 2.15,
          text: 'Три часа *мультиков*\nподряд…',
          cls: 'light center',
          top: 230,
        },
        { from: 2.15, to: REVEAL + 0.3, text: '…а в голове —', cls: 'light center', top: 230 },
      ]),
    ];

    // ── День: раскрывается кругом из телефона ──
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

    const phones = el(day, 'div', 'layer phones');
    const kid = new Phone(phones);
    const parent = new Phone(phones);

    // Рамки: «верно с первой попытки», «Повторить», тема недели
    const statMark = el(day, 'div', 'mark');
    const repMark = el(day, 'div', 'mark');
    const planMark = el(day, 'div', 'mark');

    const videoChip = el(day, 'div', 'chip', `${CLOCK}3 минуты, а не 3 часа`);
    style(videoChip, { left: '540px', top: '1500px' });

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

    const caps = new Captions(day, [
      { from: KID + 0.35, to: FOX - 0.1, text: 'Мультик —\n*часть урока*' },
      { from: FOX - 0.1, to: VIDEO - 0.1, text: 'Сначала —\n*карточки*' },
      { from: VIDEO + 0.1, to: quizAt - 0.1, text: 'Потом — *мультик*\nо том же' },
      { from: quizAt - 0.1, to: SEE + 0.2, text: 'А после —\n*вопрос*' },
      { from: SEE + 0.3, to: SCROLL + 0.1, text: 'Видно, что\n*запомнилось*' },
      { from: SCROLL + 0.1, to: PLAN - 0.1, text: 'Что не запомнилось —\n*само повторится*' },
      { from: PLAN - 0.1, to: CTA - 0.1, text: 'Каждую неделю —\n*новая тема*' },
      { from: CTA + 1, to: 61, text: 'Смотрит меньше —\n*знает больше*', cls: 'center' },
    ]);

    const kidShots = [
      // Список занятий — пока звучит фраза; касание «Природы» — в обычном темпе.
      { at: KID, clip: '3-lesson', speed: (foxSec - 0.45) / (FOX - 0.45 - KID) },
      { at: FOX - 0.45, clip: '3-lesson', from: foxSec - 0.45 },
      // Лиса стоит, пока диктор говорит о карточках; медведь — к концу фразы.
      {
        at: FOX + 0.6,
        clip: '3-lesson',
        from: foxSec + 0.6,
        speed: (bearSec - foxSec - 1) / (BEAR - FOX - 1),
      },
      { at: BEAR - 0.4, clip: '3-lesson', from: bearSec - 0.4 },
      { at: BEAR + 0.5, clip: '3-lesson', from: bearSec + 0.5, speed: 0.4 },
      {
        at: VIDEO,
        clip: '3-video',
        speed: Math.min(1, clipSec('3-video') / (QUIZ - VIDEO)),
        xf: 0.3,
      },
      // Вопрос звучит, пока совёнок спрашивает; касание — сразу после.
      { at: QUIZ, clip: '3-quiz', speed: (ringSec - 0.15) / (TAP - QUIZ), xf: 0.3 },
      { at: TAP, clip: '3-quiz', from: ringSec - 0.15 },
    ];
    const parentShots = [
      // Цифры досчитывают в первые 0,7 с; прокрутка к «Повторить» — с 3 с клипа.
      { at: SEE + 0.3, clip: '3-progress' },
      { at: SEE + 1.8, clip: '3-progress', from: 1.5, speed: 1.45 / (SCROLL - SEE - 1.8) },
      { at: SCROLL, clip: '3-progress', from: 2.95 },
      { at: PLAN, clip: '3-plan', xf: 0.35 },
    ];

    const bubbles = new Bubbles(
      day,
      voice
        .filter((v) => line(v.id).voice === 'owl')
        .map((v) => ({
          from: v.at,
          to: v.at + line(v.id).sec + 0.4,
          text: line(v.id).text,
          // Под медведем на карточке пусто; в вопросе — поверх второго ответа.
          y: v.id === 'o-bear' ? 1520 : 1440,
        })),
    );

    // Камера: {s, u, v, px, py} — точку экрана (u, v) ставим в точку кадра (px, py).
    const FULL = { s: 0.5, u: 0.5, v: 0.5, px: 540, py: 1253 };
    const TOP = { s: 0.66, u: 0.5, v: 0.22, px: 540, py: 985 };
    const LEFT = { ...FULL, s: 0.4, px: 285, py: 1150 };
    const RIGHT = { ...FULL, s: 0.4, px: 800, py: 1150 };
    // Мультик — полоса посередине чёрного экрана.
    const SCREEN = { s: 0.8, u: 0.5, v: 0.5, px: 540, py: 1150 };
    // Крупные планы кабинета: верх растворяется под титром.
    const STAT = { s: 0.8, u: 0.5, v: 0.27, px: 540, py: 1080 };
    const PLANCAM = { s: 0.8, u: 0.5, v: 0.3, px: 540, py: 1100 };
    const kidCam = [
      { t: KID, ...TOP },
      { t: FOX - 0.3, ...TOP },
      { t: FOX + 0.3, ...FULL },
      { t: VIDEO, ...FULL },
      { t: VIDEO + 0.7, ...SCREEN },
      { t: QUIZ - 0.5, ...SCREEN },
      { t: QUIZ + 0.2, ...FULL },
      { t: SEE, ...FULL },
      { t: SEE + 0.6, ...LEFT },
      { t: SEE + 1.4, ...LEFT },
      { t: SEE + 2, ...LEFT, px: -700 },
    ];
    const parentCam = [
      { t: SEE, ...RIGHT, px: 1800 },
      { t: SEE + 0.6, ...RIGHT },
      { t: SEE + 1.4, ...RIGHT },
      { t: SEE + 2, ...STAT },
      { t: PLAN - 0.2, ...STAT },
      { t: PLAN + 0.3, ...PLANCAM },
      { t: CTA - 0.2, ...PLANCAM },
      { t: CTA + 0.5, ...PLANCAM, py: 2900 },
    ];

    const render = (t) => {
      // Вступление
      const off = feedAt(t);
      const speed = (feedAt(t + 1 / 60) - off) * 60;
      style(list, {
        transform: `translateY(${-off}px)`,
        filter: speed > 150 ? `blur(${Math.min(16, speed / 350)}px)` : 'none',
      });
      const s = watched(t);
      counterText.textContent = hms(s);
      counterText.style.color = t > 2.1 ? 'var(--coral)' : '';
      const mins = 17 * 60 + 35 + Math.floor(s / 60);
      clockText.textContent = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
      const beat = t > 2.1 ? 1 + 0.05 * Math.sin((t - 2.1) * 9) : 1;
      pop(counter, t, 0.1, Infinity, { pre: `translateX(-50%) scale(${beat})` });
      feedPhone.place({
        ...FULL,
        py: 1290,
        s: lerp(0.5, 0.53, ease.out(prog(t, 0, STOP))) - 0.04 * ease.inOut(prog(t, 2.3, 3)),
      });
      dim.style.opacity = String(0.6 * ease.inOut(prog(t, 2.3, 2.9)));
      puffs.forEach((p, i) => pop(p, t, 2.95 + i * 0.08, Infinity, { dy: 0, scale: 0.2 }));
      pop(think, t, 3.15, Infinity, { dy: 30, scale: 0.6 });
      pop(thinkWord, t, EMPTY, Infinity, { dy: 20, scale: 0.9 });
      for (const c of nightCaps) c.render(t);
      night.style.display = t > REVEAL + 0.65 ? 'none' : '';

      // Раскрытие дня
      const r = 2200 * ease.inOut(prog(t, REVEAL, REVEAL + 0.6));
      day.style.clipPath = t < REVEAL + 0.6 ? `circle(${r}px at 540px 1253px)` : 'none';
      day.style.display = t < REVEAL ? 'none' : '';

      // Телефоны
      const kidAt = keys(kidCam, t);
      kid.place(kidAt);
      kid.show(shotAt(kidShots, t));
      kid.root.style.display = t > SEE + 2 ? 'none' : '';
      const parentAt = keys(parentCam, t);
      parent.place(parentAt);
      parent.show(shotAt(parentShots, t));
      parent.root.style.display = t < SEE || t > CTA + 0.5 ? 'none' : '';

      pop(videoChip, t, VIDEO + 2.1, quizAt, { pre: 'translateX(-50%)' });
      // 89 % верно с первой попытки
      frameOn(statMark, parentAt, [0.35, 0.2, 0.65, 0.333]);
      pop(statMark, t, SEE + 2.05, SCROLL, { dy: 0, scale: 1.1 });
      // «Повторить»: что не запомнилось и что с этим будет
      frameOn(repMark, parentAt, [0.03, 0.24, 0.97, 0.35]);
      pop(repMark, t, SCROLL + 1.5, PLAN - 0.1, { dy: 0, scale: 1.06 });
      // Тема недели: «Природа — Лесные жители»
      frameOn(planMark, parentAt, [0.04, 0.266, 0.96, 0.345]);
      pop(planMark, t, PLAN + 0.9, CTA - 0.1, { dy: 0, scale: 1.06 });

      // Призыв
      // «Кидс Плюс» звучит с CTA + 0,3.
      pop(ctaBrand, t, CTA + 0.3);
      pop(ctaOwl, t, CTA + 0.5, Infinity, { pre: `rotate(${Math.sin(t * 3) * 4}deg)`, dy: 80 });
      chips.forEach((c, i) => pop(c, t, CTA + 0.9 + i * 0.15));
      const pulse = t > CTA + 2.2 ? 1 + 0.035 * Math.sin((t - CTA - 2.2) * 5) : 1;
      pop(cta, t, CTA + 1.5, Infinity, { pre: `scale(${pulse})`, dy: 60 });

      caps.render(t);
      bubbles.render(t);
    };
    return { render, voice };
  },
};
