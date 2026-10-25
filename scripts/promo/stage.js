// Промо-ролики (этап 48): монтажный стол. Ролик — функция времени: render(t) расставляет
// телефоны, титры и реплики для момента t; render.mjs снимает кадр за кадром и отдаёт ffmpeg.
export const FPS = 30;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Доля пути от a до b, 0…1. */
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const ease = {
  in: (k) => k ** 3,
  out: (k) => 1 - (1 - k) ** 3,
  inOut: (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  /** С перелётом, как --spring на лендинге. */
  back: (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
};

/** Ключевые кадры [{ t, x: …, y: … }] → значения в момент t (плавно между соседними). */
export function keys(list, t, curve = ease.inOut) {
  if (t <= list[0].t) return list[0];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    if (t > b.t) continue;
    const k = curve(prog(t, a.t, b.t));
    const out = {};
    for (const key of Object.keys(b))
      out[key] = typeof b[key] === 'number' ? lerp(a[key] ?? b[key], b[key], k) : b[key];
    return out;
  }
  return list.at(-1);
}

export function el(parent, tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent.append(e);
  return e;
}

let logoId = 0;
/** Логотип лендинга: золотой квадрат с плюсом. */
export function logo() {
  const id = `lg${++logoId}`;
  return `<svg viewBox="0 0 40 40"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7c98e"/><stop offset="1" stop-color="#b98a43"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#${id})"/><path d="M20 11v18M11 20h18" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg>`;
}

/** Картинки, которые кадр ждёт перед снимком. */
const pending = [];
export function setSrc(img, url) {
  if (img.dataset.src === url) return;
  img.dataset.src = url;
  img.src = url;
  pending.push(img.decode().catch(() => {}));
}

export function style(e, s) {
  for (const [k, v] of Object.entries(s)) e.style[k] = v;
}

/** Появиться с пружинкой в from и уйти к to; pre — сдвиг до анимации (например, центровка). */
export function pop(e, t, from, to = Infinity, { dy = 40, scale = 0.85, pre = '' } = {}) {
  const k = prog(t, from, from + 0.45);
  const out = to === Infinity ? 0 : prog(t, to - 0.3, to);
  const o = clamp(k * 2.5) * (1 - out);
  style(e, {
    opacity: String(o),
    visibility: o <= 0 ? 'hidden' : 'visible',
    transform: `${pre} translateY(${(1 - ease.back(k)) * dy - out * dy * 0.5}px) scale(${lerp(scale, 1, ease.back(k))})`,
  });
}

// ── Клипы ──

/** Длина клипа, с. */
export const clipSec = (name) => window.CLIPS[name].frames / FPS;

/** Кадр клипа через sec секунд после from (за концом — последний кадр). */
export function clipUrl(name, sec, { from = 0, speed = 1 } = {}) {
  const frames = window.CLIPS[name].frames;
  const n = clamp(1 + Math.round((from + sec * speed) * FPS), 1, frames);
  return `/clips/${name}/${String(n).padStart(6, '0')}.jpg`;
}

/** Фраза озвучки ролика: { text, voice, sec } — sec без тишины в конце (меряет render.mjs). */
export const line = (id) => window.VOICE[id];

/** Что сказал голос в клипе: [{ sec, lang, text }] (по meta.json съёмки). */
export function said(name, part = '') {
  return window.CLIPS[name].said
    .map((s) => {
      const [, lang, text] = /^([a-z]{2})-[A-Z]{2}: (.*)$/s.exec(s.text) ?? [null, '', s.text];
      return { sec: (s.frame - 1) / FPS, lang, text };
    })
    .filter((s) => s.text.includes(part));
}

/**
 * Реплики голоса на ролике по монтажу shotAt: что звучит в показанных кусках клипов
 * (по-русски, одна реплика на момент). skip — реплики, которые не нужны.
 */
export function voiceOver(shots, end, skip = () => false) {
  const out = [];
  shots.forEach((s, i) => {
    const until = shots[i + 1]?.at ?? end;
    const from = s.from ?? 0;
    for (const v of said(s.clip)) {
      const t = s.at + v.sec - from;
      if (v.lang !== 'ru' || t < s.at || t >= until - 0.3 || skip(v, s)) continue;
      if (out.length && t - out.at(-1).from < 0.1) continue;
      if (out.length) out.at(-1).to = Math.min(out.at(-1).to, t - 0.05);
      out.push({ from: t, to: Math.min(t + 2.4, until), text: v.text });
    }
  });
  return out;
}

/**
 * Монтаж экрана телефона: [{ at, clip, from, speed, xf }] — с момента at идёт клип с секунды
 * from; xf — секунды наплыва с предыдущего плана.
 */
export function shotAt(list, t) {
  let i = list.length - 1;
  while (i > 0 && t < list[i].at) i--;
  const cur = list[i];
  const url = (s) => clipUrl(s.clip, t - s.at, s);
  const prev = list[i - 1];
  const local = t - cur.at;
  if (prev && cur.xf && local < cur.xf) return { a: url(prev), b: url(cur), mix: local / cur.xf };
  return { a: url(cur), b: null, mix: 0 };
}

// ── Телефон ──

const BEZEL = 40;
const SCREEN_W = 1170;
const SCREEN_H = 2532;

/** Левый верхний угол телефона: по центру (cx, cy) или точкой экрана (u, v) в точку (px, py). */
function corner({ s, cx, cy, u, v, px, py }) {
  return {
    x: u === undefined ? cx - ((SCREEN_W + 2 * BEZEL) * s) / 2 : px - (BEZEL + u * SCREEN_W) * s,
    y: v === undefined ? cy - ((SCREEN_H + 2 * BEZEL) * s) / 2 : py - (BEZEL + v * SCREEN_H) * s,
  };
}

export class Phone {
  constructor(parent) {
    this.root = el(parent, 'div', 'phone');
    const screen = el(this.root, 'div', 'screen');
    this.a = el(screen, 'img');
    this.b = el(screen, 'img');
  }

  /**
   * Положение: центр (cx, cy) и масштаб s — или точка экрана (u, v ∈ 0…1) в точку кадра
   * (px, py): так камера «наезжает» на нужное место. o — прозрачность.
   */
  place(p) {
    const { x, y } = corner(p);
    const o = p.o ?? 1;
    style(this.root, {
      transform: `translate(${x}px, ${y}px) scale(${p.s})`,
      opacity: String(o),
      display: o <= 0 ? 'none' : '',
    });
  }

  /** Точка экрана (u, v) в координатах кадра при положении p. */
  static point(p, u, v) {
    const { x, y } = corner(p);
    return { x: x + (BEZEL + u * SCREEN_W) * p.s, y: y + (BEZEL + v * SCREEN_H) * p.s };
  }

  /** Кадр экрана; при наплыве — два кадра. */
  show({ a, b, mix }) {
    setSrc(this.a, a);
    if (b) setSrc(this.b, b);
    style(this.b, { opacity: b ? String(mix) : '0' });
  }
}

// ── Титры и реплики ──

/** «Текст *с выделением*» → слова-спаны; \n — перенос строки. */
function words(text) {
  const out = [];
  let em = false;
  for (const line of text.split('\n')) {
    if (out.length) out.push('<br>');
    for (const raw of line.split(' ')) {
      // Звёздочка может стоять и посреди слова: «*час?*», «минут*…».
      const html = raw
        .split('*')
        .map((part, i) => {
          if (i) em = !em;
          return part && em ? `<em>${part}</em>` : part;
        })
        .join('');
      out.push(`<span class="w">${html} </span>`);
    }
  }
  return out.join('');
}

/** Титры по очереди: [{ from, to, text, cls, top }] — слова выезжают, в конце титр уходит. */
export class Captions {
  constructor(parent, list) {
    this.list = list;
    this.root = el(parent, 'div', 'cap');
    this.cur = null;
  }

  render(t) {
    const c = this.list.find((x) => t >= x.from && t < x.to) ?? null;
    if (c !== this.cur) {
      this.cur = c;
      this.root.className = `cap ${c?.cls ?? ''}`;
      this.root.innerHTML = c ? words(c.text) : '';
      this.root.style.top = `${c?.top ?? 300}px`;
    }
    if (!c) return;
    const out = c.to - t < 0.35 ? prog(t, c.to - 0.35, c.to) : 0;
    [...this.root.querySelectorAll('.w')].forEach((w, i) => {
      const k = prog(t, c.from + i * 0.06, c.from + i * 0.06 + 0.5);
      style(w, {
        opacity: String(clamp(k * 2) * (1 - out)),
        transform: `translateY(${(1 - ease.back(k)) * 60 - out * 40}px)`,
      });
    });
  }
}

/** Реплики голоса: [{ from, to, text, y, owl }] — облачко с совёнком, по центру кадра. */
export class Bubbles {
  constructor(parent, list) {
    this.list = list;
    this.root = el(parent, 'div', 'bubble');
    this.img = el(this.root, 'img');
    this.text = el(this.root, 'span');
    this.cur = null;
  }

  render(t) {
    const b = this.list.find((x) => t >= x.from && t < x.to) ?? null;
    if (b !== this.cur) {
      this.cur = b;
      if (b) {
        this.text.textContent = b.text;
        setSrc(this.img, `/landing/img/owl/${b.owl ?? 'talk'}.webp`);
      }
    }
    if (!b) return style(this.root, { opacity: '0' });
    const k = prog(t, b.from, b.from + 0.4);
    const out = prog(t, b.to - 0.25, b.to);
    style(this.root, {
      top: `${b.y ?? 1400}px`,
      opacity: String(clamp(k * 3) * (1 - out)),
      transform: `translateX(-50%) scale(${(0.6 + 0.4 * ease.back(k)) * (1 - out * 0.15)})`,
    });
  }
}

/**
 * Ролик: build(stage) → render(t) или { render, voice } — с озвучкой [{ at, id }] (фразы из
 * voice-N.json). Возвращает то, что зовёт render.mjs.
 */
export async function mount(video) {
  const stage = document.getElementById('stage');
  const built = await video.build(stage);
  const render = typeof built === 'function' ? built : built.render;
  await Promise.all(
    ['800 74px Onest', '700 40px Onest', '500 40px Onest', '600 40px Onest', '800 48px Nunito']
      .concat(['italic 600 80px Playfair', '600 112px Playfair'])
      .map((f) => document.fonts.load(f, 'Ая Az')),
  );
  return {
    duration: video.duration,
    voice: built.voice ?? [],
    async render(t) {
      pending.length = 0;
      render(t);
      await Promise.all(pending);
    },
  };
}
