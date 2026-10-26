// Промо-ролики (этап 48): монтаж. node scripts/promo/render.mjs 1 → .promo/video-1.mp4
//   --at 1,8.5,20 — вместо ролика кадры-превью в .promo/preview/ (быстро проверить вёрстку).
// Кадры снимает Chromium (страница монтажа — stage.js и video-N.js), кодирует ffmpeg (FFMPEG=…,
// нужен libx264). Звук — озвучка из voice/N/ (voice.mjs) по расписанию монтажа; без неё — тишина.
// Музыку добавляют в соцсети при публикации.
import { spawn, spawnSync } from 'node:child_process';
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

/** Длина речи в файле, с: без тишины в конце (silencedetect ffmpeg). */
function speechSec(file) {
  const run = spawnSync(
    FFMPEG,
    ['-hide_banner', '-i', file, '-af', 'silencedetect=n=-40dB:d=0.12', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  if (run.error) throw new Error(`озвучку меряет ffmpeg (FFMPEG=…): ${run.error.message}`);
  const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(run.stderr);
  const total = +h * 3600 + +m * 60 + +s;
  const starts = [...run.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((x) => +x[1]);
  const ends = [...run.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((x) => +x[1]);
  const tail = starts.length > ends.length || ends.at(-1) > total - 0.1;
  return tail ? starts.at(-1) : total;
}

const voiceFile = (id) => join(ROOT, `scripts/promo/voice/${n}/${id}.mp3`);

/**
 * Озвучка ролика: { id: { text, voice, sec, gain } } по voice-N.json и файлам voice/N/;
 * gain — поправка громкости голоса, дБ.
 */
function voiceLines() {
  const path = join(ROOT, `scripts/promo/voice-${n}.json`);
  if (!existsSync(path)) return {};
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const out = {};
  for (const line of config.lines) {
    const file = voiceFile(line.id);
    if (!existsSync(file))
      throw new Error(`нет озвучки ${line.id}: node scripts/promo/voice.mjs ${n}`);
    const gain = config.gain?.[line.voice] ?? 0;
    out[line.id] = { text: line.text, voice: line.voice, sec: speechSec(file), gain };
  }
  return out;
}
const VOICE = voiceLines();

const html = `<!doctype html><meta charset="utf-8">
<style>${fontFaces()}</style>
<link rel="stylesheet" href="/promo/stage.css">
<div id="stage"></div>
<script>window.CLIPS = ${JSON.stringify(clips())};</script>
<script>window.VOICE = ${JSON.stringify(VOICE)};</script>
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
  // Значки игр — как на плитках детского приложения.
  ['/games/', join(ROOT, 'apps/kid/public/games')],
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
  // Расписание озвучки — чтобы сверить с кадрами.
  const voice = await page.evaluate(() => window.__promo.voice);
  const plan = voice.map((v) => ({ ...v, to: v.at + VOICE[v.id].sec, text: VOICE[v.id].text }));
  writeFileSync(join(dir, `voice-${n}.json`), JSON.stringify(plan, null, 1));
  console.log(`превью: ${dir}`);
} else {
  const file = join(OUT, `video-${n}.mp4`);
  // Звук: каждая фраза со своей секунды, вместе — к громкости соцсетей (−14 LUFS).
  const voice = await page.evaluate(() => window.__promo.voice);
  const audio = voice.length
    ? [
        voice.flatMap((v) => ['-i', voiceFile(v.id)]),
        [
          '-filter_complex',
          voice
            .map(
              (v, i) =>
                `[${i + 1}:a]volume=${VOICE[v.id].gain}dB,adelay=${Math.round(v.at * 1000)}:all=1[v${i}]`,
            )
            .concat(
              `${voice.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voice.length}:normalize=0,` +
                'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,alimiter=limit=0.8:level=0,' +
                `aformat=channel_layouts=stereo,apad=whole_dur=${duration}[a]`,
            )
            .join(';'),
        ],
        ['-map', '0:v', '-map', '[a]', '-shortest'],
      ]
    : [
        ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'],
        ['-map', '0:v', '-map', '1:a', '-shortest'],
      ];
  const ff = spawn(
    FFMPEG,
    [
      ['-y', '-loglevel', 'error'],
      ['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'],
      ...audio,
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
