#!/usr/bin/env bash
# Сборка sing-box libbox.aar для киоска (этап 6) из исходников — готовой Android-библиотеки
# sing-box не публикует. Нужны Go, JDK 21, Android SDK и NDK (ANDROID_HOME, ANDROID_NDK_HOME).
#
#   scripts/build-libbox.sh            # arm64 (Galaxy S20+)
#   TARGETS=android/arm64,android/amd64 scripts/build-libbox.sh   # + эмулятор x86_64
#
# Результат: apps/kiosk/android/app/libs/libbox.aar (в git не хранится).
set -euo pipefail

VERSION="${SINGBOX_VERSION:-1.14.3}"
GOMOBILE="${GOMOBILE_VERSION:-v0.1.13}"
TARGETS="${TARGETS:-android/arm64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/kiosk/android/app/libs/libbox.aar"
WORK="${LIBBOX_WORK:-$HOME/.cache/kidsplus/sing-box-$VERSION}"

if [ ! -d "$WORK/.git" ]; then
  mkdir -p "$(dirname "$WORK")"
  git clone -q --depth 1 --branch "v$VERSION" https://github.com/SagerNet/sing-box.git "$WORK"
fi

export GOFLAGS=-buildvcs=false
export PATH="$(go env GOPATH)/bin:$PATH"
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
go install "github.com/sagernet/gomobile/cmd/gomobile@$GOMOBILE"
go install "github.com/sagernet/gomobile/cmd/gobind@$GOMOBILE"
gomobile init

cd "$WORK"
# Только нужное киоску: туннель (gVisor) и uTLS (отпечаток браузера для Reality).
gomobile bind -o libbox.aar -target "$TARGETS" -androidapi 26 \
  -javapkg=io.nekohasekai -libname=box -trimpath \
  -ldflags "-X github.com/sagernet/sing-box/constant.Version=$VERSION -X runtime.godebugDefault=multipathtcp=0,tlssha1=1 -checklinkname=0 -s -w -buildid=" \
  -tags with_gvisor,with_utls,badlinkname,tfogo_checklinkname0 \
  ./experimental/libbox

mkdir -p "$(dirname "$OUT")"
cp libbox.aar "$OUT"
echo "libbox $VERSION ($TARGETS) → $OUT"
