// Ролик №5 «Вы на работе» (этап 48): 1080×1920, клипы снимает capture-5.mjs.
// «Пульт» мамы и телефон Зайки рядом: что делает сейчас, день по порядку, «Позвать», обед.
// Сцены встают под фразы озвучки (voice-5.json).
import {
  Captions,
  clipSec,
  ease,
  el,
  keys,
  line,
  logo,
  Phone,
  pop,
  prog,
  setSrc,
  shotAt,
  style,
} from './stage.js';

const DURATION = 35.5;

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
    const hookEnd = say('n-hook', 0.1);
    // «А чем сейчас занят ребёнок?» — вторая фраза вступления.
    const ASK = 0.1 + line('n-hook').sec * 0.4;
    const UP = hookEnd + 0.1;
    const LIVE = UP + 0.35;
    const liveEnd = say('n-live', LIVE);
    // Телефон Зайки въезжает на «Зайка на английском».
    const KID = LIVE + line('n-live').sec * 0.4;
    const LOG = liveEnd + 0.35;
    const CALL = say('n-log', LOG) + 0.3;
    const callEnd = say('n-call', CALL);
    // Касание «Позвать» — на «…и совёнок позовёт»; у Зайки «Тебя зовут!» — следом.
    const CALL_TAP = callEnd - 0.75;
    const CALLED = callEnd - 0.25;
    const REST = say('o-call', callEnd + 0.15) + 0.35;
    const restEnd = say('n-rest', REST);
    const REST_TAP = restEnd - 0.75;
    const RESTED = restEnd - 0.25;
    const CTA = say('o-eat', restEnd + 0.15) + 0.4;
    const end = say('n-cta', say('n-trust', CTA + 0.3) + 0.2);
    if (end > DURATION - 0.8) throw new Error(`озвучка не влезает: ${end.toFixed(2)} с`);

    // ── Фон ──
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

    // ── Вступление: рабочий стол ──
    const desk = el(day, 'div', 'layer');
    const laptop = el(desk, 'img', 'owl');
    setSrc(laptop, '/promo/img/1f4bb.webp');
    style(laptop, { left: '200px', top: '760px', width: '680px', height: '680px' });
    const cup = el(desk, 'img', 'owl');
    setSrc(cup, '/promo/img/2615.webp');
    style(cup, { left: '700px', top: '1160px', width: '300px', height: '300px' });
    const ask = el(desk, 'div', 'ask', '?');
    style(ask, { left: '577px', top: '975px' });

    const phones = el(day, 'div', 'layer phones');
    const kid = new Phone(phones);
    const parent = new Phone(phones);
    const tags = ['Мама', 'Зайка'].map((text) => el(day, 'div', 'chip', text));
    const heroMark = el(day, 'div', 'mark');

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
      { from: 0.1, to: ASK, text: 'Вы на *работе*.', cls: 'center' },
      { from: ASK, to: UP + 0.3, text: 'А чем занят\n*ребёнок*?', cls: 'center' },
      { from: LIVE + 0.2, to: LOG - 0.1, text: 'Что делает —\n*прямо сейчас*' },
      { from: LOG - 0.1, to: CALL - 0.1, text: 'Весь день —\n*по порядку*' },
      { from: CALL - 0.1, to: REST - 0.1, text: 'Позвать —\n*одно касание*' },
      { from: REST - 0.1, to: CTA - 0.1, text: 'Экран гаснет —\n*совёнок объяснит*' },
      { from: CTA + 1, to: 61, text: 'Спокойно —\n*даже на работе*', cls: 'center' },
    ]);

    // Клипы. 5-remote: «Пульт» 0–3 с, прокрутка к дню 3–4,2, к журналу 5,8–6,8, назад 8,8–9,8.
    // 5-call: касание «Позвать» на 0,5 с; 5-rest: «Пора кушать» на 1,2 с.
    const kidShots = [
      { at: KID, clip: '5-kid' },
      // Зайка листает карточки, пока мама зовёт и выключает экран.
      { at: CALLED, clip: '5-called', xf: 0.3 },
      { at: REST - 0.2, clip: '5-kid', from: clipSec('5-kid'), xf: 0.3 },
      { at: RESTED, clip: '5-kid-rest', xf: 0.3 },
    ];
    const parentShots = [
      // Верх «Пульта» стоит, пока звучит n-live.
      { at: UP, clip: '5-remote', speed: 2.9 / (LOG - UP) },
      { at: LOG, clip: '5-remote', from: 3, speed: 5.8 / (CALL - LOG) },
      { at: CALL, clip: '5-remote', from: 8.8, speed: 1.6 / (CALL_TAP - 0.6 - CALL) },
      { at: CALL_TAP - 0.5, clip: '5-call' },
      { at: REST_TAP - 1.2, clip: '5-rest' },
    ];

    // Камера: {s, u, v, px, py} — точку экрана (u, v) ставим в точку кадра (px, py).
    const FULL = { s: 0.5, u: 0.5, v: 0.5, px: 540, py: 1253 };
    const LEFT = { ...FULL, s: 0.4, px: 285, py: 1150 };
    const TOP = { s: 0.66, u: 0.5, v: 0.22, px: 540, py: 985 };
    const RIGHT = { ...FULL, s: 0.4, px: 800, py: 1150 };
    // День и журнал — крупнее, низ телефона за кадром.
    const LOGCAM = { s: 0.62, u: 0.5, v: 0.32, px: 540, py: 1060 };
    const parentCam = [
      { t: UP, ...FULL, py: 2900 },
      { t: UP + 0.65, ...FULL },
      { t: UP + 0.9, ...FULL },
      { t: UP + 1.5, ...TOP },
      { t: KID, ...TOP },
      { t: KID + 0.6, ...LEFT },
      { t: LOG - 0.2, ...LEFT },
      { t: LOG + 0.4, ...LOGCAM },
      { t: CALL - 0.3, ...LOGCAM },
      { t: CALL + 0.35, ...LEFT },
      { t: CTA - 0.2, ...LEFT },
      { t: CTA + 0.5, ...LEFT, py: 2900 },
    ];
    const kidCam = [
      { t: KID, ...RIGHT, px: 1800 },
      { t: KID + 0.6, ...RIGHT },
      { t: LOG - 0.2, ...RIGHT },
      { t: LOG + 0.4, ...RIGHT, px: 1800 },
      { t: CALL - 0.3, ...RIGHT, px: 1800 },
      { t: CALL + 0.35, ...RIGHT },
      { t: CTA - 0.2, ...RIGHT },
      { t: CTA + 0.5, ...RIGHT, py: 2900 },
    ];

    const render = (t) => {
      // Вступление: ноутбук и кофе; на «А чем…» — вопрос на экране ноутбука.
      const away = ease.in(prog(t, UP - 0.1, UP + 0.45));
      style(desk, { opacity: String(1 - away), transform: `translateY(${away * 500}px)` });
      desk.style.display = t > UP + 0.5 ? 'none' : '';
      pop(laptop, t, 0, Infinity, { pre: `translateY(${Math.sin(t * 2) * 8}px)`, dy: 80 });
      pop(cup, t, 0.25, Infinity, { dy: 60 });
      const beat = 1 + 0.06 * Math.sin(Math.max(0, t - ASK) * 7);
      pop(ask, t, ASK + 0.1, Infinity, { pre: `translate(-50%, -50%) scale(${beat})`, scale: 0.4 });

      // Телефоны
      const parentAt = keys(parentCam, t);
      parent.place(parentAt);
      parent.show(shotAt(parentShots, t));
      parent.root.style.display = t < UP || t > CTA + 0.5 ? 'none' : '';
      const kidAt = keys(kidCam, t);
      kid.place(kidAt);
      kid.show(shotAt(kidShots, t));
      kid.root.style.display =
        t < KID || (t > LOG + 0.4 && t < CALL - 0.3) || t > CTA + 0.5 ? 'none' : '';

      // Подписи над телефонами, когда они рядом.
      const both = (from, to) => [from, to];
      [
        [parentAt, [both(KID + 0.5, LOG - 0.1), both(CALL + 0.3, CTA - 0.1)]],
        [kidAt, [both(KID + 0.5, LOG - 0.1), both(CALL + 0.3, CTA - 0.1)]],
      ].forEach(([p, spans], i) => {
        const top = Phone.point(p, 0.5, 0);
        const [from, to] = spans.find(([, b]) => t < b) ?? spans.at(-1);
        style(tags[i], { left: `${top.x}px`, top: `${top.y - 100}px` });
        pop(tags[i], t, from, to, { pre: 'translateX(-50%)', dy: 20 });
      });

      // «Английский · «Фрукты»» и кольцо: что сейчас и сколько осталось.
      frameOn(heroMark, parentAt, [0.03, 0.165, 0.97, 0.39]);
      pop(heroMark, t, UP + 0.9, LOG - 0.2, { dy: 0, scale: 1.08 });

      // Призыв: «Кидс Плюс» звучит с CTA + 0,3.
      pop(ctaBrand, t, CTA + 0.3);
      pop(ctaOwl, t, CTA + 0.5, Infinity, { pre: `rotate(${Math.sin(t * 3) * 4}deg)`, dy: 80 });
      chips.forEach((c, i) => pop(c, t, CTA + 0.9 + i * 0.15));
      const pulse = t > CTA + 2.2 ? 1 + 0.035 * Math.sin((t - CTA - 2.2) * 5) : 1;
      pop(cta, t, CTA + 1.5, Infinity, { pre: `scale(${pulse})`, dy: 60 });

      caps.render(t);
    };
    return { render, voice };
  },
};
