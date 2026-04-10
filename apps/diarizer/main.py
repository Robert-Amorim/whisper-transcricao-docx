import os
import subprocess
import tempfile
from contextlib import asynccontextmanager
from typing import Any

import torch
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pyannote.audio import Pipeline

_pipeline: Pipeline | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    token = os.environ.get("HUGGINGFACE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("HUGGINGFACE_TOKEN environment variable is required")

    model_id = os.environ.get("DIARIZE_MODEL", "pyannote/speaker-diarization-3.1")
    _pipeline = Pipeline.from_pretrained(model_id, use_auth_token=token)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    _pipeline = _pipeline.to(torch.device(device))
    print(f"[diarizer] pipeline '{model_id}' loaded on {device}", flush=True)

    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model_loaded": _pipeline is not None}


@app.post("/diarize")
async def diarize(file: UploadFile = File(...)) -> JSONResponse:
    if _pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not ready")

    original_name = file.filename or "audio.bin"
    suffix = os.path.splitext(original_name)[-1] or ".bin"

    tmp_in_path = ""
    tmp_wav_path = ""

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
            tmp_in.write(await file.read())
            tmp_in_path = tmp_in.name

        tmp_wav_path = tmp_in_path + ".wav"

        # Normalize to mono 16 kHz WAV — required for pyannote compatibility
        result = subprocess.run(
            [
                "ffmpeg", "-v", "error",
                "-i", tmp_in_path,
                "-ac", "1",
                "-ar", "16000",
                "-y", tmp_wav_path,
            ],
            capture_output=True,
        )
        if result.returncode != 0:
            raise HTTPException(
                status_code=422,
                detail=f"Audio conversion failed: {result.stderr.decode()}",
            )

        diarization = _pipeline(tmp_wav_path)
        segments = [
            {
                "speaker": speaker,
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
            }
            for turn, _, speaker in diarization.itertracks(yield_label=True)
        ]
        return JSONResponse({"segments": segments})

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        for path in (tmp_in_path, tmp_wav_path):
            if path:
                try:
                    os.unlink(path)
                except FileNotFoundError:
                    pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
