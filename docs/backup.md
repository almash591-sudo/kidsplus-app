# Бэкапы

> **Пока не включено.** На бесплатном тарифе Railway нельзя создать bucket и ещё один сервис,
> поэтому медиа хранятся в PostgreSQL (`STORAGE_DRIVER=db`), а ночной бэкап отложен до перехода
> на тариф Hobby. Ниже — как он устроен и включается (скрипт и Dockerfile — в `deploy/backup/`).

Сервис `backup` на Railway запускается каждую ночь в 01:00 UTC (04:00 МСК) и складывает копии в
Railway Bucket `media` (регион Амстердам):

| Путь в bucket           | Что                           | Сколько хранится |
| ----------------------- | ----------------------------- | ---------------- |
| `backups/daily/*.dump`  | дамп PostgreSQL (pg_dump -Fc) | 7 последних      |
| `backups/weekly/*.dump` | дамп по воскресеньям          | 4 последних      |
| `backups/media/`        | зеркало озвучки и картинок    | без удаления     |

Озвучку при потере можно перегенерировать (она строится из текста), а загруженные картинки — только из
зеркала `backups/media/`.

Ограничение: копии лежат в том же bucket, что и рабочие файлы. От случайного удаления данных они
защищают, от удаления самого bucket — нет (Railway хранит удалённый bucket 52 часа).

## Восстановление базы

1. Скачать дамп: в Railway → bucket `media` → Files → `backups/daily/<дата>.dump`
   (или `aws s3 cp` с параметрами из вкладки Credentials).
2. Восстановить в базу (все таблицы будут пересозданы):

   ```sh
   pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" kidsplus-<дата>.dump
   ```

   `DATABASE_URL` — публичный адрес базы: Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`.

## Восстановление медиа

```sh
aws --endpoint-url "$ENDPOINT" s3 sync s3://$BUCKET/backups/media/ s3://$BUCKET/media/
```

## Проверить бэкап вручную

Railway → сервис `backup` → Deployments → Redeploy: сервис сразу выполнит бэкап и завершится,
результат — в логах.
