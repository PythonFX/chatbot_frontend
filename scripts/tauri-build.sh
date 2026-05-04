#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

cd "$FRONTEND_DIR"
sh scripts/prepare-sidecar.sh
VITE_API_BASE_URL=http://127.0.0.1:8180 vite build
