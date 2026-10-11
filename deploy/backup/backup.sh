#!/bin/sh
# Ночной бэкап KidsPlus в Railway Bucket (запускается Railway по расписанию и завершается).
#   backups/daily/<дата>.dump   — дамп PostgreSQL, хранятся 7 последних
#   backups/weekly/<дата>.dump  — по воскресеньям, хранятся 4 последних
#   backups/media/              — зеркало медиа (без удаления: случайно удалённое остаётся здесь)
# Восстановление — см. docs/backup.md.
set -eu

: "${DATABASE_URL:?не задан}" "${S3_BUCKET:?не задан}" "${S3_ENDPOINT:?не задан}"
export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:?не задан}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:?не задан}"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
aws configure set default.s3.addressing_style virtual

s3() { aws --endpoint-url "$S3_ENDPOINT" s3 "$@"; }

DAY=$(date -u +%Y-%m-%d)
FILE="/tmp/kidsplus-$DAY.dump"

echo "бэкап $DAY: дамп БД"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE"
s3 cp "$FILE" "s3://$S3_BUCKET/backups/daily/$DAY.dump" --only-show-errors
if [ "$(date -u +%u)" = "7" ]; then
  s3 cp "$FILE" "s3://$S3_BUCKET/backups/weekly/$DAY.dump" --only-show-errors
fi

echo "бэкап $DAY: медиа"
s3 sync "s3://$S3_BUCKET/media/" "s3://$S3_BUCKET/backups/media/" --only-show-errors

# Удаляет всё, кроме $2 самых свежих дампов в backups/$1/ (имена — даты, сортируются по алфавиту).
rotate() {
  s3 ls "s3://$S3_BUCKET/backups/$1/" | awk '{print $4}' | grep '\.dump$' | sort -r |
    tail -n +"$(($2 + 1))" | while read -r old; do
      s3 rm "s3://$S3_BUCKET/backups/$1/$old" --only-show-errors
      echo "удалён старый бэкап $1/$old"
    done
}
rotate daily 7
rotate weekly 4

echo "бэкап $DAY: готово ($(du -h "$FILE" | cut -f1))"
