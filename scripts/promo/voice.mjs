// Промо-ролики (этап 48): озвучка. Текст и голоса — в voice-N.json, файлы — scripts/promo/voice/N/<id>.mp3.
// Диктор — «Матильда», совёнок — «Лили», как в приложении (ElevenLabs через ProxyAPI).
//
//   PROXYAPI_KEY=… node scripts/promo/voice.mjs 1 [--force]   # озвучить недостающие строки
//   node scripts/promo/voice.mjs 1 --save <файл>                # сохранить вывод серверного запуска
//
// Ключ есть только на сервере: там скрипт запускают с переменными PHRASES (содержимое voice-N.json)
// и STDOUT_JSONL=1 (присваиваются в начале скрипта, `node -`) — файлы приходят строками JSON
// {id, b64}, их сохраняет `--save`.

const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import('node:fs');
const { dirname, join } = await import('node:path');
const { fileURLToPath } = await import('node:url');

async function synthesize(apiKey, full, text) {
  const [voice, model] = full.split('@');
  const res = await fetch('https://api.proxyapi.ru/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    // eleven_v4 скорость не принимает.
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`ProxyAPI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

{
  const here = import.meta.url.startsWith('file:') ? dirname(fileURLToPath(import.meta.url)) : '.';
  const [n, ...args] = process.argv.slice(2);
  const jsonl = Boolean(process.env.STDOUT_JSONL);
  if (!n && !jsonl) throw new Error('номер ролика: node scripts/promo/voice.mjs 1');
  const dir = join(here, 'voice', String(n));

  if (args[0] === '--save') {
    mkdirSync(dir, { recursive: true });
    let saved = 0;
    for (const line of readFileSync(args[1], 'utf8').split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      const j = JSON.parse(line);
      if (j.err) console.error(j.id, j.err);
      else {
        writeFileSync(join(dir, `${j.id}.mp3`), Buffer.from(j.b64, 'base64'));
        saved++;
      }
    }
    console.log(`сохранено: ${saved}`);
  } else {
    const config = JSON.parse(
      process.env.PHRASES ?? readFileSync(join(here, `voice-${n}.json`), 'utf8'),
    );
    const apiKey = process.env.PROXYAPI_KEY;
    if (!apiKey) throw new Error('нужен PROXYAPI_KEY');
    if (!jsonl) mkdirSync(dir, { recursive: true });
    for (const line of config.lines) {
      const file = join(dir, `${line.id}.mp3`);
      if (!jsonl && !args.includes('--force') && existsSync(file)) continue;
      try {
        const b64 = await synthesize(apiKey, config.voices[line.voice], line.text);
        if (jsonl) console.log(JSON.stringify({ id: line.id, b64 }));
        else writeFileSync(file, Buffer.from(b64, 'base64'));
      } catch (e) {
        if (jsonl) console.log(JSON.stringify({ id: line.id, err: e.message }));
        else throw e;
      }
    }
  }
}
