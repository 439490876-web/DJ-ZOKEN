# Discogs Style Detection Service

⚠️ Only Python `3.11` / `3.12` is supported. Python `3.13` is NOT supported. If you detect 3.13, use Docker or install Python 3.11.

FastAPI service for Discogs EffNet style prediction (400 styles, multi-label) using Essentia/MTG `discogs-effnet-bsdynamic-1` ONNX model.

## Quick Start (Local Python 3.11/3.12)

Step 1: preflight check.

```bash
python app/check_env.py
```

Step 2: install ffmpeg (runtime dependency).

```bash
brew install ffmpeg
ffmpeg -version
```

Step 3: create venv (python@3.11).

```bash
brew install python@3.11
rm -rf .venv
/opt/homebrew/opt/python@3.11/bin/python3.11 -m venv .venv
source .venv/bin/activate
python -V
python app/check_env.py
```

Step 4: install deps.

```bash
python -m pip install -U pip setuptools wheel
python -m pip install -r requirements.txt
```

Step 5: run tests.

```bash
pytest -q
```

Step 6: start server.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Step 7: verify with curl.

```bash
curl http://localhost:8000/health
curl -F "file=@test.mp3" "http://localhost:8000/predict?top_k=10&threshold=0.1&clip_seconds=30"
```

If you do not have `test.mp3`, use any mp3 file. Success means `top_styles` is non-empty.

The server downloads the model files on startup into `./models/` if missing.

## Docker

```bash
docker build -t discogs-style-api .
docker run --rm -p 8000:8000 -v "$(pwd)/models:/app/models" discogs-style-api
```

Or with docker-compose:

```bash
docker compose up --build
```

## API

Default behavior: `/predict` runs **drop-only inference**. The returned `top_styles` are based on the detected drop segment, not the full track.

### `GET /health`

Returns:

```json
{
  "status": "ok",
  "model_loaded": true,
  "label_count": 400,
  "output_dim": 400,
  "backbone_output_dim": 400,
  "head_enabled": false,
  "head_output_dim": null
}
```

### `POST /predict`

- multipart form file field: `file`
- query params:
  - `top_k` (default 10)
  - `threshold` (default 0.1)
  - `clip_seconds` (default 30)
  - `segment_mode` (`drop` or `full`, default `drop`)
  - `drop_strategy` (default `energy`)
  - `drop_seconds` (default 20)

Response:

```json
{
  "request_id": "uuid",
  "duration_sec": 30.0,
  "segment": {
    "mode": "drop",
    "start_sec": 12.0,
    "end_sec": 32.0,
    "strategy": "energy",
    "drop_seconds": 20.0
  },
  "top_styles": [
    {"style":"Future Bass","prob":0.72,"genre":"Electronic"}
  ],
  "all_above_threshold": [
    {"style":"Future Bass","prob":0.72,"genre":"Electronic"}
  ],
  "model_info": {"name":"EffnetDiscogs","backend":"onnxruntime","labels":400}
}
```

Examples:

```bash
# default: drop-only
curl -F "file=@song.mp3" http://localhost:8000/predict

# force full track
curl -F "file=@song.mp3" "http://localhost:8000/predict?segment_mode=full"

# custom drop length
curl -F "file=@song.mp3" "http://localhost:8000/predict?drop_seconds=24"
```

Segment-only example:

```bash
curl -F "file=@test.mp3" "http://localhost:8000/predict?segment_mode=drop&drop_strategy=energy&drop_seconds=20"
```

### `POST /predict/batch`

- multipart form files field: `files`
- max files: `MAX_BATCH_FILES` (default 8)

Returns an array of `POST /predict` responses.

## Preprocessing

- ffmpeg decodes to mono float32
- sample rate is read from model JSON (`16000` for Discogs EffNet)
- log-mel spectrogram and 96-frame patches (shape: `[n, 128, 96]`)
- short clips are zero-padded by default (`PAD_MODE=zero`), or looped (`PAD_MODE=loop`)

If Essentia is installed and provides `TensorflowInputDiscogsEffnet`, it will be used; otherwise a numpy-based log-mel pipeline is used.

The service persists `models/style_to_genre.json` on first boot to ensure `genre` values are available even if the model JSON lacks mapping.

## Model Chain

- The Discogs EffNet backbone may output either 400 logits directly or an embedding (dim != 400).
- If the backbone output dim is not 400, the service automatically enables the classification head (`genre_discogs400`) to map embedding -> 400 logits.
- `/health` exposes `backbone_output_dim`, `head_enabled`, and `head_output_dim` so you can verify the active chain.

