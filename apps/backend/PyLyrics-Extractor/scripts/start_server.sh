#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PYLYRICS_LOG_DIR:-/tmp}"
ENV_FILE="${ROOT}/.env"

cd "$ROOT"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

export NETEASE_API_BASE_URL="${NETEASE_API_BASE_URL:-http://127.0.0.1:3001}"
export NETEASE_API_FALLBACK_URL="${NETEASE_API_FALLBACK_URL:-}"
export NETEASE_API_TIMEOUT_SEC="${NETEASE_API_TIMEOUT_SEC:-8}"
export HEAT_ENABLE_MOMENTUM="${HEAT_ENABLE_MOMENTUM:-1}"
export HEAT_MOMENTUM_SCALE="${HEAT_MOMENTUM_SCALE:-2.0}"

nohup "${ROOT}/.venv/bin/python" -m uvicorn app.main:app \
  --reload \
  --port 8002 > "${LOG_DIR}/pylyrics-heat-8002.log" 2>&1 &

echo "started pylyrics-extractor on :8002 (log: ${LOG_DIR}/pylyrics-heat-8002.log)"
