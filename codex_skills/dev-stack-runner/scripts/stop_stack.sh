#!/usr/bin/env bash
set -euo pipefail

pids=$(lsof -ti tcp:3004 tcp:8010 tcp:8011 2>/dev/null || true)
if [ -n "$pids" ]; then
  echo "$pids" | xargs kill
fi

sleep 1

pids=$(lsof -ti tcp:3004 tcp:8010 tcp:8011 2>/dev/null || true)
if [ -n "$pids" ]; then
  echo "$pids" | xargs kill -9
fi

echo "stopped: ports 3004, 8010, 8011"
