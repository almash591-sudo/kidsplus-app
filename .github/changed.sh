#!/usr/bin/env bash
# Нужна ли проверка: менялись ли файлы, подходящие под регулярное выражение $1,
# между BASE и HEAD. Нет BASE (первый push ветки и т. п.) — проверяем на всякий случай.
set -euo pipefail
pattern="$1"
run=true
if [ -n "${BASE:-}" ] && [ "$BASE" != "0000000000000000000000000000000000000000" ] \
  && git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  if ! git diff --name-only "$BASE" HEAD | grep -qE "$pattern"; then run=false; fi
fi
echo "Изменения под «$pattern»: run=$run"
echo "run=$run" >> "$GITHUB_OUTPUT"
