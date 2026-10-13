# Развёртывание на Railway

Инфраструктура описана кодом в `.railway/railway.ts` (Railway Infrastructure as Code).
Файлы `railway.json` Railway больше не поддерживает.

## Что описано

| Ресурс         | Что это                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| Postgres + том | База данных, регион EU West (Амстердам)                                     |
| api            | `deploy/node.Dockerfile` (`APP=api`), миграции перед деплоем, `/api/health` |
| worker         | `deploy/node.Dockerfile` (`APP=worker`), фоновые задачи                     |
| kid-web        | `deploy/web/Dockerfile` (`APP=kid`): Caddy + детское PWA, `/healthz`        |
| parent-web     | `deploy/web/Dockerfile` (`APP=parent`): Caddy + родительское PWA            |

Медиа (картинки) хранятся в PostgreSQL (`STORAGE_DRIVER=db`): на бесплатном тарифе bucket недоступен.
Ночной бэкап — в `docs/backup.md` (включается на тарифе Hobby).

Все сервисы — в EU West. Деплой из GitHub после зелёного CI (`checkSuites: true`).
`APP` выбирает приложение в общем Dockerfile: Railway передаёт переменные сервиса как build-аргументы.

## Секреты

Значения секретов в репозитории нет — в `railway.ts` они помечены `preserve()`, а задаются так:

```sh
railway variable set SETUP_TOKEN --stdin --service api --skip-deploys
railway variable set GOOGLE_TTS_API_KEY --stdin --service worker --skip-deploys
```

### Аудиотека: Cloudflare R2 (этап 20)

mp3 из «Контент → Аудио» хранятся в bucket R2 (ключи `audio/tracks/…`), картинки — по-прежнему в
базе. Без этих переменных аудио пишется в базу — годится только для проверки.

1. Cloudflare → R2 → создать bucket (например, `kidsplus-audio`), публичный доступ не нужен.
2. R2 → Manage API tokens → токен с правом **Object Read & Write** только на этот bucket.
3. Задать у сервиса api (значения — из буфера обмена, в чат не вставлять):

```sh
railway variable set S3_ENDPOINT --stdin --service api --skip-deploys   # https://<id аккаунта>.r2.cloudflarestorage.com
railway variable set S3_BUCKET --stdin --service api --skip-deploys
railway variable set S3_ACCESS_KEY_ID --stdin --service api --skip-deploys
railway variable set S3_SECRET_ACCESS_KEY --stdin --service api
```

`S3_REGION` по умолчанию `auto` — так и нужно для R2.

### Модерация видео (Gemini и YouTube Data API)

1. Ключ Gemini: https://aistudio.google.com → Get API key → выбрать проект Google Cloud с картой.
2. Ключ YouTube: в том же проекте включить **YouTube Data API v3** → «Учётные данные» → API-ключ,
   ограниченный этим API.
3. Задать (значения — из буфера обмена, в чат не вставлять):

```sh
railway variable set GEMINI_API_KEY --stdin --service worker
railway variable set YOUTUBE_API_KEY --stdin --service worker
railway variable set YOUTUBE_API_KEY --stdin --service api
```

Без ключа Gemini очередь модерации ждёт (в кабинете — «Анализ ждёт ключа»); без ключа YouTube
видео добавляются по одному через oEmbed, а плейлисты, каналы и ежедневная проверка недоступны.
Модель и лимиты токенов — `LLM_MODEL_MAIN`, `LLM_DAILY_TOKEN_LIMIT`, `LLM_TOTAL_TOKEN_LIMIT`.

### Push-уведомления родителям (ключи VAPID)

Пара ключей создаётся один раз локально и задаётся api и worker'у (значения в чат не вставлять):

```powershell
$k = pnpm --filter @kidsplus/providers exec node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)"
$pub, $priv = ($k | Select-Object -Last 1).Split(' ')
foreach ($s in 'api', 'worker') {
  $pub  | railway variable set VAPID_PUBLIC_KEY --stdin --service $s --skip-deploys
  $priv | railway variable set VAPID_PRIVATE_KEY --stdin --service $s
}
```

Ключи менять не стоит: после смены все подписки перестают работать, и уведомления надо
включать на телефонах заново (кабинет → «Аккаунт»).

### Нейроголос (Google Cloud Text-to-Speech, Chirp 3 HD)

По умолчанию озвучивает телефон (`TTS_PROVIDER=browser`). Чтобы включить нейроголос:

1. Google Cloud Console: проект с привязанной картой → включить **Cloud Text-to-Speech API** →
   «Учётные данные» → создать API-ключ и ограничить его одним API — Cloud Text-to-Speech.
2. Задать ключ worker'у и включить провайдер у api и worker (значение ключа — из буфера обмена, в чат не вставлять):

```sh
railway variable set GOOGLE_TTS_API_KEY --stdin --service worker
railway variable set TTS_PROVIDER=google --service worker
railway variable set TTS_PROVIDER=google --service api
```

После деплоя api ставит в очередь озвучку всех карточек и вопросов, worker озвучивает их
(несколько минут). Пока файл фразы не готов, её говорит голос телефона — ничего не пропадает.
Голоса по умолчанию — `*-Chirp3-HD-Aoede` (ru, en, zh); другой голос — `TTS_VOICE_RU/EN/ZH`.
Весь контент — порядка 40 тыс. символов, озвучивается один раз и кэшируется.

## Как менять

```sh
railway login                      # один раз
railway link                       # привязать папку к проекту
railway config plan                # показать изменения, ничего не меняя
railway config apply               # применить (спросит подтверждение)
```

На Windows SDK `railway/iac` не может сам вызвать `railway.cmd` для проверки версии CLI.
Перед командами `railway config` задайте путь к исполняемому файлу:

```powershell
$env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"
```

## Как это работает

- Браузер ходит только на `kid-web`/`parent-web`. Caddy отдаёт PWA и проксирует `/api/*` в api
  по приватной сети Railway (`api.railway.internal`), поэтому api наружу не открыт.
- Перед каждым деплоем api выполняется `node dist/migrate.js` (миграции БД).
- Railway пересобирает сервис только при изменениях в его `watchPatterns`.

## Проверка после деплоя

- `https://<parent-web>.up.railway.app/` — заглушка «KidsPlus — родителям», статус «сервер и база данных работают».
- `https://<kid-web>.up.railway.app/` — солнце и зелёная точка в углу.
- `https://<любой-web>.up.railway.app/api/health` — `{"status":"ok","db":"ok"}`.
