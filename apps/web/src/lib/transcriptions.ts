import type { JobStatus, OutputFormat, TranscriptionJobDetail } from "./types";

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

export function getFileNameFromObjectKey(objectKey: string) {
  const parts = objectKey.split("/");
  if (parts.length === 0) {
    return objectKey;
  }
  return parts[parts.length - 1] || objectKey;
}

export function hasOutputFormat(job: Pick<TranscriptionJobDetail, "outputs">, format: OutputFormat) {
  return job.outputs.some((output) => output.format === format);
}
