// Озвучка лендинга (apps/landing/landing-voice): готовые MP3 нейроголосом Google вместо голоса браузера.
// Фразы и голоса — в phrases.json; имя файла — <язык>-<хэш текста>.mp3 (тот же хэш в landing.js).
//
//   GOOGLE_TTS_API_KEY=… node scripts/landing-voice.mjs          # озвучить недостающие фразы
//   node scripts/landing-voice.mjs --check                       # у каждой фразы есть файл, лишних нет
//
// Ключ есть только на сервере: там скрипт запускают с переменной PHRASES (содержимое phrases.json)
// и STDOUT_JSONL=1 (присваиваются в начале скрипта, `node --input-type=module -`) — файлы приходят
// строками JSON {file, b64}, их сохраняет `--save <файл>`.

const { readFileSync, writeFileSync, readdirSync, existsSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');

/** Ключ фразы: без эмодзи и кавычек, как в landing.js (Voice.key). */
function phraseKey(lang, text) {
  const norm = text
    .replace(/[^\p{L}\p{N}\s,.!?—-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  let h = 0x811c9dc5;
  for (const ch of `${lang}:${norm}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${lang}-${h.toString(16).padStart(8, '0')}.mp3`;
}

const LANG_CODES = { ru: 'ru-RU', en: 'en-US', zh: 'cmn-CN' };

async function synthesize(apiKey, voice, lang, text, rate) {
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: LANG_CODES[lang], name: voice },
      audioConfig: { audioEncoding: 'MP3', ...(rate ? { speakingRate: rate } : {}) },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google TTS ${res.status}: ${body.error?.message ?? ''}`);
  return body.audioContent;
}

{
  const here = import.meta.url.startsWith('file:') ? dirname(fileURLToPath(import.meta.url)) : '.';
  const dir = join(here, '../apps/landing/landing-voice');
  const args = process.argv.slice(2);
  const config = JSON.parse(process.env.PHRASES ?? readFileSync(join(dir, 'phrases.json'), 'utf8'));
  const wanted = new Map(config.phrases.map((p) => [phraseKey(p.lang, p.text), p]));

  if (args[0] === '--check') {
    const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.mp3')));
    const missing = [...wanted.keys()].filter((f) => !files.has(f));
    const extra = [...files].filter((f) => !wanted.has(f));
    if (missing.length || extra.length) {
      console.error({ missing: missing.map((f) => wanted.get(f).text), extra });
      process.exit(1);
    }
    console.log(`ок: ${wanted.size} фраз`);
  } else if (args[0] === '--save') {
    // Сохранить вывод серверного запуска (строки JSON) в папку лендинга.
    let n = 0;
    for (const line of readFileSync(args[1], 'utf8').split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      const j = JSON.parse(line);
      if (j.err) console.error(j.file, j.err);
      else if (j.b64) {
        writeFileSync(join(dir, j.file), Buffer.from(j.b64, 'base64'));
        n++;
      }
    }
    console.log(`сохранено: ${n}`);
  } else {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw new Error('нужен GOOGLE_TTS_API_KEY');
    const jsonl = Boolean(process.env.STDOUT_JSONL);
    const force = args.includes('--force');
    for (const [file, p] of wanted) {
      if (!jsonl && !force && existsSync(join(dir, file))) continue;
      const voice = config.voices[p.voice ?? 'owl'][p.lang];
      try {
        const b64 = await synthesize(apiKey, voice, p.lang, p.text, p.rate);
        if (jsonl) console.log(JSON.stringify({ file, b64 }));
        else writeFileSync(join(dir, file), Buffer.from(b64, 'base64'));
      } catch (e) {
        if (jsonl) console.log(JSON.stringify({ file, err: e.message }));
        else throw e;
      }
    }
  }
}
