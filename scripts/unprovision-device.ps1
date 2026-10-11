# Возврат детского телефона в обычный режим (этап 6).
#
# Владельца устройства снимает сам киоск: на телефоне удержите правый верхний угол 3 секунды →
# PIN → «Настройки телефона» → «Вернуть телефон в обычный режим». Этот скрипт проверяет, что
# киоск больше не владелец, и удаляет его (по желанию — с VPN и всеми настройками).
#
#   powershell -ExecutionPolicy Bypass -File scripts\unprovision-device.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Pkg = 'app.kidsplus.kiosk'
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { Write-Host "не найден adb ($adb)" -ForegroundColor Red; exit 1 }

$owners = (& $adb shell dpm list-owners) -join "`n"
if ($owners -match $Pkg) {
  Write-Host 'Киоск всё ещё владелец устройства.' -ForegroundColor Yellow
  Write-Host 'На телефоне: угол экрана 3 секунды → PIN → «Настройки телефона» →'
  Write-Host '«Вернуть телефон в обычный режим». Потом запустите этот скрипт ещё раз.'
  exit 1
}
& $adb uninstall $Pkg | Out-Host
Write-Host '✓ Телефон в обычном режиме, киоск удалён.' -ForegroundColor Green
