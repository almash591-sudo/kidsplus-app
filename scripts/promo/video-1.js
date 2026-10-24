// Ролик №1 «Мультик на 5 минут» (этап 48): 60 с, 1080×1920, клипы снимает capture-1.mjs.
// Время сцен считается от реплик голоса в meta.json — пересъёмка не сбивает монтаж.
import {
  Bubbles,
  Captions,
  clipSec,
  clipUrl,
  ease,
  el,
  keys,
  logo,
  Phone,
  pop,
  prog,
  said,
  setSrc,
  shotAt,
  style,
  voiceOver,
} from './stage.js';

function clockText(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const R = 300;
const C = 2 * Math.PI * R;
const LAP = 2 * Math.PI * 252;

/** Касание «+10» в «Пульте»: секунда клипа (палец на кнопке) и место на экране. */
const PLUS10 = { sec: 2.5, u: 0.29, v: 0.522 };

export default {
  duration: 60,
  async build(stage) {
    // ── Сцены: где на ролике и с какой секунды клипа ──
    const lesson = said('1-lesson');
    const ask = lesson.findIndex((s) => s.text.startsWith('Где'));
    const quizFrom = lesson[ask].sec - 0.5;
    const answered = lesson.find((s, i) => i > ask && s.text.startsWith('Это ')).sec + 1.1;
    const stickFrom = said('1-lesson', 'Отлично')[0].sec - 0.6;
    const doneFrom = said('1-done').at(-1).sec - 2.2;
    const memFrom = said('1-free', 'Открывай')[0].sec + 1.2;
    const overFrom = said('1-dayover', 'На сегодня всё')[0].sec - 1.8;

    const TODAY = 6.6;
    const LESSON = TODAY + clipSec('1-today');
    const QUIZ = LESSON + 4.2;
    const STICK = QUIZ + answered - quizFrom;
    const DONE = STICK + 3.8;
    const FREE = DONE + 3.6;
    const FREE2 = FREE + 3.6;
    const DAYOVER = FREE2 + 5;
    const PARENT = DAYOVER + 5.6;
    const TOOLS = PARENT + 3.6;
    const BOTH = TOOLS + 3.4;
    const TAP = BOTH + 1.6;
    const CTA = TAP + 3.4;

    // ── Ночь: часы «5 минут» убегают в час ──
    const night = el(stage, 'div', 'layer night');
    const clock = el(night, 'div', 'clock');
    clock.innerHTML = `<svg viewBox="0 0 700 700">
      <circle cx="350" cy="350" r="${R}" fill="none" stroke="rgb(250 246 238 / .1)" stroke-width="30"/>
      <circle class="arc" cx="350" cy="350" r="${R}" fill="none" stroke-width="30" stroke-linecap="round"
        stroke-dasharray="${C}" transform="rotate(-90 350 350)"/>
      <circle class="lap" cx="350" cy="350" r="252" fill="none" stroke-width="14" stroke-linecap="round"
        stroke="rgb(255 107 91 / .55)" stroke-dasharray="${LAP}" transform="rotate(-90 350 350)"/>
    </svg><div class="time"><span></span><small>мультик на 5 минут</small></div>`;
    const arc = clock.querySelector('.arc');
    const lap = clock.querySelector('.lap');
    const time = clock.querySelector('.time span');
    const nightCaps = [
      new Captions(night, [
        { from: -0.6, to: 9, text: 'Включили мультик\n*на 5 минут*…', cls: 'light center' },
      ]),
      new Captions(night, [
        { from: 1.9, to: 9, text: '…а прошёл *час?*', cls: 'light center', top: 1330 },
      ]),
    ];

    // ── День: раскрывается кругом из часов ──
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

    const owl = el(day, 'img', 'owl');
    setSrc(owl, '/landing/img/owl/wave.webp');
    style(owl, { left: '320px', top: '560px' });
    const brand = el(day, 'div', 'brand', `${logo()}<span>KidsPlus</span>`);
    style(brand, { position: 'absolute', left: '0', right: '0', top: '1060px' });

    const parent = new Phone(day);
    const kid = new Phone(day);

    const push = el(
      day,
      'div',
      'push',
      `${logo()}<div class="app"><span>KidsPlus</span><span>сейчас</span></div>` +
        '<div class="t">Занятия на сегодня закончены</div><div class="b">Зайка: всё пройдено. Молодец!</div>',
    );
    style(push, { top: '560px' });

    // Лупа на кнопки «Пульта»: позвонить, позвать, послушать, глазами ребёнка
    const lens = el(day, 'div', 'lens');
    const lensImg = el(lens, 'img');
    const LENS = { u0: 0.02, v0: 0.585, u1: 0.98, v1: 0.83, w: 960 };
    const lensK = LENS.w / ((LENS.u1 - LENS.u0) * 1170);
    style(lens, {
      left: `${(1080 - LENS.w) / 2}px`,
      top: '980px',
      width: `${LENS.w}px`,
      height: `${(LENS.v1 - LENS.v0) * 2532 * lensK}px`,
    });
    style(lensImg, {
      transform: `scale(${lensK}) translate(${-LENS.u0 * 1170}px, ${-LENS.v0 * 2532}px)`,
    });

    const ring = el(day, 'div', 'ring');

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
      { from: 3.5, to: TODAY - 0.2, text: 'Экран, который\n*сам знает меру*', cls: 'center' },
      { from: TODAY + 0.3, to: LESSON - 0.1, text: 'Ребёнок видит *только сегодняшний день*' },
      { from: LESSON, to: QUIZ - 0.1, text: 'Сначала *смотрит* и слушает…' },
      { from: QUIZ, to: STICK - 0.1, text: '…потом *отвечает* сам' },
      { from: STICK, to: DONE - 0.1, text: 'Награда — *за знания*, а не за часы у экрана' },
      { from: DONE, to: FREE - 0.1, text: 'Три урока по 10 минут — *готово!*' },
      { from: FREE, to: DAYOVER - 0.1, text: 'Потом *свободное время* — тоже по таймеру' },
      { from: DAYOVER, to: PARENT - 0.1, text: 'Время вышло — *без слёз и уговоров*' },
      { from: PARENT + 0.2, to: TOOLS - 0.1, text: 'Мама *всё видит* — даже с работы' },
      { from: TOOLS, to: BOTH - 0.1, text: 'Позвонить, позвать, *послушать комнату*' },
      { from: BOTH, to: TAP + 0.3, text: 'Ещё 10 минут — *одним касанием*' },
      { from: TAP + 0.4, to: CTA - 0.1, text: '…и у ребёнка они *сразу* появились' },
      { from: CTA + 0.2, to: 61, text: 'Экран, которому *можно доверить* ребёнка', cls: 'center' },
    ]);

    const kidShots = [
      { at: TODAY, clip: '1-today' },
      { at: LESSON, clip: '1-lesson' },
      { at: QUIZ, clip: '1-lesson', from: quizFrom, xf: 0.25 },
      { at: STICK, clip: '1-lesson', from: stickFrom, xf: 0.25 },
      { at: DONE, clip: '1-done', from: doneFrom, xf: 0.25 },
      { at: FREE, clip: '1-free', from: 0.5, xf: 0.25 },
      { at: FREE2, clip: '1-free', from: memFrom, xf: 0.25 },
      { at: DAYOVER, clip: '1-dayover', from: overFrom, xf: 0.25 },
      { at: TAP + 0.4, clip: '1-extra', xf: 0.5 },
    ];
    const parentShots = [{ at: TAP - PLUS10.sec, clip: '1-parent' }];

    // Голос приложения — облачком; «Здорово получилось» совёнок и так говорит на экране.
    const voice = new Bubbles(
      day,
      voiceOver(kidShots.slice(0, -1), PARENT, (v) => /Здорово/.test(v.text)).map((b) => ({
        ...b,
        text: b.text.replace(' Смотрим дальше.', ''),
      })),
    );

    // Камера: {s, u, v, px, py} — точку экрана (u, v) ставим в точку кадра (px, py).
    const FULL = { s: 0.5, u: 0.5, v: 0.5, px: 540, py: 1253 };
    const TOP = { s: 0.66, u: 0.5, v: 0.22, px: 540, py: 985 };
    const LEFT = { ...FULL, s: 0.4, px: 285, py: 1150 };
    const RIGHT = { ...FULL, s: 0.4, px: 800, py: 1150 };
    const tap = said('1-today', 'Природа')[0].sec;
    const kidCam = [
      { t: TODAY - 0.4, ...TOP, py: 2600 },
      { t: TODAY + 0.5, ...TOP },
      { t: TODAY + tap - 0.1, ...TOP },
      { t: TODAY + tap + 0.8, ...FULL },
      { t: PARENT - 0.2, ...FULL },
      { t: PARENT + 0.6, ...FULL, px: -700 },
      { t: PARENT + 0.61, ...RIGHT, px: 1700 },
      { t: BOTH, ...RIGHT, px: 1700 },
      { t: BOTH + 0.7, ...RIGHT },
      { t: CTA - 0.2, ...RIGHT },
      { t: CTA + 0.5, ...RIGHT, py: 2900 },
    ];
    const parentCam = [
      { t: PARENT - 0.2, ...FULL, px: 1800 },
      { t: PARENT + 0.6, ...FULL },
      { t: BOTH, ...FULL },
      { t: BOTH + 0.7, ...LEFT },
      { t: CTA - 0.2, ...LEFT },
      { t: CTA + 0.5, ...LEFT, py: 2900 },
    ];

    return (t) => {
      // Ночь
      const k = prog(t, 0.4, 2.8);
      const elapsed = (3720 * (Math.exp(4 * k) - 1)) / (Math.exp(4) - 1);
      const p = elapsed / 300;
      const over = p >= 1;
      time.textContent = clockText(elapsed);
      time.style.color = over ? '#ff8a7d' : '';
      arc.setAttribute('stroke', over ? 'var(--coral)' : 'var(--gold)');
      arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, p))));
      lap.setAttribute('stroke-dashoffset', String(LAP * (1 - (over ? p % 1 : 0))));
      const shake = over ? Math.sin(t * 60) * 4 * (1 - prog(t, 2.8, 3.2)) : 0;
      style(clock, {
        transform: `translateX(${shake}px) scale(${1 + 0.04 * ease.out(prog(t, 0, 3))})`,
      });
      for (const c of nightCaps) c.render(Math.min(t, 3.2));
      night.style.display = t > 3.7 ? 'none' : '';

      // Раскрытие дня
      const r = 1500 * ease.inOut(prog(t, 3.05, 3.65));
      day.style.clipPath = t < 3.65 ? `circle(${r}px at 540px 910px)` : 'none';

      // Бренд
      pop(owl, t, 3.45, TODAY + 0.1, { pre: `translateY(${Math.sin(t * 3) * 10}px)`, dy: 80 });
      pop(brand, t, 3.75, TODAY + 0.1);

      // Телефоны
      const kidAt = keys(kidCam, t);
      kid.place(kidAt);
      kid.show(shotAt(kidShots, t));
      kid.root.style.display = t < TODAY - 0.4 || t > CTA + 0.5 ? 'none' : '';
      const parentAt = keys(parentCam, t);
      parent.place(parentAt);
      parent.show(shotAt(parentShots, t));
      parent.root.style.display = t < PARENT - 0.2 || t > CTA + 0.5 ? 'none' : '';
      pop(push, t, PARENT + 0.5, TOOLS - 0.1, { dy: -80, scale: 0.95 });

      setSrc(lensImg, clipUrl('1-parent', 0));
      pop(lens, t, TOOLS + 0.1, BOTH + 0.1, { scale: 0.7 });

      const tapAt = Phone.point(parentAt, PLUS10.u, PLUS10.v);
      const kt = prog(t, TAP - 0.1, TAP + 0.5);
      style(ring, {
        left: `${tapAt.x}px`,
        top: `${tapAt.y}px`,
        opacity: String(kt > 0 && kt < 1 ? 1 - ease.in(kt) : 0),
        transform: `scale(${0.5 + kt})`,
      });

      // Призыв
      pop(ctaBrand, t, CTA + 0.5);
      pop(ctaOwl, t, CTA + 0.7, Infinity, { pre: `rotate(${Math.sin(t * 3) * 4}deg)`, dy: 80 });
      chips.forEach((c, i) => pop(c, t, CTA + 1.1 + i * 0.15));
      const pulse = t > CTA + 2.2 ? 1 + 0.035 * Math.sin((t - CTA - 2.2) * 5) : 1;
      pop(cta, t, CTA + 1.5, Infinity, { pre: `scale(${pulse})`, dy: 60 });

      caps.render(t);
      voice.render(t);
    };
  },
};
