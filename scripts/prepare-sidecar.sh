#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ROOT_DIR=$(CDPATH= cd -- "$FRONTEND_DIR/.." && pwd)
BACKEND_DIR="$ROOT_DIR/tauri_backend"
BIN_DIR="$FRONTEND_DIR/src-tauri/binaries"

TARGET_TRIPLE=$(rustc -vV | sed -n 's/^host: //p')
if [ "$TARGET_TRIPLE" = "" ]; then
  echo "Failed to detect Rust host target triple"
  exit 1
fi

mkdir -p "$BIN_DIR"

cd "$BACKEND_DIR"
cargo build --release

SOURCE_BIN="$BACKEND_DIR/target/release/tauri_backend"
TARGET_BIN="$BIN_DIR/tauri-backend-$TARGET_TRIPLE"

if [ ! -f "$SOURCE_BIN" ]; then
  echo "Expected sidecar binary not found: $SOURCE_BIN"
  exit 1
fi

cp "$SOURCE_BIN" "$TARGET_BIN"
chmod +x "$TARGET_BIN"
echo "Prepared sidecar: $TARGET_BIN"
