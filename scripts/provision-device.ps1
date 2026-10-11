# Провижининг детского телефона (этап 6): ставит киоск KidsPlus и делает его владельцем
# устройства (Device Owner). Запускать для каждого телефона по очереди, телефон — по USB.
#
# Перед запуском: телефон сброшен до заводских настроек, при первой настройке вход в Google и
# Samsung пропущен, включена «Отладка по USB» (docs/kiosk.md).
#
#   powershell -ExecutionPolicy Bypass -File scripts\provision-device.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\provision-device.ps1 -Apk путь\к\kiosk.apk

param(
  [string]$Apk = "$PSScriptRoot\..\apps\kiosk\android\app\build\outputs\apk\release\app-release.apk",
  # Подписка VPN (адрес или ссылки vless://) — передаётся в киоск по USB, вставлять вручную не нужно.
  [string]$VpnFile = "$env:USERPROFILE\.kidsplus\vpn-subscription.txt",
  # При обновлении киоска VPN не трогаем (настройки сохраняются); с этим ключом — передать заново.
  [switch]$UpdateVpn
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Pkg = 'app.kidsplus.kiosk'

function Say($text) { Write-Host "→ $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "✗ $text" -ForegroundColor Red; exit 1 }

# Подписку VPN — в киоск: команду принимает только adb (docs/kiosk.md).
function Set-Vpn {
  if (-not (Test-Path $VpnFile)) { Say "Файла подписки нет ($VpnFile) — ссылку VPN вставьте на телефоне."; return }
  $src = (Get-Content $VpnFile -Raw -Encoding UTF8).Trim()
  if (-not $src) { return }
  Say 'Передаю подписку VPN в киоск…'
  $quoted = "'" + ($src -replace "'", "'\''") + "'"
  # Адрес подписки скачиваем здесь: телефон без VPN до него часто не достаёт (блокировки).
  $body = ''
  if ($src -match '^https?://\S+$') {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -UserAgent 'v2rayNG/1.10.0' $src
      $text = if ($resp.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($resp.Content) } else { [string]$resp.Content }
      if ($text -match '^[A-Za-z0-9+/=_\-\s]+$') { $text = $text -replace '\s', '' }
      else { $text = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text)) }
      $body = " --es body $text"
    } catch { Say "Подписку с компьютера скачать не удалось ($($_.Exception.Message)) — пробую с телефона." }
  }
  & $adb logcat -c
  $r = (& $adb shell "am broadcast -n $Pkg/.ProvisionReceiver -a $Pkg.SET_VPN --es source $quoted$body") -join "`n"
  if ($r -match 'result=(-?\d+)') {
    if ([int]$Matches[1] -gt 0) { Say "VPN настроен: узлов $($Matches[1])." }
    else { Say "Не получилось настроить VPN: $r" }
  } else {
    # Ответ на broadcast иногда теряется (киоск как раз перезапускается) — смотрим журнал киоска.
    Start-Sleep 5
    $log = (& $adb logcat -d -s KidsPlusProvision) -join "`n"
    if ($log -match 'VPN: узлов (\d+)') { Say "VPN настроен: узлов $($Matches[1])." }
    else { Say 'Не дождался ответа от киоска — проверьте «VPN: подключён» в настройках телефона.' }
  }
}

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { Fail "не найден adb ($adb). Установите Android SDK platform-tools." }
if (-not (Test-Path $Apk)) { Fail "не найден APK киоска: $Apk. Соберите его: docs/kiosk.md." }

Say 'Ищу телефон…'
$devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' }
if (@($devices).Count -eq 0) { Fail 'телефон не подключён или не разрешил отладку (подтвердите запрос на экране телефона).' }
if (@($devices).Count -gt 1) { Fail 'подключено несколько телефонов — оставьте один.' }
$model = "$(& $adb shell getprop ro.product.model)".Trim()
$android = "$(& $adb shell getprop ro.build.version.release)".Trim()
Say "Телефон: $model, Android $android"

$owners = (& $adb shell dpm list-owners) -join "`n"
if ($owners -match $Pkg) {
  Say 'Киоск уже владелец устройства — обновляю приложение.'
  # В детском режиме установка запрещена, в т.ч. с компьютера: снимаем запрет до открытия киоска.
  & $adb shell am broadcast -n "$Pkg/.ProvisionReceiver" -a "$Pkg.ALLOW_UPDATE" | Out-Null
  # Смена запретов перезапускает USB на телефоне (иногда через несколько секунд) — ждём и,
  # если установка оборвалась, пробуем ещё раз.
  Start-Sleep 6
  & $adb wait-for-device
  & $adb install -r $Apk | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Say 'Телефон переподключился — пробую ещё раз…'
    Start-Sleep 5
    & $adb wait-for-device
    & $adb shell am broadcast -n "$Pkg/.ProvisionReceiver" -a "$Pkg.ALLOW_UPDATE" | Out-Null
    Start-Sleep 6
    & $adb wait-for-device
    & $adb install -r $Apk | Out-Host
  }
  if ($LASTEXITCODE -ne 0) {
    Say 'Не установилось. Если киоск старой версии: «Настройки телефона» → «Вернуть телефон в обычный режим», затем снова этот скрипт.'
  }
  & $adb wait-for-device
  & $adb shell am start -n "$Pkg/.MainActivity" | Out-Null
  if ($UpdateVpn) { Set-Vpn }
  # Все правила детского режима — обратно (в т.ч. запрет установки, если обновление не встало).
  & $adb shell am broadcast -n "$Pkg/.ProvisionReceiver" -a "$Pkg.APPLY" | Out-Null
  Say 'Готово.'
  exit 0
}

# Android не разрешает назначить владельца устройства, если на телефоне есть аккаунты.
$accounts = (& $adb shell dumpsys account) -join "`n"
if ($accounts -match 'Accounts:\s*(\d+)' -and [int]$Matches[1] -gt 0) {
  Fail "на телефоне есть аккаунты ($($Matches[1])). Сбросьте телефон и при настройке пропустите вход в Google и Samsung."
}

Say 'Ставлю киоск…'
& $adb install -r $Apk | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'не удалось установить APK.' }

Say 'Назначаю киоск владельцем устройства…'
$out = (& $adb shell dpm set-device-owner "$Pkg/.AdminReceiver") -join "`n"
Write-Host $out
if ($out -notmatch 'Success') { Fail 'не удалось назначить владельца устройства (см. сообщение выше).' }

# Чтобы One UI не выгружал VPN и киоск в фоне.
& $adb shell dumpsys deviceidle whitelist "+$Pkg" | Out-Null
& $adb shell am start -n "$Pkg/.MainActivity" | Out-Null
Set-Vpn

Write-Host ''
Write-Host '✓ Киоск установлен и управляет телефоном.' -ForegroundColor Green
Write-Host 'Дальше на телефоне: придумайте PIN настроек телефона; если VPN не подключён — «Подключить»;'
Write-Host 'затем «Назад к ребёнку» и привяжите телефон к ребёнку по коду из кабинета.'
