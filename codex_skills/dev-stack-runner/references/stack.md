# NEWSETki Dev Stack Reference

## Default root
- `NEWSETKI_ROOT=/Users/apple/Desktop/NEWSETki`
- Override by setting `NEWSETKI_ROOT` before running scripts.

## Services and ports
- Frontend (Vite): `http://localhost:3004`
- BPM/Key backend: `http://localhost:8011`
- Style backend: `http://localhost:8010`

## Log locations
Default: `/tmp`
- `dj-zoken-dev-3004.log`
- `dj-analyze-backend-8011.log`
- `musicgenrenew.log`

Override by setting `NEWSETKI_LOG_DIR`.

## Manual start commands
Frontend:
```
cd /Users/apple/Desktop/NEWSETki/apps/frontend/DJ-ZOKEN
VITE_ANALYSIS_API=http://localhost:8011/api \
VITE_STYLE_API=http://localhost:8010 \
npm run dev -- --port 3004
```

BPM/Key backend:
```
cd /Users/apple/Desktop/NEWSETki/apps/backend/bpmkey_backend/backend
.venv/bin/uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8011
```

Style backend:
```
cd /Users/apple/Desktop/NEWSETki/apps/backend/musicgenrenew
.venv/bin/python -m uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8010
```

## Optional backends
`apps/backend/musicheat` and `apps/backend/newenergy` do not have a standardized start command in this skill. Start them manually if needed and document their ports here when known.
