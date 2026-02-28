# whisper-transcricao-docx

Transcrição local de áudio em português para `.docx` usando `openai-whisper`.

## Requisitos

- Python 3.11
- FFmpeg no `PATH`

## Instalação

```powershell
py -3.11 -m venv .venv311
.\.venv311\Scripts\python.exe -m pip install -r requirements.txt
```

## Uso rápido

```powershell
.\executar_transcricao.ps1 -AudioPath ".\audio.mp3" -Modelo "base"
```

Ou diretamente:

```powershell
.\.venv311\Scripts\python.exe .\transcrever_para_docx.py ".\audio.mp3" "base"
```

O arquivo gerado terá padrão `*_transcricao_YYYYMMDD_HHMMSS_xxxxxx.docx`.
