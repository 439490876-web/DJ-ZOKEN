# Song Identify Service

FastAPI module for fast metadata-based track identification and platform matching.

## Setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

## Identify

```bash
curl -X POST "http://localhost:8000/identify" \
  -F "file=@/path/to/your/song.mp3"
```

## Fetch Master Track

```bash
curl "http://localhost:8000/master/mt_xxx"
```

## Tests

```bash
pytest -q
```

## Netease Enhanced API

### Start api-enhanced (Docker)

```bash
docker run -d -p 3000:3000 --name ncm-api moefurina/ncm-api:latest
```

If you need to clear proxy variables:

```bash
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
  docker run -d -p 3000:3000 --name ncm-api moefurina/ncm-api:latest
```

### Enable real Netease matching

```bash
export NETEASE_API_BASE_URL="http://127.0.0.1:3000"
uvicorn app.main:app --reload --port 8000
```

### Verify endpoints

If search endpoints are unknown, check:

```bash
curl "http://127.0.0.1:3000/docs"
```

Then upload a file and confirm `netease_source=enhanced_api` in response.

## Batch Match Test Script

```bash
python3 scripts/run_match_tests.py \
  --api "http://127.0.0.1:8002/identify" \
  --dir "/Users/xxx/Desktop/test_songs" \
  --out "./out" \
  --concurrency 4
```

## Remix Flow Test Script

```bash
python3 scripts/test_remix_flow.py \
  --api "http://127.0.0.1:8002/identify" \
  --file "/Users/xxx/Desktop/test_songs/Example.mp3"
```
