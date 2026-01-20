# DJ Analyze Backend

FastAPI service that analyzes BPM and musical key from audio files. It uses the following priority:

1) Serato/Rekordbox tags (if present)
2) Essentia (optional)
3) Librosa (fallback)

It never writes tags to the audio file.

## Setup

```bash
cd /Users/apple/Desktop/NEWSETki/202619/DJ-ZOKEN/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Optional (recommended): install Essentia if you have a compatible build.

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API

### POST /api/analyze

Single file (multipart/form-data `file`).

Example:

```bash
curl -F "file=@song.mp3" http://localhost:8000/api/analyze
```

### POST /api/analyze/batch

Batch upload (multipart/form-data `files`).

```bash
curl -F "files=@a.mp3" -F "files=@b.mp3" http://localhost:8000/api/analyze/batch
```

Local directory mode (optional):

```bash
curl -F "dir_path=/path/to/audio" http://localhost:8000/api/analyze/batch
```

### GET /api/analyze/stream/{job_id}

Server-Sent Events for batch progress.

## Frontend usage

Single file:

```js
const form = new FormData();
form.append('file', file);
const res = await fetch('http://localhost:8000/api/analyze', { method: 'POST', body: form });
const data = await res.json();
```

Batch + SSE:

```js
const form = new FormData();
files.forEach(f => form.append('files', f));
const res = await fetch('http://localhost:8000/api/analyze/batch', { method: 'POST', body: form });
const { job_id } = await res.json();

const evtSource = new EventSource(`http://localhost:8000/api/analyze/stream/${job_id}`);

evtSource.addEventListener('track_done', (evt) => {
  const track = JSON.parse(evt.data);
  // render track
});

evtSource.addEventListener('track_progress', (evt) => {
  const progress = JSON.parse(evt.data);
  // update progress bar
});
```

## Notes

- If Essentia is not installed, the service will fall back to librosa and emit warnings.
- All analysis is read-only; no tags are modified.
