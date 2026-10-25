// Ролик №2 «Алгоритм подсовывает странное» (этап 48): 1080×1920, клипы снимает capture-2.mjs.
// Сцены встают под фразы озвучки (voice-2.json): переозвучка не сбивает монтаж.
import {
  Bubbles,
  Captions,
  ease,
  el,
  keys,
  lerp,
  line,
  logo,
  Phone,
  pop,
  prog,
  setSrc,
  shotAt,
  style,
} from './stage.js';

const DURATION = 48.5;

// Лента «обычного» видеоприложения: сначала мультики, потом кликбейт. Картинки — наши,
// пластилиновые; чужих кадров и логотипов в ролике нет.
const CUTE = [
  ['1f98a', '#cfe8d8', '#9fcfb2', '8:12'],
  ['1f430', '#ffe0da', '#f7b3a6', '5:40'],
  ['1f43b', '#fbe9c4', '#ecc77f', '11:03'],
  ['1f431', '#dfe5ff', '#b7c3f5', '6:27'],
];
const BAIT = [
  ['1f628', '#14002e', '#8a1cff', 'ШОК!!!', '0:59'],
  ['1f4a5', '#2b1600', '#ff8a00', 'ВЗРЫВ!!!', '3:33'],
  ['1f92a', '#4a0030', '#ff1f8f', 'ЧТО\nС НИМ?!', '1:13'],
  ['1f47d', '#001a12', '#00a344', 'СТРАШНО!', '6:06'],
  ['1f921', '#3a0000', '#ff2a2a', 'НЕ СМОТРИ\nНОЧЬЮ!', '13:13'],
  ['1f47b', '#000', '#2d3a00', 'НЕ ГОВОРИ\nМАМЕ', '0:47'],
  ['1f628', '#1a0010', '#e0004d', 'ПОВТОРИ,\nЕСЛИ\nСМОЖЕШЬ', '2:22'],
];
const CARD_H = 880;
/** Где лента останавливается: «Не смотри ночью!» вверху экрана. */
const LAND = (CUTE.length + 4) * CARD_H;

/** Прокрутка ленты в момент t: медленно, потом всё быстрее — и стоп на страшном. */
function feedAt(t) {
  if (t < 1.9) return 300 * (t / 1.9);
  return lerp(300, LAND, ease.inOut(prog(t, 1.9, 3.4)));
}

