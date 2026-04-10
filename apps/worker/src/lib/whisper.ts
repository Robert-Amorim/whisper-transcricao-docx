import { extname } from "node:path";

export type WhisperSegment = {
  chunkIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

export type WhisperTranscriptionResult = {
  text: string;
  durationSeconds: number | null;
  segments: WhisperSegment[];
};

type OpenAiTranscriptionOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fileName: string;
  language?: string;
  prompt?: string;
  audioBuffer: Buffer;
  timeoutMs: number;
};

type OpenAiVerboseResponse = {
  text?: string;
  duration?: number;
  segments?: Array<{
    id?: number;
    start?: number;
    end?: number;
    text?: string;
  }>;
};

type OpenAiDiarizedResponse = {
  text?: string;
  segments?: Array<{
    speaker?: string;
    start?: number;
    end?: number;
    text?: string;
  }>;
};

function inferAudioMimeType(fileName: string) {
  switch (extname(fileName).toLowerCase()) {
    case ".mp3":
    case ".mpeg":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

function normalizeSegments(
  rawSegments: OpenAiVerboseResponse["segments"],
  fullText: string,
  durationSeconds: number | null
): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    for (let index = 0; index < rawSegments.length; index += 1) {
      const raw = rawSegments[index];
      const text = (raw.text ?? "").trim();
      if (!text) {
        continue;
      }

      segments.push({
        chunkIndex: segments.length,
        startSec: typeof raw.start === "number" && Number.isFinite(raw.start) ? raw.start : null,
        endSec: typeof raw.end === "number" && Number.isFinite(raw.end) ? raw.end : null,
        text
      });
    }
  }

  if (segments.length > 0) {
    return segments;
  }

  const fallbackText = fullText.trim();
  if (!fallbackText) {
    return [
      {
        chunkIndex: 0,
        startSec: 0,
        endSec: durationSeconds,
        text: "Transcrição sem conteúdo retornado pelo provedor."
      }
    ];
  }

  return [
    {
      chunkIndex: 0,
      startSec: 0,
      endSec: durationSeconds,
      text: fallbackText
    }
  ];
}

function resolveDurationSeconds(rawDuration: unknown, segments: WhisperSegment[]) {
  if (typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0) {
    return rawDuration;
  }

  const ends = segments
    .map((segment) => segment.endSec)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (ends.length === 0) {
    return null;
  }

  return Math.max(...ends);
}

