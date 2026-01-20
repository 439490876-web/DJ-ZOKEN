#!/usr/bin/env bash
set -euo pipefail

for port in 3004 8010 8011; do
  echo "port $port:"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN || echo "  not listening"
done
