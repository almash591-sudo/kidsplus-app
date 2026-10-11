# Опубликовать новую версию киоска: телефоны сами поставят её ночью на зарядке (этап 15б).
#
#   powershell -ExecutionPolicy Bypass -File scripts\publish-kiosk.ps1
#
# Собирает подписанный APK с новым номером версии и загружает на сервер. Токен публикации
# хранится в %USERPROFILE%\.kidsplus\kiosk-publish-token.txt; при первом запуске скрипт создаёт его
# и сам записывает в переменную KIOSK_PUBLISH_TOKEN сервиса api на Railway (на экран не выводит).
# Первую версию с обновлением без кабеля нужно один раз поставить по кабелю (provision-device.ps1).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Say($text) { Write-Host "→ $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "✗ $text" -ForegroundColor Red; exit 1 }

$root = Resolve-Path "$PSScriptRoot\.."
foreach ($v in 'ANDROID_HOME', 'JAVA_HOME') {
  $x = [Environment]::GetEnvironmentVariable($v, 'User')
  if ($x -and -not (Get-Item "env:$v" -ErrorAction SilentlyContinue)) { Set-Item "env:$v" $x }
}
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ";$env:APPDATA\npm"

# Токен публикации: создаём один раз и кладём в Railway.
$dir = Join-Path $env:USERPROFILE '.kidsplus'
$tokenFile = Join-Path $dir 'kiosk-publish-token.txt'
if (-not (Test-Path $tokenFile)) {
  Say 'Первый запуск: создаю токен публикации и записываю его в Railway (api перезапустится)…'
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $railway = Join-Path $env:APPDATA 'npm\node_modules\@railway\cli\bin\railway.exe'
  if (-not (Test-Path $railway)) { $railway = 'railway' }
  Push-Location $root
  & $railway variables --service api --set "KIOSK_PUBLISH_TOKEN=$token" | Out-Null
  $ok = $?
  Pop-Location
  if (-not $ok) { Fail 'не удалось записать токен в Railway — выполните railway login и запустите снова' }
  New-Item -ItemType Directory -Force $dir | Out-Null
  Set-Content -Path $tokenFile -Value $token -NoNewline -Encoding ascii
  Say 'Жду 3 минуты, пока api перезапустится с токеном…'
  Start-Sleep 180
}
$token = (Get-Content $tokenFile -Raw).Trim()

# Номер версии — минуты с 2020 года: каждая сборка новее предыдущей.
$code = [int][Math]::Floor(((Get-Date).ToUniversalTime() - [datetime]'2020-01-01').TotalMinutes)
Say "Собираю киоск, версия $code…"
Push-Location "$root\apps\kiosk"
pnpm exec cap sync android | Out-Null
Pop-Location
Push-Location "$root\apps\kiosk\android"
.\gradlew.bat assembleRelease --no-daemon -q "-PkidsplusVersionCode=$code"
$built = $LASTEXITCODE -eq 0
Pop-Location
if (-not $built) { Fail 'сборка не удалась' }
$apk = "$root\apps\kiosk\android\app\build\outputs\apk\release\app-release.apk"

$server = (Get-Content "$root\apps\kiosk\capacitor.config.json" -Raw | ConvertFrom-Json).server.url.TrimEnd('/')
Say "Загружаю на сервер ($([Math]::Round((Get-Item $apk).Length / 1MB)) МБ)…"
try {
  $r = Invoke-RestMethod -Method Post -Uri "$server/api/kiosk/releases" -InFile $apk `
    -ContentType 'application/vnd.android.package-archive' -TimeoutSec 600 `
    -Headers @{ authorization = "Bearer $token"; 'x-version-code' = "$code" }
} catch {
  Fail "сервер не принял APK: $($_.Exception.Message)"
}
Say "Готово: версия $($r.versionCode) на сервере. Телефоны поставят её ночью, когда будут на зарядке с выключенным экраном."
