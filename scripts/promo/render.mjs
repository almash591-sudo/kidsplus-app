// Промо-ролики (этап 48): монтаж. node scripts/promo/render.mjs 1 → .promo/video-1.mp4
//   --at 1,8.5,20 — вместо ролика кадры-превью в .promo/preview/ (быстро проверить вёрстку).
// Кадры снимает Chromium (страница монтажа — stage.js и video-N.js), кодирует ffmpeg (FFMPEG=…,
// нужен libx264). Звука нет — дорожка тишины, музыку добавляют в соцсети при публикации.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium, FPS, OUT, ROOT } from './recorder.mjs';

const [n, flag, list] = process.argv.slice(2);
if (!n) throw new Error('номер ролика: node scripts/promo/render.mjs 1');
const preview = flag === '--at' ? list.split(',').map(Number) : null;
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

/** Шрифты лендинга (свои, OFL) — те же подмножества, что в landing.css. */
function fontFaces() {
  const families = { nunito: 'Nunito', onest: 'Onest', 'playfair-display': 'Playfair' };
  const ranges = {
    cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
    latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+20AC, U+2122, U+2212',
  };
  return readdirSync(join(ROOT, 'apps/landing/fonts'))
    .map((f) =>
      /^(nunito|onest|playfair-display)-(cyrillic|latin)-(\d+)-(normal|italic)\.woff2$/.exec(f),
    )
    .filter(Boolean)
    .map(
      ([f, family, subset, weight, fontStyle]) =>
        `@font-face{font-family:'${families[family]}';font-weight:${weight};font-style:${fontStyle};` +
        `src:url('/landing/fonts/${f}') format('woff2');unicode-range:${ranges[subset]}}`,
    )
    .join('\n');
}

/** Снятые клипы: число кадров и реплики голоса. */
function clips() {
  const dir = join(OUT, 'clips');
  const out = {};
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const meta = join(dir, name, 'meta.json');
    if (existsSync(meta)) out[name] = JSON.parse(readFileSync(meta, 'utf8'));
  }
  return out;
}

const html = `<!doctype html><meta charset="utf-8">
<style>${fontFaces()}</style>
<link rel="stylesheet" href="/promo/stage.css">
<div id="stage"></div>
<script>window.CLIPS = ${JSON.stringify(clips())};</script>
<script type="module">
  import { mount } from '/promo/stage.js';
  import video from '/promo/video-${n}.js';
  window.__promo = await mount(video);
</script>`;

const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const DIRS = [
  ['/promo/', join(ROOT, 'scripts/promo')],
  ['/landing/', join(ROOT, 'apps/landing')],
  ['/clips/', join(OUT, 'clips')],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error('страница:', e.message));
// Свой «сайт» без сервера: страница и файлы — прямо с диска.
await page.route('http://promo.local/**', (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname);
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
  for (const [prefix, dir] of DIRS) {
    const file = join(dir, path.slice(prefix.length));
    if (path.startsWith(prefix) && !path.includes('..') && existsSync(file))
      return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] });
  }
  return route.fulfill({ status: 404 });
});
await page.goto('http://promo.local/');
await page.waitForFunction(() => window.__promo, null, { timeout: 30_000 });
const duration = await page.evaluate(() => window.__promo.duration);
const cdp = await page.context().newCDPSession(page);

async function frame(t, format = 'jpeg') {
  await page.evaluate((t) => window.__promo.render(t), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format, quality: 95 });
  return Buffer.from(data, 'base64');
}

if (preview) {
  const dir = join(OUT, 'preview');
  mkdirSync(dir, { recursive: true });
  for (const t of preview) writeFileSync(join(dir, `${n}-${t.toFixed(2)}.jpg`), await frame(t));
  console.log(`превью: ${dir}`);
} else {
  const file = join(OUT, `video-${n}.mp4`);
  const ff = spawn(
    FFMPEG,
    [
      ['-y', '-loglevel', 'error'],
      ['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'],
      ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'],
      ['-map', '0:v', '-map', '1:a', '-shortest'],
      ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p'],
      ['-profile:v', 'high', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k'],
      ['-movflags', '+faststart', file],
    ].flat(),
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const done = new Promise((resolve, reject) =>
    ff.on('close', (code) => (code ? reject(new Error(`ffmpeg: код ${code}`)) : resolve())),
  );
  const total = Math.round(duration * FPS);
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    if (!ff.stdin.write(await frame(i / FPS)))
      await new Promise((resolve) => ff.stdin.once('drain', resolve));
    if (i % 150 === 0)
      console.log(`${i}/${total} кадров, ${Math.round((Date.now() - started) / 1000)} с`);
  }
  ff.stdin.end();
  await done;
  console.log(`готово: ${file}`);
}
await browser.close();
