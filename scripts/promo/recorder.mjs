// Промо-ролики (этап 48): покадровая съёмка интерфейса на демо-стенде.
//
// Часы страницы остановлены (Playwright clock), и каждый кадр двигает их ровно на 1/30 с:
// таймеры, requestAnimationFrame (canvas-игры) и CSS-анимации (через document.getAnimations)
// идут в «виртуальном» времени. Поэтому кадры ровные, без рывков, как бы медленно ни работал
// компьютер. Сеть (запросы к api) — настоящая; между кадрами её можно подождать.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..');
const require = createRequire(import.meta.url);
/** Playwright — из devDependencies кабинета, отдельной зависимости не нужно. */
export const { chromium } = require(
  require.resolve('@playwright/test', { paths: [join(ROOT, 'apps/parent')] }),
);

export const FPS = 30;
export const PARENT = 'http://localhost:4800';
export const DEMO = { email: 'demo@example.com', password: 'demo-password-123' };
/** Куда складывать кадры и ролики (в .gitignore). */
export const OUT = resolve(process.env.PROMO_OUT ?? join(ROOT, '.promo'));

/** Телефон: iPhone 390×844, ×3 — экран 1170×2532, хватает на наезд камеры в монтаже. */
export async function phone(browser, time) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'light',
  });
  // Чужих видео в роликах нет: YouTube на съёмке не грузится.
  await ctx.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com/, (r) =>
    r.abort(),
  );
  await ctx.addInitScript(quietSpeech);
  await ctx.clock.install({ time });
  return ctx;
}

/**
 * Голос телефона без звука: фраза «звучит» столько, сколько её читал бы голос (по таймеру —
 * в виртуальном времени), и записывается в window.__promoSaid — для титров и будущей озвучки.
 */
