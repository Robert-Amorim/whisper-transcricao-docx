import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type TranscriptArtifactSegment = {
  segmentIndex: number;
  startSec: number | null;
  endSec: number | null;
  text: string;
  speakerLabel?: string | null;
};

function normalizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(value: string, maxChars = 88) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
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

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "unknown";
  }

  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600).toString().padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function renderTranscriptText(params: {
  id: string;
  sourceObjectKey: string;
  language: string;
  variantLabel: string;
  durationSeconds: number | null;
  segments: TranscriptArtifactSegment[];
}) {
  const header = [
    `Job: ${params.id}`,
    `Variant: ${params.variantLabel}`,
    `Language: ${params.language}`,
    `Source: ${params.sourceObjectKey}`,
    `Duration: ${formatDuration(params.durationSeconds)}`,
    ""
  ];

  const lines = params.segments.map((segment) => {
    const start =
      segment.startSec !== null ? `${segment.startSec.toFixed(3)}s` : "unknown";
    const end = segment.endSec !== null ? `${segment.endSec.toFixed(3)}s` : "unknown";
    const speaker = segment.speakerLabel ? `${segment.speakerLabel}: ` : "";
    return `[${start} - ${end}] ${speaker}${segment.text.trim()}`;
  });

  return [...header, ...lines, ""].join("\n");
}

export function renderSrtText(segments: TranscriptArtifactSegment[]) {
  return segments
    .map((segment, index) => {
      const previous = index > 0 ? segments[index - 1] : null;
      const fallbackStart = previous?.endSec ?? index * 5;
      const start = segment.startSec ?? fallbackStart;
      const end =
        segment.endSec ??
        (segment.startSec !== null ? segment.startSec + 5 : fallbackStart + 5);
      const speakerPrefix = segment.speakerLabel ? `${segment.speakerLabel}: ` : "";

      return [
        String(index + 1),
        `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(Math.max(end, start + 0.5))}`,
        `${speakerPrefix}${segment.text.trim()}`,
        ""
      ].join("\n");
    })
    .join("\n");
}

export async function renderPdfBuffer(params: {
  title: string;
  variantLabel: string;
  language: string;
  durationSeconds: number | null;
  segments: TranscriptArtifactSegment[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 44;
  const lineHeight = 15;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY - requiredHeight > margin) {
      return;
    }
    page = pdf.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - margin;
  };

  const drawLine = (text: string, fontSize = 11, useBold = false, color = rgb(0.15, 0.23, 0.31)) => {
    ensureSpace(lineHeight + 2);
    page.drawText(normalizePdfText(text), {
      x: margin,
      y: cursorY,
      size: fontSize,
      font: useBold ? boldFont : font,
      color
    });
    cursorY -= lineHeight;
  };

  drawLine(params.title, 18, true, rgb(0.1, 0.16, 0.23));
  cursorY -= 4;
  drawLine(`Variante: ${params.variantLabel}`, 10, false, rgb(0.37, 0.45, 0.55));
  drawLine(`Idioma: ${params.language}`, 10, false, rgb(0.37, 0.45, 0.55));
  drawLine(`Duracao: ${formatDuration(params.durationSeconds)}`, 10, false, rgb(0.37, 0.45, 0.55));
  cursorY -= 8;

  for (const segment of params.segments) {
    const start =
      segment.startSec !== null ? formatDuration(segment.startSec) : "--:--:--";
    const end = segment.endSec !== null ? formatDuration(segment.endSec) : "--:--:--";
    const prefix = segment.speakerLabel ? `${segment.speakerLabel} · ${start} - ${end}` : `${start} - ${end}`;
    drawLine(prefix, 10, true, rgb(0.13, 0.36, 0.74));

    for (const line of wrapText(segment.text.trim())) {
      drawLine(line, 10, false, rgb(0.15, 0.23, 0.31));
    }
    cursorY -= 6;
  }

  return Buffer.from(await pdf.save());
}
