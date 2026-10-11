# Резервные копии

Каждую ночь в 04:00 по Москве worker делает копию всей базы (`pg_dump -Fc`) и кладёт её на
Google Диск владельца в папку **«KidsPlus — резервные копии»**. Хранятся 14 последних копий.

В базе — всё: профили детей, планы, прогресс, одобренный контент, картинки, озвучка, фото и видео
с камеры (`STORAGE_DRIVER=db`). Озвучку при потере можно перегенерировать, остальное — только из
копии.

Доступ к Диску — OAuth владельца с правом **drive.file**: приложение видит и меняет только файлы,
которые создало само; остальной Диск ему недоступен. Статус и кнопка «Сделать копию сейчас» —
в кабинете: «Ещё» → «Резервные копии».

## Включение (один раз)

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

1. Скачать нужный `.dump` из папки на Google Диске.
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

Каталог `deploy/backup/` — прежний вариант (отдельный сервис и Railway Bucket) для тарифа Hobby;
сейчас не используется.
