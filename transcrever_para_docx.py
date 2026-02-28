from __future__ import annotations

import importlib
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from typing import Any

def seconds_to_hhmmss(seconds: float) -> str:
    s = int(seconds)
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:02d}"


def load_dependencies() -> tuple[Any, Any] | None:
    missing: list[str] = []

    whisper_module: Any = None
    docx_module: Any = None

    try:
        whisper_module = importlib.import_module("whisper")
    except ModuleNotFoundError:
        missing.append("openai-whisper")

    try:
        docx_module = importlib.import_module("docx")
    except ModuleNotFoundError:
        missing.append("python-docx")

    if missing:
        print("Dependências ausentes:", ", ".join(missing))
        print("Use o ambiente correto e instale com:")
        print(r"  .\.venv311\Scripts\python.exe -m pip install -r requirements.txt")
        return None

    return whisper_module, docx_module


def ensure_mono_wav(audio_path: str) -> str | None:
    audio_dir = os.path.dirname(os.path.abspath(audio_path))
    base, ext = os.path.splitext(os.path.basename(audio_path))
    ext = ext.lower()

    if base.endswith("_mono") and ext == ".wav":
        print("Audio ja esta em *_mono.wav. Pulando conversao.")
        return audio_path

    mono_path = os.path.join(audio_dir, f"{base}_mono.wav")
    print(f"Convertendo para mono/16kHz: {os.path.basename(mono_path)}")

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        audio_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        mono_path,
    ]
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as exc:
        print(f"Falha ao converter audio para mono: {exc}")
        return None

    return mono_path


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python transcrever_para_docx.py <caminho_do_audio> [modelo]")
        print("Ex.: python transcrever_para_docx.py audio.mp3 base")
        return 2

    deps = load_dependencies()
    if deps is None:
        return 2
    whisper, docx = deps

    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) >= 3 else "base"  # bom p/ CPU

    if not os.path.exists(audio_path):
        print(f"Arquivo não encontrado: {audio_path}")
        return 2

    if shutil.which("ffmpeg") is None:
        print("FFmpeg não encontrado no PATH. Instale o FFmpeg e tente novamente.")
        return 2

    prepared_audio_path = ensure_mono_wav(audio_path)
    if prepared_audio_path is None:
        return 1

    device = "cpu"
    print(f"Device: {device}")
    print("Rodando em CPU (CUDA desativado por configuração).")

    try:
        model = whisper.load_model(model_name, device=device)
    except Exception as exc:
        print(f"Falha ao carregar modelo '{model_name}': {exc}")
        return 1

    print("Transcrevendo...")
    started_at = time.perf_counter()
    try:
        result = model.transcribe(
            prepared_audio_path,
            language="pt",
            task="transcribe",
            fp16=False,
            verbose=False,
        )
    except Exception as exc:
        print(f"Falha durante a transcrição: {exc}")
        return 1
    transcription_seconds = time.perf_counter() - started_at
    transcription_hhmmss = seconds_to_hhmmss(transcription_seconds)
    print(
        f"Tempo de transcricao: {transcription_hhmmss} ({transcription_seconds:.2f} s)"
    )

    full_text = (result.get("text") or "").strip()
    segments = result.get("segments") or []

    doc = docx.Document()
    doc.add_heading("Transcrição (Whisper local)", level=1)
    doc.add_paragraph(f"Arquivo original: {os.path.basename(audio_path)}")
    doc.add_paragraph(f"Arquivo processado: {os.path.basename(prepared_audio_path)}")
    doc.add_paragraph(f"Modelo: {model_name}")
    doc.add_paragraph(f"Device: {device}")
    doc.add_paragraph(
        f"Tempo de transcricao: {transcription_hhmmss} ({transcription_seconds:.2f} s)"
    )
    doc.add_paragraph(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    doc.add_heading("Texto completo", level=2)
    doc.add_paragraph(full_text if full_text else "(sem texto)")

    if segments:
        doc.add_heading("Trechos com timestamps", level=2)
        for seg in segments:
            start = seconds_to_hhmmss(seg.get("start", 0.0))
            end = seconds_to_hhmmss(seg.get("end", 0.0))
            text = (seg.get("text") or "").strip()
            doc.add_paragraph(f"[{start} → {end}] {text}")

    base = os.path.splitext(os.path.basename(audio_path))[0]
    audio_dir = os.path.dirname(os.path.abspath(audio_path))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    out_path = os.path.join(audio_dir, f"{base}_transcricao_{timestamp}.docx")
    try:
        doc.save(out_path)
    except Exception as exc:
        print(f"Falha ao salvar DOCX: {exc}")
        return 1
    print(f"OK! DOCX gerado: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
