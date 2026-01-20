# AI Coding Agent Instructions for Discogs Style Detection Service

Welcome to the Discogs Style Detection Service codebase! This document provides essential guidance for AI coding agents to be productive in this project. The service is a FastAPI-based application for predicting music styles using an ONNX model.

## Project Overview

- **Purpose**: Predict music styles (multi-label, 400 styles) using the `discogs-effnet-bsdynamic-1` ONNX model.
- **Architecture**:
  - `app/`: Core FastAPI application logic.
    - `main.py`: Entry point for the FastAPI server.
    - `api.py`: Defines API endpoints.
    - `config.py`: Configuration management.
    - `logging.py`: Logging setup.
  - `audio/`: Audio preprocessing utilities.
    - `ffmpeg.py`: Handles audio decoding.
    - `preprocess.py`: Generates log-mel spectrograms.
  - `model/`: Model-related utilities.
    - `downloader.py`: Downloads model files.
    - `infer.py`: Runs inference using ONNX runtime.
    - `labels.py`: Manages label mappings.
  - `schemas/`: Defines API response schemas.
  - `models/`: Stores downloaded model files.
  - `scripts/`: Utility scripts (e.g., `check_env.py`).
  - `tests/`: Contains pytest-based test cases.

## Developer Workflows

### Local Development

1. **Environment Setup**:
   ```bash
   python3 scripts/check_env.py
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Run the Server**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
3. **Test the API**:
   ```bash
   curl -F "file=@test.mp3" "http://localhost:8000/predict"
   ```

### Docker Workflow

- Build and run the service:
  ```bash
  docker build -t discogs-style-api .
  docker run --rm -p 8000:8000 -v $(pwd)/models:/app/models discogs-style-api
  ```
- Alternatively, use Docker Compose:
  ```bash
  docker compose up --build
  ```

### Testing

- Run all tests:
  ```bash
  pytest
  ```

## Key Patterns and Conventions

- **Preprocessing**:
  - Audio is decoded to mono float32 using `ffmpeg`.
  - Log-mel spectrograms are generated with a fixed shape of `[n, 128, 96]`.
  - Short clips are padded (`zero` or `loop` based on `PAD_MODE`).
- **Model Management**:
  - Models are downloaded on startup if missing.
  - `PRELOAD_MODEL` ensures the model is loaded into memory at boot.
- **Environment Variables**:
  - Critical variables include `MODEL_DIR`, `MODEL_URL_BASE`, `DEFAULT_CLIP_SECONDS`, and `THRESHOLD_DEFAULT`.
  - See `README.md` for a full list.
- **Error Handling**:
  - Common issues (e.g., missing `ffmpeg`, model download failures) are documented in the `README.md` troubleshooting section.

## External Dependencies

- **ONNX Runtime**: For model inference.
- **FFmpeg**: For audio decoding.
- **Essentia**: Optional, for advanced preprocessing.

## Integration Points

- **API Endpoints**:
  - `GET /health`: Health check.
  - `POST /predict`: Single file prediction.
  - `POST /predict/batch`: Batch prediction.
- **Model Files**:
  - Stored in `models/`.
  - Downloaded from `MODEL_URL_BASE`.

## Examples

- Predict a single file:
  ```bash
  curl -F "file=@test.mp3" "http://localhost:8000/predict"
  ```
- Predict multiple files:
  ```bash
  curl -F "files=@test1.mp3" -F "files=@test2.mp3" "http://localhost:8000/predict/batch"
  ```

## Notes for AI Agents

- Follow the structure and conventions outlined above.
- Refer to `README.md` for additional context and troubleshooting.
- Ensure new code adheres to existing patterns and integrates seamlessly with the project.
