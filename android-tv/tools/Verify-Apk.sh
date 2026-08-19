#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

APKS=(
  "$DIST_DIR/travessia-canarinho-tv-debug.apk"
  "$DIST_DIR/travessia-canarinho-tv-release-unsigned.apk"
)

REQUIRED_ASSETS=(
  "assets/index.html"
  "assets/aaa.js"
  "assets/aaa-core.js"
  "assets/horizontal-controls.js"
)

find_apkanalyzer() {
  if command -v apkanalyzer >/dev/null 2>&1; then
    command -v apkanalyzer
    return 0
  fi

  local sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
  if [[ -n "$sdk_root" ]]; then
    local candidate
    candidate="$(find "$sdk_root" -type f -name apkanalyzer -perm -u+x 2>/dev/null | sort -r | head -n 1 || true)"
    if [[ -n "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  return 1
}

if ! APKANALYZER="$(find_apkanalyzer)"; then
  echo "ERROR: apkanalyzer was not found in PATH, ANDROID_SDK_ROOT or ANDROID_HOME." >&2
  exit 1
fi

verify_apk() {
  local apk="$1"
  local name
  name="$(basename "$apk")"

  if [[ ! -f "$apk" ]]; then
    echo "ERROR: expected APK not found: $apk" >&2
    return 1
  fi

  echo "== Verifying $name =="

  local entries
  entries="$(unzip -Z1 "$apk")"
  for asset in "${REQUIRED_ASSETS[@]}"; do
    if ! grep -Fxq "$asset" <<<"$entries"; then
      echo "ERROR: $name is missing required runtime asset: $asset" >&2
      return 1
    fi
    echo "asset: $asset [present]"
  done

  local permissions
  permissions="$("$APKANALYZER" manifest permissions "$apk")"
  if grep -Fq "android.permission.INTERNET" <<<"$permissions"; then
    echo "ERROR: $name requests forbidden permission android.permission.INTERNET" >&2
    printf '%s\n' "$permissions" >&2
    return 1
  fi

  echo "permission: android.permission.INTERNET [absent]"
  echo "sha256: $(sha256sum "$apk" | awk '{print $1}')"
  echo
}

for apk in "${APKS[@]}"; do
  verify_apk "$apk"
done

echo "APK verification passed for debug and release: HTML shell, premium runtime, runtime core, and horizontal controls are packaged; INTERNET permission is absent."
