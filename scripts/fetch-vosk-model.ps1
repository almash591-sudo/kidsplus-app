# Модель офлайн-распознавания речи для голосового управления экраном малыша (этап 16в).
#
#   powershell -ExecutionPolicy Bypass -File scripts\fetch-vosk-model.ps1
#
# Скачивает маленькую русскую модель Vosk (Apache 2.0, ~45 МБ) с сайта проекта alphacephei.com
# и кладёт в assets киоска (в git не хранится). Без неё киоск собирается и работает, только без голоса.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$name = 'vosk-model-small-ru-0.22'
$url = "https://alphacephei.com/vosk/models/$name.zip"
# SHA-256 архива, зафиксированный при первом скачивании (2026-10-12); пусто — только напечатать.
$expected = '961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4'
$assets = Resolve-Path "$PSScriptRoot\..\apps\kiosk\android\app\src\main\assets"
$target = Join-Path $assets 'model-ru'
if (Test-Path (Join-Path $target 'uuid')) { Write-Host "→ Модель уже на месте: $target"; exit 0 }

$tmp = Join-Path ([IO.Path]::GetTempPath()) "kidsplus-vosk"
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp "$name.zip"
Write-Host "→ Скачиваю $url…"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
$sha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
Write-Host "→ SHA-256: $sha"
if ($expected -and $sha -ne $expected) { Write-Host '✗ Контрольная сумма не совпала' -ForegroundColor Red; exit 1 }

Expand-Archive -Path $zip -DestinationPath $tmp -Force
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
Move-Item (Join-Path $tmp $name) $target
# Vosk StorageService копирует модель из assets один раз — по файлу uuid узнаёт её версию.
Set-Content -Path (Join-Path $target 'uuid') -Value $name -NoNewline -Encoding ascii
Remove-Item -Recurse -Force $tmp
Write-Host "→ Готово: $target"
