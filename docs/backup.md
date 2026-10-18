# Резервные копии

Каждую ночь в 04:00 по Москве worker делает копию всей базы (`pg_dump -Fc`). Хранятся 14
последних копий. Куда:

- **bucket Cloudflare R2 владельца**, префикс `backups/` — по умолчанию (с 2026-10-18): worker
  берёт ключи `S3_*` у api (ссылки в `.railway/railway.ts`), ничего настраивать не нужно;
- **Google Диск** владельца, папка «KidsPlus — резервные копии» — если подключён (ниже); тогда
  копии идут туда, а не в R2.

С 2026-10-18 медиа (картинки, озвучка, фото и видео с камеры, APK киоска) лежат в том же bucket
под `media/` (`STORAGE_DRIVER=s3`), в копию базы не входят. Озвучку при потере можно
перегенерировать.

Скачать копию из R2: Cloudflare → R2 → bucket → `backups/` → файл → Download.

## Google Диск вместо R2 (необязательно)

Доступ к Диску — OAuth владельца с правом **drive.file**: приложение видит и меняет только файлы,
которые создало само; остальной Диск ему недоступен. Статус и кнопка «Сделать копию сейчас» —
в кабинете: «Ещё» → «Резервные копии».

1. Google Cloud Console (тот же проект, что для озвучки):
   - **APIs & Services → Library** → «Google Drive API» → **Enable**;
   - **OAuth consent screen** → тип **Internal** (аккаунт в организации) → название «KidsPlus» → сохранить;
   - **Credentials → Create credentials → OAuth client ID** → тип **Desktop app** → имя
     «KidsPlus backup» → **Create** → **Download JSON**.
2. Сохранить скачанный файл как `%USERPROFILE%\.kidsplus\google-oauth-client.json`.
3. На компьютере, где выполнен вход в Railway CLI:

   ```sh
   node scripts/google-drive-auth.mjs
   ```

   Откроется браузер: войти в Google и разрешить доступ. Скрипт сам запишет в сервис `worker`
   переменные `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`
   (на экран не выводит), worker перезапустится.

4. В кабинете «Резервные копии» → «Сделать копию сейчас» — через минуту-две на Диске появится
   первый файл `kidsplus-ГГГГ-ММ-ДД-ЧЧ-ММ.dump`.

## Восстановление базы

1. Скачать нужный `.dump` из R2 (`backups/`) или из папки на Google Диске.
2. Восстановить (таблицы пересоздаются):

   ```sh
   pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" kidsplus-….dump
   ```

   У базы на Railway нет публичного адреса: на время восстановления включить его
   (Railway → Postgres → Settings → Networking → TCP Proxy) и взять `DATABASE_PUBLIC_URL`
   из Variables; после — выключить. `pg_restore` нужен версии 18 (как сервер).

## Если копии перестали делаться

Кабинет показывает ошибку последней попытки. Частые причины:

- `invalid_grant` — доступ отозван или истёк: повторить шаг 3 «Включения»;
- `pg_dump: … version mismatch` — сервер обновился до новой версии PostgreSQL: поменять пакет
  `postgresql18-client` в `deploy/node.Dockerfile`.

Каталог `deploy/backup/` — прежний вариант (отдельный сервис и Railway Bucket); не используется.

## Диск базы

Том Postgres — 5 ГБ (тариф Hobby; `sizeMB` в `.railway/railway.ts`, оповещения на 80/95/100 %).
2026-10-18 прежние 500 МБ переполнились файлами в `media_blobs` — база перестала принимать
подключения. Урок: на полном диске удалять нельзя — удаление и очистка пишут журнал (WAL) объёмом
с удаляемые данные; сначала увеличить том.
