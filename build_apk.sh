#!/usr/bin/env bash
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}=== 1. Check and configure Java & Android SDK environment ===${NC}"

# Detect JAVA_HOME if not explicitly set
if [ -z "$JAVA_HOME" ]; then
  for candidate in \
    "/usr/lib/jvm/java-21-openjdk-amd64" \
    "/usr/lib/jvm/java-21-openjdk" \
    "/usr/lib/jvm/default-java"; do
    if [ -d "$candidate" ]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

# Detect ANDROID_HOME / ANDROID_SDK_ROOT if not set
if [ -z "$ANDROID_HOME" ]; then
  if [ -n "$ANDROID_SDK_ROOT" ] && [ -d "$ANDROID_SDK_ROOT" ]; then
    export ANDROID_HOME="$ANDROID_SDK_ROOT"
  elif [ -d "/opt/android-sdk" ]; then
    export ANDROID_HOME="/opt/android-sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi

if [ -n "$ANDROID_HOME" ]; then
  export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$ANDROID_HOME/build-tools/34.0.0"
fi

echo "JAVA_HOME: ${JAVA_HOME:-'(system default)'}"
echo "ANDROID_HOME: ${ANDROID_HOME:-'(system default)'}"
java -version

echo -e "${BLUE}=== 2. Generate kernel templates from source ===${NC}"
python3 generate_templates.py || python generate_templates.py

echo -e "${BLUE}=== 3. Build frontend Web application (Vite + React) ===${NC}"
npm run build

echo -e "${BLUE}=== 4. Sync Capacitor Android native project ===${NC}"
npx cap sync android

echo -e "${BLUE}=== 5. Prepare build working directory ===${NC}"
# Use temporary directory on ext4/local disk to avoid WSL / 9p file locks, or build in place if native Linux
BUILD_WORK_DIR="${BUILD_WORK_DIR:-/tmp/kaggle_tpu_apk_build_${USER:-user}}"
mkdir -p "$BUILD_WORK_DIR"
echo "Syncing project to $BUILD_WORK_DIR ..."
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude=".gradle" "$SCRIPT_DIR/" "$BUILD_WORK_DIR/"
else
  cp -rf "$SCRIPT_DIR/." "$BUILD_WORK_DIR/"
fi

echo -e "${BLUE}=== 6. Compile Debug APK with Gradle ===${NC}"
cd "$BUILD_WORK_DIR/android"
chmod +x gradlew
./gradlew assembleDebug --no-daemon

OUTPUT_APK="$BUILD_WORK_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$OUTPUT_APK" ]; then
  cp "$OUTPUT_APK" "$SCRIPT_DIR/kaggle-tpu-lab.apk"
  echo -e "${GREEN}======================================================${NC}"
  echo -e "${GREEN}  BUILD SUCCESSFUL!${NC}"
  echo -e "${GREEN}  APK generated at: $SCRIPT_DIR/kaggle-tpu-lab.apk${NC}"
  echo -e "${GREEN}======================================================${NC}"
  ls -lh "$SCRIPT_DIR/kaggle-tpu-lab.apk"
else
  echo -e "${RED}Build failed: Output file not found: $OUTPUT_APK${NC}"
  exit 1
fi