function quietSpeech() {
  const said = (window.__promoSaid = []);
  const voices = ['ru-RU', 'en-US', 'zh-CN'].map((lang) => ({
    lang,
    name: lang,
    voiceURI: lang,
    localService: true,
    default: lang === 'ru-RU',
  }));
  let timer = 0;
  let current = null;
  const fake = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    getVoices: () => voices,
    speak(u) {
      if (u.text.trim()) said.push({ text: u.text, lang: u.lang, at: Date.now() });
      fake.speaking = true;
      current = u;
      timer = setTimeout(
        () => {
          fake.speaking = false;
          current = null;
          u.onend?.(new Event('end'));
        },
        350 + u.text.length * 75,
      );
    },
    cancel() {
      clearTimeout(timer);
      fake.speaking = false;
      const u = current;
      current = null;
      u?.onend?.(new Event('end'));
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
}

/**
 * Остановленные анимации: каждая получает своё время от момента, когда мы её заметили.
 * Возвращает фразы, сказанные с прошлого шага.
 */
function stepAnimations(now) {
  for (const a of document.getAnimations()) {
    if (a.__promoStart === undefined) {
      a.__promoStart = now - (a.currentTime ?? 0);
      a.pause();
    }
    const t = now - a.__promoStart;
    const end = a.effect?.getComputedTiming().endTime;
    if (typeof end === 'number' && Number.isFinite(end) && t >= end) {
      if (a.playState !== 'finished') a.finish();
    } else a.currentTime = t;
  }
  const said = window.__promoSaid ?? [];
  return said.splice(0, said.length).map((s) => `${s.lang}: ${s.text}`);
}

const TAP_CSS = `
.promo-tap{position:fixed;z-index:2147483647;width:64px;height:64px;margin:-32px 0 0 -32px;
  border-radius:50%;pointer-events:none;background:rgb(255 255 255/.55);
  box-shadow:0 0 0 3px rgb(23 26 36/.35),0 6px 18px rgb(0 0 0/.25);
  animation:promo-tap .7s cubic-bezier(.22,1,.36,1) forwards}
@keyframes promo-tap{0%{transform:scale(.4);opacity:0}15%{transform:scale(1);opacity:1}
  60%{transform:scale(.85);opacity:.9}100%{transform:scale(1.5);opacity:0}}`;

/** Время стенда (DEMO_CLOCK=1): мс, до которых его уже перевели. */
let serverAt = 0;

/** Сейчас на стенде. */
export async function standNow() {
  const { now } = await (await fetch(`${PARENT}/__demo/clock`)).json();
  return new Date(now);
}

/** Камера одной страницы: rec — снимать, skip — промотать время без кадров. */
export class Cam {
  constructor(page) {
    this.page = page;
    this.vt = 0;
    this.clips = [];
  }

  /**
   * Остановить часы страницы (после загрузки — пока она грузится, время идёт само).
   * serverClock — стенд с DEMO_CLOCK=1: его часы идут за часами страницы, и время занятий
   * засчитывается и при перемотке.
   */
  async freeze({ serverClock = false } = {}) {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.now = (await this.page.evaluate(() => Date.now())) + 50;
    this.serverClock = serverClock;
    await this.page.clock.pauseAt(this.now);
    await this.page.addStyleTag({ content: TAP_CSS });
  }

  async step(ms) {
    this.now += ms;
    // Часы стенда общие для всех страниц и идут только вперёд.
    if (this.serverClock && this.now > serverAt) {
      serverAt = this.now;
      await fetch(`${PARENT}/__demo/clock?at=${this.now}`);
    }
    await this.page.clock.runFor(ms);
    this.vt += ms;
    const said = await this.page.evaluate(stepAnimations, this.vt);
    // Фраза привязана к кадру клипа (при skip — к следующему снятому кадру).
    for (const text of said) this.said?.push({ frame: this.frame + 1, text });
  }

  /** Новый клип: кадры в OUT/clips/<имя>/000001.jpg… */
  clip(name) {
    this.dir = join(OUT, 'clips', name);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.frame = 0;
    this.said = [];
    this.clips.push(name);
  }

  /** Закончить клип: дальше tap и прочее — без кадров. */
  cut() {
    this.saveMeta();
    this.dir = null;
    this.said = null;
  }

  /** Число кадров и сказанное — рядом с кадрами клипа, для монтажа. */
  saveMeta() {
    if (!this.dir) return;
    const meta = { frames: this.frame, fps: FPS, said: this.said };
    writeFileSync(join(this.dir, 'meta.json'), JSON.stringify(meta, null, 1));
  }

  async shot() {
    const { data } = await this.cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 92,
    });
    writeFileSync(join(this.dir, `${String(++this.frame).padStart(6, '0')}.jpg`), data, 'base64');
  }

  /** Снять sec секунд. */
  async rec(sec) {
    const n = Math.round(sec * FPS);
    for (let i = 0; i < n; i++) {
      // 33, 33, 34 мс — ровно секунда на 30 кадров.
      const ms =
        Math.round(((this.frame + 1) * 1000) / FPS) - Math.round((this.frame * 1000) / FPS);
      await this.step(ms);
      await this.shot();
    }
    this.saveMeta();
  }

  /** Промотать время без кадров (голос, ожидание, «прошло 5 минут»). */
  async skip(sec, chunk = 250) {
    for (let left = sec * 1000; left > 0; left -= chunk) await this.step(Math.min(chunk, left));
  }

  /** Подождать настоящее время (ответ api), часы страницы стоят. */
  async settle(ms = 400) {
    await this.page.waitForTimeout(ms);
  }

  /** Касание пальцем: кружок появляется, через пару кадров — нажатие. */
  async tap(target, { lead = 0.2, after = 0.5 } = {}) {
    const box = await target.boundingBox();
    if (!box) throw new Error('tap: элемент не виден');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.page.evaluate(
      ([x, y]) => {
        const d = document.createElement('div');
        d.className = 'promo-tap';
        d.style.left = `${x}px`;
        d.style.top = `${y}px`;
        document.body.append(d);
        setTimeout(() => d.remove(), 900);
      },
      [x, y],
    );
    if (this.dir) await this.rec(lead);
    else await this.skip(lead);
    await this.page.mouse.click(x, y);
    await this.settle(150);
    if (this.dir) await this.rec(after);
    else await this.skip(after);
  }
}

/** Вход родителя в демо-кабинет через api (cookie остаётся в контексте). */
export async function login(ctx) {
  const res = await ctx.request.post(`${PARENT}/api/parent/login`, { data: DEMO });
  if (!res.ok()) throw new Error(`вход: ${res.status()}`);
}

/** Ссылка привязки телефона ребёнка по прозвищу из демо-семьи. */
export async function pairUrl(ctx, nickname) {
  const kids = await (await ctx.request.get(`${PARENT}/api/parent/children`)).json();
  const kid = kids.find((k) => k.nickname === nickname);
  const res = await ctx.request.post(`${PARENT}/api/parent/pairings`, {
    data: { childId: kid.id, deviceName: 'Промо' },
  });
  return { kid, url: (await res.json()).url };
}
