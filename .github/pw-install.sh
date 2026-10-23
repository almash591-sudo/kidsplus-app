#!/usr/bin/env bash
# Установка браузеров Playwright с зависимостями: apt-зеркало раннера иногда зависает.
# До трёх попыток по 7 мин; перед повтором — добить оставшийся apt (он держит блокировку dpkg).
# Использование: bash .github/pw-install.sh <пакет> <браузеры…>
set -u
pkg=$1
shift
for i in 1 2 3; do
  timeout -k 10 420 pnpm --filter "$pkg" exec playwright install --with-deps "$@" && exit 0
  echo "::warning::установка Playwright не удалась (попытка $i), повторяю"
  sudo pkill -9 -x apt-get || true
  sudo pkill -9 -x dpkg || true
  sleep 5
  sudo dpkg --configure -a || true
done
exit 1