const LOCK =
  '<svg viewBox="0 0 24 24"><rect x="4.5" y="10" width="15" height="11" rx="3" fill="currentColor"/>' +
  '<path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>';

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
    const REVEAL = say('n-hook', 0.05) - 0.05;
    const KID = REVEAL + 0.1;
    const onlyAt = say('n-none', KID + 0.25) + 0.15;
    const ADD = say('n-only', onlyAt) + 0.35;
    // В клипе 2-add «ИИ смотрит видео · 1» — с 3,6 с.
    const aiAt = Math.max(say('n-link', ADD + 0.4) + 0.15, ADD + 3.7);
    const CARD = say('n-ai', aiAt) + 0.15;
    // Карточка в 2-card с 0,9 с, «Посмотреть» — на 2,2 с; в отчёте прокрутка быстрее.
    const REPORT = CARD + 2;
    const AGES = REPORT + 0.8;
    const QUEST = AGES + 1.8;
    const partAt = say('n-age', CARD + 0.3) + 0.35;
    const askAt = Math.max(say('n-part', partAt) + 0.2, QUEST + 1.7);
    const APPROVE = say('o-ask', askAt) + 0.4;
    // «Одобрить» в 2-approve — на 1,1 с; «…и мультик уже у ребёнка» — через 1 с фразы.
    const okAt = APPROVE + 0.95;
    const KIDNEW = okAt + 1;
    const kioskAt = say('n-approve', okAt) + 0.3;
    const KIOSK = kioskAt - 0.2;
    const NICK = say('n-kiosk', kioskAt) + 0.2;
    const CTA = say('n-name', NICK + 0.7) + 0.15;
    const end = say('n-cta', say('n-trust', CTA + 0.3) + 0.2);
    if (end > DURATION - 0.8) throw new Error(`озвучка не влезает: ${end.toFixed(2)} с`);

    // ── Вступление: лента, которая сама уводит от мультиков ──
    const night = el(stage, 'div', 'layer night');
    const glow = el(night, 'div', 'glow');
    const feedPhone = new Phone(night);
    const screen = feedPhone.a.parentElement;
    feedPhone.a.remove();
    feedPhone.b.remove();
    const feed = el(screen, 'div', 'feed');
    const list = el(feed, 'div', 'feed-list');
    /** Карточка ленты: заставка (фон, картинка, надписи) и серые строки названия. */
    const card = (cls, [a, b], img, html) => {
      const c = el(list, 'div', 'feed-card');
      const thumb = el(c, 'div', `feed-thumb ${cls}`);
      thumb.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      setSrc(el(thumb, 'img'), img);
      thumb.insertAdjacentHTML('beforeend', html);
      el(
        c,
        'div',
        'feed-meta',
        `<span class="ava" style="background:${b}"></span>` +
          '<div class="lines"><i></i><i style="width:62%"></i></div>',
      );
    };
    for (const [code, a, b, dur] of CUTE)
      card('', [a, b], `/landing/img/kid/${code}.webp`, `<span class="dur">${dur}</span>`);
    for (const [code, a, b, bait, dur] of BAIT)
      card(
        'bait',
        [a, b],
        `/promo/img/${code}.webp`,
        `<span class="loop"></span><span class="say">${bait}</span><span class="dur">${dur}</span>`,
      );
    el(
      feed,
      'div',
      'feed-head',
      '<div class="bar"><span>17:35</span><span>100%</span></div><div class="search">Поиск</div>',
    );
    const warn = el(night, 'div', 'warn', '!');
    const nightCaps = [
      new Captions(night, [
        { from: -0.3, to: 2.4, text: 'Пять минут назад —\n*мультики*…', cls: 'light center' },
        { from: 2.4, to: REVEAL + 0.3, text: '…а теперь —\n*вот это*', cls: 'light center' },
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

    // Рамки: что может напугать, новый мультик у ребёнка, прозвище
    const flagsMark = el(day, 'div', 'mark');
    const newMark = el(day, 'div', 'mark');
    const nickMark = el(day, 'div', 'mark');

    // Киоск: как закрыт выход на Android и на iPhone
    const kioskChips = ['Android — киоск', 'iPhone — «Гид-доступ»'].map((text, i) => {
      const chip = el(day, 'div', 'chip', `${LOCK}${text}`);
      style(chip, { left: '540px', top: `${1330 + i * 112}px` });
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

    const caps = new Captions(day, [
      { from: KID + 0.35, to: onlyAt - 0.1, text: 'Ни ленты, ни поиска,\nни *рекомендаций*' },
      { from: onlyAt - 0.1, to: ADD - 0.2, text: 'Только мультики,\nкоторые *выбрали вы*' },
      { from: ADD + 0.3, to: aiAt - 0.1, text: 'Нашли мультик —\n*вставьте ссылку*' },
      { from: aiAt - 0.1, to: CARD + 0.2, text: 'ИИ посмотрит его *целиком*' },
      { from: CARD + 0.2, to: partAt - 0.1, text: 'Для какого возраста\nи *что может напугать*' },
      { from: partAt - 0.1, to: APPROVE - 0.1, text: '*Полезный кусок*\nи вопросы после него' },
      { from: okAt - 0.1, to: kioskAt - 0.1, text: 'Одобрили — и мультик\n*уже у ребёнка*' },
      { from: kioskAt - 0.1, to: NICK - 0.1, text: 'Из приложения\n*не выйти*' },
      { from: NICK + 0.6, to: CTA - 0.1, text: 'Вместо имени —\n*прозвище*' },
      { from: CTA + 1, to: 61, text: 'Только то,\nчто *выбрали вы*', cls: 'center' },
    ]);

    const kidShots = [
      { at: KID, clip: '2-kid' },
      // Ёжик уже в списке: с момента, когда открылись видео.
      { at: KIDNEW, clip: '2-kid-new', from: 2.3 },
    ];
    const parentShots = [
      { at: ADD, clip: '2-add' },
      { at: CARD, clip: '2-card', from: 0.9, xf: 0.3 },
      { at: REPORT, clip: '2-report', from: 0.3, speed: 1.5 },
      { at: AGES, clip: '2-report', from: 1.5 },
      { at: QUEST, clip: '2-report', from: 3.9 },
      { at: APPROVE, clip: '2-approve', xf: 0.3 },
      // Профиль: «Изменить» — на 1,1 с клипа, когда телефон уже въехал.
      { at: NICK + 0.2, clip: '2-nickname' },
    ];

    const bubbles = new Bubbles(
      day,
      voice
        .filter((v) => line(v.id).voice === 'owl')
        .map((v) => ({
          from: v.at,
          to: v.at + line(v.id).sec + 0.5,
          text: line(v.id).text,
          y: 1440,
        })),
    );

    // Камера: {s, u, v, px, py} — точку экрана (u, v) ставим в точку кадра (px, py).
    const FULL = { s: 0.5, u: 0.5, v: 0.5, px: 540, py: 1253 };
    const TOP = { s: 0.66, u: 0.5, v: 0.22, px: 540, py: 985 };
    const LEFT = { ...FULL, s: 0.4, px: 285, py: 1150 };
    const RIGHT = { ...FULL, s: 0.4, px: 800, py: 1150 };
    // Крупные планы кабинета: верх растворяется под титром.
    const LINK = { s: 0.85, u: 0.5, v: 0.2, px: 540, py: 1000 };
    const LIST = { s: 0.8, u: 0.5, v: 0.33, px: 540, py: 1100 };
    const AGE = { s: 0.8, u: 0.5, v: 0.5, px: 540, py: 1150 };
    const OK = { s: 0.75, u: 0.5, v: 0.25, px: 540, py: 1000 };
    const NAME = { s: 0.85, u: 0.5, v: 0.15, px: 540, py: 900 };
    const kidCam = [
      { t: KID, ...TOP },
      { t: ADD - 0.6, ...TOP },
      { t: ADD, ...TOP, px: -700 },
      { t: ADD + 0.01, ...RIGHT, px: 1800 },
      { t: KIDNEW, ...RIGHT, px: 1800 },
      { t: KIDNEW + 0.6, ...RIGHT },
      { t: KIOSK, ...RIGHT },
      { t: KIOSK + 0.6, ...FULL },
      { t: NICK - 0.1, ...FULL },
      { t: NICK + 0.5, ...FULL, px: -700 },
    ];
    const parentCam = [
      { t: ADD - 0.6, ...LINK, px: 1800 },
      { t: ADD, ...LINK },
      { t: CARD - 0.2, ...LINK },
      { t: CARD + 0.4, ...LIST },
      { t: AGES - 0.1, ...LIST },
      { t: AGES + 0.5, ...AGE },
      { t: QUEST, ...AGE },
      { t: QUEST + 1.4, ...LIST },
      { t: APPROVE - 0.1, ...LIST },
      { t: APPROVE + 0.4, ...OK },
      { t: KIDNEW, ...OK },
      { t: KIDNEW + 0.6, ...LEFT },
      { t: KIOSK, ...LEFT },
      { t: KIOSK + 0.6, ...LEFT, px: -700 },
      { t: KIOSK + 0.61, ...NAME, px: 1800 },
      { t: NICK - 0.1, ...NAME, px: 1800 },
      { t: NICK + 0.5, ...NAME },
      { t: CTA - 0.2, ...NAME },
      { t: CTA + 0.5, ...NAME, py: 2900 },
    ];

    const render = (t) => {
      // Вступление
      const off = feedAt(t);
      const speed = (feedAt(t + 1 / 60) - off) * 60;
      style(list, {
        transform: `translateY(${-off}px)`,
        filter: speed > 150 ? `blur(${Math.min(16, speed / 350)}px)` : 'none',
      });
      const hit = prog(t, 3.35, 3.9);
      const shake = hit > 0 && hit < 1 ? Math.sin(t * 70) * 12 * (1 - hit) : 0;
      feedPhone.place({ ...FULL, px: 540 + shake, s: 0.5 + 0.02 * ease.out(prog(t, 0, 3.4)) });
      glow.style.opacity = String(0.9 * ease.out(prog(t, 3.2, 3.8)));
      const beat = t > 3.9 ? 1 + 0.06 * Math.sin((t - 3.9) * 9) : 1;
      pop(warn, t, 3.45, Infinity, { pre: `scale(${beat})`, dy: 0, scale: 0.3 });
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
      kid.root.style.display = t > ADD && t < KIDNEW ? 'none' : t > NICK + 0.5 ? 'none' : '';
      const parentAt = keys(parentCam, t);
      parent.place(parentAt);
      parent.show(shotAt(parentShots, t));
      const away = t > KIOSK + 0.6 && t < NICK - 0.1;
      parent.root.style.display = t < ADD - 0.6 || t > CTA + 0.5 || away ? 'none' : '';

      // «Тревожные моменты» в отчёте
      frameOn(flagsMark, parentAt, [0.03, 0.585, 0.97, 0.72]);
      pop(flagsMark, t, AGES + 0.3, QUEST, { dy: 0, scale: 1.06 });
      // Ёжик у ребёнка
      frameOn(newMark, kidAt, [0.04, 0.383, 0.479, 0.496]);
      pop(newMark, t, KIDNEW + 0.7, NICK - 0.1, { dy: 0, scale: 1.15 });
      // Прозвище в профиле
      frameOn(nickMark, parentAt, [0.02, 0.085, 0.98, 0.19]);
      pop(nickMark, t, NICK + 1.9, CTA - 0.1, { dy: 0, scale: 1.06 });

      kioskChips.forEach((c, i) =>
        pop(c, t, kioskAt + 0.9 + i * 0.35, NICK - 0.1, { pre: 'translateX(-50%)' }),
      );

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