export function formatSrtTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${millis
    .toString()
    .padStart(3, "0")}`;
}

export function renderTranscriptText(params: {
  id: string;
  sourceObjectKey: string;
  language: string;
  durationSeconds: number | null;
  segments: WhisperSegment[];
  text: string;
}) {
  const header = [
    `Job: ${params.id}`,
    `Language: ${params.language}`,
    `Source: ${params.sourceObjectKey}`,
    `DurationSeconds: ${params.durationSeconds ?? "unknown"}`,
    "",
    params.text.trim(),
    "",
    "--- Segmentos ---"
  ];

  const lines = params.segments.map((segment) => {
    const start =
      segment.startSec !== null ? `${segment.startSec.toFixed(3)}s` : "unknown";
    const end = segment.endSec !== null ? `${segment.endSec.toFixed(3)}s` : "unknown";
    return `[${start} - ${end}] ${segment.text}`;
  });

  return [...header, ...lines, ""].join("\n");
}

export function renderSrtText(segments: WhisperSegment[]) {
  return segments
    .map((segment, index) => {
      const previous = index > 0 ? segments[index - 1] : null;
      const fallbackStart = previous?.endSec ?? index * 5;
      const start = segment.startSec ?? fallbackStart;
      const end =
        segment.endSec ??
        (segment.startSec !== null ? segment.startSec + 5 : fallbackStart + 5);

      return [
        String(index + 1),
        `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(Math.max(end, start + 0.5))}`,
        segment.text,
        ""
      ].join("\n");
    })
    .join("\n");
}

// gpt-4o-transcribe and gpt-4o-mini-transcribe only support "json" or "text"
// response formats; "verbose_json" (with segments/timestamps) is whisper-1 only.
function isGpt4oTranscribeModel(model: string) {
  return (
    model === "gpt-4o-transcribe" ||
    model === "gpt-4o-mini-transcribe"
  );
}

export function isDiarizeModel(model: string) {
  return model === "gpt-4o-transcribe-diarize";
}

function normalizeDiarizedSegments(
  rawSegments: OpenAiDiarizedResponse["segments"],
  fullText: string,
  durationSeconds: number | null
): WhisperSegment[] {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return normalizeSegments([], fullText, durationSeconds);
  }

  // Map API speaker identifiers (e.g. "SPEAKER_0") to friendly Portuguese labels
  const speakerMap = new Map<string, string>();
  const segments: WhisperSegment[] = [];

  for (const raw of rawSegments) {
    const text = (raw.text ?? "").trim();
    if (!text) {
      continue;
    }

    const apiSpeaker = raw.speaker ?? "";
    if (!speakerMap.has(apiSpeaker)) {
      speakerMap.set(apiSpeaker, `Falante ${speakerMap.size + 1}`);
    }

    segments.push({
      chunkIndex: segments.length,
      startSec: typeof raw.start === "number" && Number.isFinite(raw.start) ? raw.start : null,
      endSec: typeof raw.end === "number" && Number.isFinite(raw.end) ? raw.end : null,
      text,
      speakerLabel: speakerMap.get(apiSpeaker) ?? null
    });
  }

  return segments.length > 0 ? segments : normalizeSegments([], fullText, durationSeconds);
}

export async function transcribeWithOpenAi(
  options: OpenAiTranscriptionOptions
): Promise<WhisperTranscriptionResult> {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const fileBytes = Uint8Array.from(options.audioBuffer);
  const file = new File([fileBytes], options.fileName, {
    type: inferAudioMimeType(options.fileName)
  });

  const useDiarize = isDiarizeModel(options.model);
  const useJsonFormat = isGpt4oTranscribeModel(options.model);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", options.model);

  if (useDiarize) {
    // diarize model: requires diarized_json + chunking_strategy; prompt not supported
    formData.append("response_format", "diarized_json");
    formData.append("chunking_strategy", "auto");
    if (options.language && options.language.trim().length > 0) {
      formData.append("language", options.language);
    }
  } else if (useJsonFormat) {
    formData.append("response_format", "json");
    if (options.language && options.language.trim().length > 0) {
      formData.append("language", options.language);
    }
    if (options.prompt && options.prompt.trim().length > 0) {
      formData.append("prompt", options.prompt.trim());
    }
  } else {
    formData.append("response_format", "verbose_json");
    formData.append("temperature", "0");
    if (options.language && options.language.trim().length > 0) {
      formData.append("language", options.language);
    }
    if (options.prompt && options.prompt.trim().length > 0) {
      formData.append("prompt", options.prompt.trim());
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => "");
      throw new Error(
        `OpenAI Whisper request failed (${response.status}): ${rawBody || response.statusText}`
      );
    }

    if (useDiarize) {
      const payload = (await response.json()) as OpenAiDiarizedResponse;
      const text = (payload.text ?? "").trim();
      const segments = normalizeDiarizedSegments(payload.segments, text, null);
      const durationSeconds = resolveDurationSeconds(null, segments);
      return { text, durationSeconds, segments };
    }

    const payload = (await response.json()) as OpenAiVerboseResponse;
    const text = (payload.text ?? "").trim();

    if (useJsonFormat) {
      const segments = normalizeSegments([], text, null);
      return { text, durationSeconds: null, segments };
    }

    const segments = normalizeSegments(payload.segments, text, null);
    const durationSeconds = resolveDurationSeconds(payload.duration, segments);

    return {
      text,
      durationSeconds,
      segments
    };
  } finally {
    clearTimeout(timeout);
  }
}
