#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${NEWSETKI_LOG_DIR:-/tmp}"

echo "==> $LOG_DIR/dj-zoken-dev-3004.log"
tail -n 120 "$LOG_DIR/dj-zoken-dev-3004.log" || true
echo
echo "==> $LOG_DIR/dj-analyze-backend-8011.log"
tail -n 120 "$LOG_DIR/dj-analyze-backend-8011.log" || true
echo
echo "==> $LOG_DIR/musicgenrenew.log"
tail -n 120 "$LOG_DIR/musicgenrenew.log" || true
