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

export const CREDIT_PRICE_PER_MINUTE_BRL = 0.27;

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

export function getEstimatedMinutesFromBalance(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed / CREDIT_PRICE_PER_MINUTE_BRL));
}

export function formatEstimatedMinutes(value: string | number) {
  const totalMinutes = getEstimatedMinutesFromBalance(value);
  if (totalMinutes <= 0) {
    return "menos de 1 min";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

export function formatPricePerMinuteLabel() {
  return formatCurrency(CREDIT_PRICE_PER_MINUTE_BRL.toFixed(2));
}

function formatEtaDuration(value: number) {
  const totalSeconds = Math.max(60, Math.floor(value));
  const totalMinutes = Math.max(1, Math.ceil(totalSeconds / 60));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

export function getTranscriptionEtaInfo(
  job: Pick<
    TranscriptionJobDetail,
    "status" | "durationSeconds" | "createdAt" | "translationTargetLanguage" | "generatePdf"
  >,
  nowMs = Date.now()
) {
  if (job.status === "completed" || job.status === "failed") {
    return null;
  }

  if (job.durationSeconds === null || !Number.isFinite(job.durationSeconds) || job.durationSeconds <= 0) {
    return {
      headline: "Calculando previsão inicial",
      helper:
        "Assim que a duração do áudio for validada, mostramos uma estimativa de conclusão. Você pode sair do site e voltar depois."
    };
  }

  const durationSeconds = Math.max(1, job.durationSeconds);
  const chunkCount = Math.max(1, Math.ceil(durationSeconds / 600));
  const estimatedTotalSeconds = Math.max(
    120,
    Math.round(
      90 +
        durationSeconds * 0.18 +
        Math.max(0, chunkCount - 1) * 40 +
        (job.translationTargetLanguage ? Math.max(75, durationSeconds * 0.06) : 0) +
        (job.generatePdf ? 20 : 0)
    )
  );

  const createdAtMs = Date.parse(job.createdAt);
  const elapsedSeconds = Number.isNaN(createdAtMs)
    ? 0
    : Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
  const estimatedRemainingSeconds = Math.max(60, estimatedTotalSeconds - elapsedSeconds);

  if (job.status === "processing") {
    return {
      headline: `Tempo estimado restante: ${formatEtaDuration(estimatedRemainingSeconds)}`,
      helper: "O processamento continua em segundo plano. Você pode fechar o site e voltar mais tarde."
    };
  }

  return {
    headline: `Previsão inicial: ${formatEtaDuration(estimatedTotalSeconds)}`,
    helper: "Assim que o job começar a processar, essa previsão passa a refletir o tempo restante. Você pode sair do site sem perder o andamento."
  };
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
  const baseName = (parts[parts.length - 1] || objectKey).trim();

  if (!baseName) {
    return objectKey;
  }

  const prefixedUploadMatch = baseName.match(
    /^\d{10,17}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i
  );

  if (prefixedUploadMatch?.[1]) {
    return prefixedUploadMatch[1];
  }

  return baseName;
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
