import type {
  JobStatus,
  OutputFormat,
  TranscriptStatus,
  TranscriptVariant,
  TranscriptionJobDetail
} from "./types";

export const PROCESSING_STATUSES: JobStatus[] = [
  "uploaded",
  "validating",
  "queued",
  "processing"
];

export function formatDateTime(value: string | null) {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString("pt-BR");
}

export function formatCurrency(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return value;
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(amount);
}

export function formatSeconds(value: string | null) {
  if (!value) {
    return "--";
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return `${parsed.toFixed(2)}s`;
}

export function formatDuration(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  const total = Math.max(0, Math.floor(value));
  const hh = Math.floor(total / 3600).toString().padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function formatTimestampLabel(value: string | null) {
  if (!value) {
    return "--:--";
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  const total = Math.max(0, Math.floor(parsed));
  const hh = Math.floor(total / 3600).toString().padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function getStatusLabel(status: JobStatus) {
  switch (status) {
    case "uploaded":
      return "Upload recebido";
    case "validating":
      return "Validando";
    case "queued":
      return "Na fila";
    case "processing":
      return "Processando";
    case "completed":
      return "Concluido";
    case "failed":
      return "Falhou";
    default:
      return status;
  }
}

export function getStatusTone(status: JobStatus) {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "processing":
      return "processing";
    case "queued":
      return "queued";
    case "validating":
      return "validating";
    case "uploaded":
      return "uploaded";
    default:
      return "uploaded";
  }
}

export function getTranscriptStatusLabel(status: TranscriptStatus | null) {
  switch (status) {
    case "pending":
      return "Pendente";
    case "processing":
      return "Processando";
    case "ready":
      return "Pronto";
    case "failed":
      return "Falhou";
    case "regenerating":
      return "Regenerando";
    default:
      return "--";
  }
}

export function getTranscriptStatusTone(status: TranscriptStatus | null) {
  switch (status) {
    case "ready":
      return "completed";
    case "failed":
      return "failed";
    case "processing":
    case "regenerating":
      return "processing";
    case "pending":
      return "queued";
    default:
      return "queued";
  }
}

export function getFileNameFromObjectKey(objectKey: string) {
  const parts = objectKey.split("/");
  if (parts.length === 0) {
    return objectKey;
  }
  return parts[parts.length - 1] || objectKey;
}

export function hasOutputFormat(
  job: Pick<TranscriptionJobDetail, "outputs">,
  format: OutputFormat,
  variant?: TranscriptVariant
) {
  return job.outputs.some((output) => output.format === format && (!variant || output.variant === variant));
}

export function getOutputsForVariant(
  job: Pick<TranscriptionJobDetail, "outputs">,
  variant: TranscriptVariant
) {
  return job.outputs.filter((output) => output.variant === variant);
}