Inspect model IO and the final chain decision:

```bash
python scripts/inspect_models.py
```

## Environment Variables

- `MODEL_DIR` (default `./models`)
- `MODEL_URL_BASE` (default `https://essentia.upf.edu/models/music-style-classification/discogs-effnet`)
- `MODEL_HEAD_ONNX` (default `genre_discogs400.onnx`)
- `MODEL_HEAD_JSON` (default `genre_discogs400.json`)
- `MODEL_HEAD_URL_BASE` (default `https://essentia.upf.edu/models/music-style-classification/genre_discogs400`)
- `ENABLE_CLASSIFICATION_HEAD` (`auto`/`true`/`false`, default `auto`)
- `HEAD_EXPECTED_DIM` (default 400)
- `DEFAULT_CLIP_SECONDS`
- `TOP_K_DEFAULT`
- `THRESHOLD_DEFAULT`
- `MAX_UPLOAD_MB`
- `MAX_BATCH_FILES`
- `REQUEST_TIMEOUT_SEC`
- `PAD_MODE` (`zero` or `loop`)
- `ONNX_INTRA_OP_THREADS`, `ONNX_INTER_OP_THREADS`, `ONNX_GRAPH_OPT`
- `FFMPEG_BIN`
- `PRELOAD_MODEL` (default true)
- `DEFAULT_DROP_SECONDS` (default 20): inferred drop segment length.
- `DROP_PRE_ROLL_SEC` (default 10): seconds before the peak to mark drop start.
- `DROP_TOP_N_PEAKS` (default 5): number of RMS peaks to consider.
- `DROP_SCORE_W_ENERGY` (default 1.0): weight for mean RMS energy.
- `DROP_SCORE_W_LOW_BAND` (default 0.6): weight for low-band energy ratio.
- `DROP_SCORE_W_FLUX` (default 0.4): weight for spectral flux.
- `DROP_SCORE_W_VARIANCE` (default 0.2): penalty weight for RMS variance.

## Troubleshooting / FAQ

- Python 3.13 install fails: this project does not support 3.13; use Docker or install Python 3.11/3.12.
- If `python app/check_env.py` fails under system Python 3.13, first complete Step 3 to create the venv, then run `python app/check_env.py` again inside the venv.
- `pydantic-core` compile hangs: your Python version lacks wheels; switch to Python 3.11/3.12.
- `ffmpeg` not found: run `brew install ffmpeg` and verify `ffmpeg -version`.
- `onnxruntime` load error: check Python version (must be 3.11/3.12) and reinstall dependencies.
- Empty predictions: increase `clip_seconds` or lower `threshold`.
- If `backend=numpy` shows up in logs, accuracy may drop; install Essentia and set `REQUIRE_ESSENTIA=1`.
- Essentia install (macOS): `pip install essentia` or `conda install -c conda-forge essentia`.

## Manual Model Download (Recommended Fallback)

Use this if SSL / corporate proxy / certificate issues prevent automatic downloads.

```bash
mkdir -p models

CACERT="$(python -c 'import certifi; print(certifi.where())')"

curl -L --fail --cacert "$CACERT" \
  -o "models/discogs-effnet-bsdynamic-1.onnx" \
  "https://essentia.upf.edu/models/music-style-classification/discogs-effnet/discogs-effnet-bsdynamic-1.onnx"

curl -L --fail --cacert "$CACERT" \
  -o "models/discogs-effnet-bsdynamic-1.json" \
  "https://essentia.upf.edu/models/music-style-classification/discogs-effnet/discogs-effnet-bsdynamic-1.json"
```

After downloading, run:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The service will use local model files and skip downloading.

## Acceptance Criteria

- Python 3.11 venv installs dependencies without source builds.
- `pytest -q` is green.
- `/health` returns `model_loaded=true`.
- `/predict` returns non-empty `top_styles`.
- README steps run in order without hidden Python 3.13 dependencies.

## Batch Testing (remixtest)

Start the service:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run the batch script (default input dir: `~/Desktop/remixtest`):

```bash
python scripts/batch_predict_remixtest.py \
  --input_dir ~/Desktop/remixtest \
  --endpoint http://127.0.0.1:8000/predict
```

Outputs are written to `reports/`:

- `reports/remixtest_results.csv`
- `reports/remixtest_results.jsonl`
- `reports/remixtest_summary.md`

The `segment` fields in the output indicate the drop-only inference window (start/end seconds) used for style prediction.
