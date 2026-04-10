import type { WhisperSegment } from "./whisper";

export type DiarizationEntry = {
  speaker: string;
  start: number;
  end: number;
};

type DiarizerOptions = {
  serviceUrl: string;
  audioBuffer: Buffer;
  fileName: string;
  timeoutMs: number;
};

export async function callDiarizerService(
  options: DiarizerOptions
): Promise<DiarizationEntry[]> {
  const url = `${options.serviceUrl.replace(/\/+$/, "")}/diarize`;
  const fileBytes = Uint8Array.from(options.audioBuffer);
  const file = new File([fileBytes], options.fileName);

  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Diarizer service error (${response.status}): ${body || response.statusText}`
      );
    }

    const payload = (await response.json()) as { segments?: unknown };
    if (!Array.isArray(payload.segments)) {
      throw new Error("Diarizer returned unexpected response format.");
    }

    return (payload.segments as unknown[]).filter(
      (s): s is DiarizationEntry =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as Record<string, unknown>).speaker === "string" &&
        typeof (s as Record<string, unknown>).start === "number" &&
        typeof (s as Record<string, unknown>).end === "number"
    );
  } finally {
    clearTimeout(timeout);
  }
}

// Assigns speaker labels to transcript segments by finding the diarization
// entry with the greatest time overlap for each segment's window.
// Speaker IDs from pyannote (e.g. "SPEAKER_00") are normalized to "Falante 1", etc.
export function applyDiarizationToSegments(
  segments: WhisperSegment[],
  diarization: DiarizationEntry[]
): WhisperSegment[] {
  if (diarization.length === 0) {
    return segments;
  }

  const speakerMap = new Map<string, string>();

  return segments.map((segment) => {
    const start = segment.startSec ?? 0;
    const end = segment.endSec ?? start + 1;

    let bestSpeaker = "";
    let bestOverlap = 0;

    for (const d of diarization) {
      const overlapStart = Math.max(start, d.start);
      const overlapEnd = Math.min(end, d.end);
      const overlap = overlapEnd - overlapStart;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = d.speaker;
      }
    }

    if (!bestSpeaker) {
      return segment;
    }

    if (!speakerMap.has(bestSpeaker)) {
      speakerMap.set(bestSpeaker, `Falante ${speakerMap.size + 1}`);
    }

    return { ...segment, speakerLabel: speakerMap.get(bestSpeaker) ?? null };
  });
}
