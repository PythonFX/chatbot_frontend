#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ROOT_DIR=$(CDPATH= cd -- "$FRONTEND_DIR/.." && pwd)
BACKEND_DIR="$ROOT_DIR/tauri_backend"
BACKEND_ADDR="127.0.0.1:8180"
BACKEND_URL="http://$BACKEND_ADDR/health"

BACKEND_STARTED=0
BACKEND_PID=""
VITE_PID=""

cleanup() {
  if [ "$VITE_PID" != "" ]; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [ "$BACKEND_STARTED" -eq 1 ] && [ "$BACKEND_PID" != "" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if ! curl -sf "$BACKEND_URL" >/dev/null 2>&1; then
  (
    cd "$BACKEND_DIR"
    TAURI_BACKEND_BIND="$BACKEND_ADDR" cargo run
  ) >/tmp/tauri_backend_dev.log 2>&1 &
  BACKEND_PID=$!
  BACKEND_STARTED=1

  READY=0
  ATTEMPTS=0
  while [ "$ATTEMPTS" -lt 60 ]; do
    if curl -sf "$BACKEND_URL" >/dev/null 2>&1; then
      READY=1
      break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    sleep 1
  done

  if [ "$READY" -ne 1 ]; then
    echo "tauri_backend did not become ready on $BACKEND_ADDR"
    echo "Recent log output:"
    tail -n 50 /tmp/tauri_backend_dev.log || true
    exit 1
  fi
fi

cd "$FRONTEND_DIR"
npm run dev -- --host 0.0.0.0 --port 1420 &
VITE_PID=$!
wait "$VITE_PID"
