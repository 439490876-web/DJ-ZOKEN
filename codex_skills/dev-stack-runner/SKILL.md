---
name: dev-stack-runner
description: Manage the NEWSETki development stack (frontend + multiple backend services). Use when starting, stopping, restarting, checking status, or tailing logs for the NEWSETki local dev services and ports.
---

# Dev Stack Runner

## Overview

Start, stop, and inspect the NEWSETki local dev stack using consistent ports and log locations. Prefer the bundled scripts for repeatable runs, and fall back to the manual commands in references when needed.

## Quick Start

1) Set `NEWSETKI_ROOT` if the project is not at `/Users/apple/Desktop/NEWSETki`.
2) Run `scripts/start_stack.sh` to start frontend + core backends.
3) Run `scripts/status_stack.sh` to confirm ports are listening.
4) Use `scripts/tail_logs.sh` to inspect logs.
5) Run `scripts/stop_stack.sh` before re-running to avoid port conflicts.

## Tasks

### Start the stack
- Use: `scripts/start_stack.sh`
- Default ports: frontend `3004`, bpm/key `8011`, style `8010`
- Logs written to `/tmp` unless `NEWSETKI_LOG_DIR` is set.

### Stop the stack
- Use: `scripts/stop_stack.sh`
- This frees ports `3004`, `8011`, `8010`.

### Check status
- Use: `scripts/status_stack.sh`
- Confirms processes listening on required ports.

### Tail logs
- Use: `scripts/tail_logs.sh`
- Shows the most recent lines from frontend and backend logs.

## References

- `references/stack.md` contains the port map, default paths, and manual startup commands.
