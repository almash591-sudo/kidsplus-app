// Разрешить резервным копиям KidsPlus писать на Google Диск владельца (один раз).
//
//   node scripts/google-drive-auth.mjs [путь к client_secret.json]
//
// Открывает в браузере вход Google, просит право «drive.file» — приложение видит только файлы,
// которые создало само (папку с копиями), остальной Диск ему недоступен. Полученный ключ
// записывается прямо в переменные сервиса worker на Railway и на экран не выводится.
// Подготовка (OAuth-клиент «Desktop app» в Google Cloud) — docs/backup.md.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const clientFile = process.argv[2] ?? join(homedir(), '.kidsplus', 'google-oauth-client.json');
if (!existsSync(clientFile)) {
  console.error(`Нет файла OAuth-клиента: ${clientFile}\nСм. docs/backup.md, шаг 1.`);
  process.exit(1);
}
const raw = JSON.parse(readFileSync(clientFile, 'utf8'));
const client = raw.installed ?? raw.web;
if (!client?.client_id || !client?.client_secret) {
  console.error('В файле нет client_id/client_secret — нужен OAuth-клиент типа «Desktop app».');
  process.exit(1);
}

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');
let redirectUri = '';

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.searchParams.get('state') !== state) {
      res.writeHead(400).end('Неверный запрос');
      return;
    }
    const got = url.searchParams.get('code');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      got
        ? '<h2>Готово! Окно можно закрыть и вернуться в терминал.</h2>'
        : `<h2>Доступ не выдан: ${url.searchParams.get('error') ?? 'ошибка'}</h2>`,
    );
    server.close();
    if (got) resolve(got);
    else reject(new Error(url.searchParams.get('error') ?? 'нет кода'));
  });
  server.listen(0, '127.0.0.1', () => {
    const redirect = `http://127.0.0.1:${server.address().port}`;
    redirectUri = redirect;
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    }).toString();
    console.log('Открываю браузер: войдите в Google и разрешите доступ к файлам KidsPlus…');
    console.log(`Если браузер не открылся, откройте адрес вручную:\n${auth}\n`);
    // Windows: rundll32 открывает адрес браузером по умолчанию без экранирования «&».
    const opener =
      process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', auth.toString()]]
        : [process.platform === 'darwin' ? 'open' : 'xdg-open', [auth.toString()]];
    spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
  });
  setTimeout(() => reject(new Error('не дождались входа за 10 минут')), 600_000).unref();
});

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  }),
});
const token = await res.json();
if (!res.ok || !token.refresh_token) {
  console.error(
    `Google не выдал ключ: ${token.error ?? res.status} ${token.error_description ?? ''}`,
  );
  process.exit(1);
}

// railway CLI: на Windows — сам exe (railway.cmd без оболочки не запускается).
const winExe = join(
  process.env.APPDATA ?? '',
  'npm',
  'node_modules',
  '@railway',
  'cli',
  'bin',
  'railway.exe',
);
const railway = process.platform === 'win32' && existsSync(winExe) ? winExe : 'railway';
const set = spawnSync(
  railway,
  [
    'variables',
    '--service',
    'worker',
    '--set',
    `GOOGLE_DRIVE_CLIENT_ID=${client.client_id}`,
    '--set',
    `GOOGLE_DRIVE_CLIENT_SECRET=${client.client_secret}`,
    '--set',
    `GOOGLE_DRIVE_REFRESH_TOKEN=${token.refresh_token}`,
  ],
  { cwd: join(import.meta.dirname, '..'), stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
);
if (set.status !== 0) {
  console.error(`Не удалось записать переменные в Railway: ${set.stderr?.slice(0, 300)}`);
  console.error('Проверьте вход: railway login, затем запустите скрипт снова.');
  process.exit(1);
}
console.log('Готово: доступ к Google Диску сохранён в Railway (worker перезапустится сам).');
console.log('Первая копия — ночью в 04:00 или кнопкой «Сделать копию сейчас» в кабинете.');
