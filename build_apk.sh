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
export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
export ANDROID_HOME="/opt/android-sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$ANDROID_HOME/build-tools/34.0.0"

echo "JAVA_HOME: $JAVA_HOME"
echo "ANDROID_HOME: $ANDROID_HOME"
java -version

echo -e "${BLUE}=== 2. Generate kernel templates from source ===${NC}"
python3 generate_templates.py

echo -e "${BLUE}=== 3. Build frontend Web application (Vite + React) ===${NC}"
npm run build

echo -e "${BLUE}=== 4. Sync Capacitor Android native project ===${NC}"
npx cap sync android

echo -e "${BLUE}=== 5. Sync to Linux ext4 virtual disk (avoiding WSL 9p file lock & I/O errors) ===${NC}"
BUILD_WORK_DIR="/root/apk_build"
mkdir -p "$BUILD_WORK_DIR"
echo "Syncing project to $BUILD_WORK_DIR ..."
rsync -a --delete --exclude=".gradle" "$SCRIPT_DIR/" "$BUILD_WORK_DIR/"

echo -e "${BLUE}=== 6. Compile Debug APK with Gradle (running on ext4 high-speed disk) ===${NC}"
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
