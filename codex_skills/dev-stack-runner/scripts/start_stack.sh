#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEWSETKI_ROOT:-/Users/apple/Desktop/NEWSETki}"
LOG_DIR="${NEWSETKI_LOG_DIR:-/tmp}"

FRONTEND_DIR="$ROOT/apps/frontend/DJ-ZOKEN"
BPMKEY_DIR="$ROOT/apps/backend/bpmkey_backend/backend"
STYLE_DIR="$ROOT/apps/backend/musicgenrenew"

nohup "$BPMKEY_DIR/.venv/bin/uvicorn" app.main:app \
  --app-dir "$BPMKEY_DIR" \
  --host 0.0.0.0 \
  --port 8011 > "$LOG_DIR/dj-analyze-backend-8011.log" 2>&1 &

nohup "$STYLE_DIR/.venv/bin/python" -m uvicorn app.main:app \
  --app-dir "$STYLE_DIR" \
  --host 0.0.0.0 \
  --port 8010 > "$LOG_DIR/musicgenrenew.log" 2>&1 &

nohup env VITE_ANALYSIS_API=http://localhost:8011/api \
  VITE_STYLE_API=http://localhost:8010 \
  npm run dev -- --port 3004 \
  > "$LOG_DIR/dj-zoken-dev-3004.log" 2>&1 &

echo "started: frontend 3004, bpm/key 8011, style 8010"
