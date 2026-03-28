import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import { Job, Queue, QueueEvents, Worker } from "bullmq";
import {
  JOB_STATUSES,
  OUTPUT_FORMATS,
  TRANSCRIPTION_JOB_NAME,
  type JobStatus
} from "@voxora/shared";
import { z } from "zod";
import {
  createOciObjectStorageService,
  hasAnyOciConfig
} from "./lib/object-storage";
import {
  renderSrtText,
  renderTranscriptText,
  transcribeWithOpenAi,
  type WhisperSegment
} from "./lib/whisper";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(__dirname, "../../../.env")
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().trim().optional(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1).default("voxora"),
  DB_USER: z.string().min(1).default("root"),
  DB_PASS: z.string().default("root"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_PASSWORD: z.string().optional(),
  TRANSCRIPTION_QUEUE: z.string().default("transcriptions"),
  TRANSCRIPTION_DLQ_QUEUE: z.string().default("transcriptions.dlq"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  WHISPER_PROVIDER: z.enum(["openai", "simulation"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_WHISPER_MODEL: z.string().default("whisper-1"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(300000),
  OPENAI_MAX_FILE_BYTES: z.coerce.number().int().min(1024).default(26214400),
  TRANSCRIPTION_CHUNK_TARGET_SECONDS: z.coerce.number().int().min(30).max(7200).default(600),
  TRANSCRIPTION_CHUNK_OVERLAP_SECONDS: z.coerce.number().min(0).max(30).default(1),
  TRANSCRIPTION_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(600000).default(2000),
  TRANSCRIPTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  RAW_UPLOAD_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  RAW_UPLOAD_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  RAW_UPLOAD_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  OUTPUT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  OUTPUT_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  PRICE_PER_MINUTE: z.coerce.number().positive().default(0.27),
  UPLOADS_DIR: z.string().default("storage/uploads"),
  OUTPUTS_DIR: z.string().default("storage/outputs"),
  OCI_PRIVATE_KEY_PATH: z.string().optional(),
  OCI_TENANCY_OCID: z.string().optional(),
  OCI_USER_OCID: z.string().optional(),
  OCI_FINGERPRINT: z.string().optional(),
  OCI_REGION: z.string().optional(),
  OCI_NAMESPACE: z.string().optional(),
  OCI_BUCKET: z.string().optional()
});

const env = envSchema.parse(process.env);
const monorepoRootDir = resolve(__dirname, "../../../");
const openAiApiKey =
  env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0
    ? env.OPENAI_API_KEY.trim()
    : null;
const whisperProvider =
  env.WHISPER_PROVIDER === "openai" && !openAiApiKey ? "simulation" : env.WHISPER_PROVIDER;

type TranscriptionJobData = {
  jobId: string;
  userId: string;
  sourceObjectKey: string;
  language?: string;
};

type TranscriptionDlqData = {
  jobId: string;
  userId: string;
  sourceObjectKey: string;
  language?: string;
  attempts: number;
  failedAt: string;
  errorCode: string;
  failedReason: string;
};

function buildDatabaseUrl(config: {
  DATABASE_URL?: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASS: string;
}) {
  if (config.DATABASE_URL && config.DATABASE_URL.length > 0) {
    return config.DATABASE_URL;
  }

  const encodedUser = encodeURIComponent(config.DB_USER);
  const encodedPass = encodeURIComponent(config.DB_PASS);
  const auth =
    config.DB_PASS.length > 0 ? `${encodedUser}:${encodedPass}` : encodedUser;

  return `mysql://${auth}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;
}

function resolveStoragePath(rootDir: string, objectKey: string) {
  const normalizedKey = objectKey.replace(/\\/g, "/");
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(resolvedRoot, normalizedKey);
  const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    return null;
  }
  return resolvedTarget;
}

const execFileAsync = promisify(execFile);

async function getMediaDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ],
      {
        windowsHide: true
      }
    );
    const parsed = Number.parseFloat(stdout.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

async function getMediaDurationFromBuffer(
  objectKey: string,
  content: Buffer
): Promise<number | null> {
  const safeName = getObjectFileName(objectKey).replace(/[^a-zA-Z0-9._-]/g, "-");
  const tempPath = join(tmpdir(), `voxora-duration-${randomUUID()}-${safeName || "audio.bin"}`);

  await writeFile(tempPath, content);
  try {
    return await getMediaDurationSeconds(tempPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

function getObjectFileName(objectKey: string) {
  const parts = objectKey.split("/");
  return parts[parts.length - 1] || "audio.bin";
}

function getOpenAiApiKey() {
  if (!openAiApiKey) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Defina a chave para usar o provedor Whisper."
    );
  }

  return openAiApiKey;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown worker error.";
}

class InsufficientCreditsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

type WorkerLogLevel = "info" | "warn" | "error";

function logWorker(level: WorkerLogLevel, message: string, context: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context
  };
  const line = `[worker] ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function getErrorStatusCode(error: unknown) {
  if (typeof error !== "object" || !error) {
    return null;
  }
  if (!("statusCode" in error)) {
    return null;
  }
  const statusCode = Number((error as { statusCode?: number }).statusCode);
  if (!Number.isFinite(statusCode)) {
    return null;
  }
  return statusCode;
}

type AudioChunkWindow = {
  index: number;
  startSec: number;
  endSec: number;
  trimOverlapSec: number;
};

function buildAudioChunkWindows(params: {
  durationSeconds: number;
  targetSeconds: number;
  overlapSeconds: number;
}) {
  const duration = Math.max(1, params.durationSeconds);
  const target = Math.max(1, params.targetSeconds);
  const overlap = Math.max(0, Math.min(params.overlapSeconds, target / 3));

  const windows: AudioChunkWindow[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < duration) {
    const isFirst = index === 0;
    const startSec = isFirst ? 0 : Math.max(0, cursor - overlap);
    const endSec = Math.min(duration, cursor + target);
    const trimOverlapSec = isFirst ? 0 : Math.min(overlap, endSec - startSec);
    windows.push({
      index,
      startSec,
      endSec,
      trimOverlapSec
    });

    if (endSec >= duration) {
      break;
    }

    cursor += target;
    index += 1;
  }

  return windows;
}

async function sliceAudioChunk(params: {
  sourceFilePath: string;
  targetFilePath: string;
  startSec: number;
  durationSec: number;
}) {
  await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      params.startSec.toFixed(3),
      "-t",
      params.durationSec.toFixed(3),
      "-i",
      params.sourceFilePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-acodec",
      "libmp3lame",
      "-f",
      "mp3",
      "-y",
      params.targetFilePath
    ],
    {
      windowsHide: true
    }
  );
}

function getHoldIdempotencyKey(jobId: string) {
  return `job:${jobId}:hold`;
}

function getCaptureIdempotencyKey(jobId: string) {
  return `job:${jobId}:capture`;
}

function getRefundIdempotencyKey(jobId: string) {
  return `job:${jobId}:refund`;
}

async function reserveCreditsForJob(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  jobId: string;
  amount: Prisma.Decimal;
}) {
  const holdKey = getHoldIdempotencyKey(params.jobId);
  const existing = await params.tx.walletLedger.findUnique({
    where: { idempotencyKey: holdKey }
  });
  if (existing) {
    return;
  }

  const updated = await params.tx.wallet.updateMany({
    where: {
      userId: params.userId,
      availableBalance: {
        gte: params.amount
      }
    },
    data: {
      availableBalance: {
        decrement: params.amount
      },
      heldBalance: {
        increment: params.amount
      }
    }
  });
  if (updated.count === 0) {
    throw new InsufficientCreditsError(
      "Saldo insuficiente para processar esta transcricao. Recarregue os creditos."
    );
  }

  await params.tx.walletLedger.create({
    data: {
      userId: params.userId,
      type: "hold",
      amount: params.amount,
      jobId: params.jobId,
      idempotencyKey: holdKey
    }
  });
}

async function captureReservedCreditsForJob(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  jobId: string;
  amount: Prisma.Decimal;
}) {
  const captureKey = getCaptureIdempotencyKey(params.jobId);
  const existing = await params.tx.walletLedger.findUnique({
    where: { idempotencyKey: captureKey }
  });
  if (existing) {
    return;
  }

  const updated = await params.tx.wallet.updateMany({
    where: {
      userId: params.userId,
      heldBalance: {
        gte: params.amount
      }
    },
    data: {
      heldBalance: {
        decrement: params.amount
      }
    }
  });
  if (updated.count === 0) {
    throw new Error("Could not capture reserved credits for this job.");
  }

  await params.tx.walletLedger.create({
    data: {
      userId: params.userId,
      type: "capture",
      amount: params.amount,
      jobId: params.jobId,
      idempotencyKey: captureKey
    }
  });
}

async function refundReservedCreditsForJob(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  jobId: string;
  amount: Prisma.Decimal;
}) {
  const refundKey = getRefundIdempotencyKey(params.jobId);
  const existing = await params.tx.walletLedger.findUnique({
    where: { idempotencyKey: refundKey }
  });
  if (existing) {
    return false;
  }

  const captureEntry = await params.tx.walletLedger.findUnique({
    where: {
      idempotencyKey: getCaptureIdempotencyKey(params.jobId)
    }
  });
  if (captureEntry) {
    return false;
  }

  const holdEntry = await params.tx.walletLedger.findUnique({
    where: {
      idempotencyKey: getHoldIdempotencyKey(params.jobId)
    }
  });
  if (!holdEntry) {
    return false;
  }

  const updated = await params.tx.wallet.updateMany({
    where: {
      userId: params.userId,
      heldBalance: {
        gte: params.amount
      }
    },
    data: {
      heldBalance: {
        decrement: params.amount
      },
      availableBalance: {
        increment: params.amount
      }
    }
  });
  if (updated.count === 0) {
    return false;
  }

  await params.tx.walletLedger.create({
    data: {
      userId: params.userId,
      type: "refund",
      amount: params.amount,
      jobId: params.jobId,
      idempotencyKey: refundKey
    }
  });

  return true;
}

async function transcribeOpenAiWithChunking(params: {
  jobId: string;
  userId: string;
  sourceObjectKey: string;
  language?: string;
  audioBuffer: Buffer;
  durationSeconds: number;
  requestId: string;
}) {
  const fileName = getObjectFileName(params.sourceObjectKey);
  const extension = extname(fileName) || ".bin";
  const bytesPerSecond = Math.max(1, params.audioBuffer.byteLength / params.durationSeconds);
  const maxBySize = Math.floor((env.OPENAI_MAX_FILE_BYTES * 0.85) / bytesPerSecond);
  const chunkTargetSeconds = Math.max(
    30,
    Math.min(
      env.TRANSCRIPTION_CHUNK_TARGET_SECONDS,
      maxBySize > 0 ? maxBySize : env.TRANSCRIPTION_CHUNK_TARGET_SECONDS
    )
  );
  const chunkWindows = buildAudioChunkWindows({
    durationSeconds: params.durationSeconds,
    targetSeconds: chunkTargetSeconds,
    overlapSeconds: env.TRANSCRIPTION_CHUNK_OVERLAP_SECONDS
  });

  const workspaceDir = await mkdtemp(join(tmpdir(), "voxora-chunk-"));
  const sourceFilePath = join(workspaceDir, `source${extension}`);
  await writeFile(sourceFilePath, params.audioBuffer);

  try {
    const mergedSegments: WhisperSegment[] = [];
    const chunkTexts: string[] = [];

    logWorker("info", "Starting chunked transcription.", {
      request_id: params.requestId,
      job_id: params.jobId,
      user_id: params.userId,
      chunks: chunkWindows.length,
      chunk_target_seconds: chunkTargetSeconds,
      chunk_overlap_seconds: env.TRANSCRIPTION_CHUNK_OVERLAP_SECONDS
    });

    for (const chunkWindow of chunkWindows) {
      const chunkDuration = Math.max(0.5, chunkWindow.endSec - chunkWindow.startSec);
      const chunkFilePath = join(workspaceDir, `chunk-${chunkWindow.index}.mp3`);
      await sliceAudioChunk({
        sourceFilePath,
        targetFilePath: chunkFilePath,
        startSec: chunkWindow.startSec,
        durationSec: chunkDuration
      });

      const chunkBuffer = await readFile(chunkFilePath);
      if (chunkBuffer.byteLength > env.OPENAI_MAX_FILE_BYTES) {
        throw new Error(
          `Chunk ${chunkWindow.index} excedeu ${env.OPENAI_MAX_FILE_BYTES} bytes. Ajuste TRANSCRIPTION_CHUNK_TARGET_SECONDS para um valor menor.`
        );
      }

      const chunkTranscription = await transcribeWithOpenAi({
        apiKey: getOpenAiApiKey(),
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_WHISPER_MODEL,
        fileName: `chunk-${chunkWindow.index}.mp3`,
        language: params.language,
        audioBuffer: chunkBuffer,
        timeoutMs: env.OPENAI_TIMEOUT_MS
      });
      if (chunkTranscription.text.trim().length > 0) {
        chunkTexts.push(chunkTranscription.text.trim());
      }

      for (const segment of chunkTranscription.segments) {
        const segmentEndRef = segment.endSec ?? segment.startSec ?? 0;
        if (
          chunkWindow.trimOverlapSec > 0 &&
          Number.isFinite(segmentEndRef) &&
          segmentEndRef <= chunkWindow.trimOverlapSec
        ) {
          continue;
        }

        const normalizedStart =
          segment.startSec !== null
            ? Math.max(segment.startSec, chunkWindow.trimOverlapSec)
            : null;
        const normalizedEnd =
          segment.endSec !== null ? Math.max(segment.endSec, chunkWindow.trimOverlapSec) : null;
        mergedSegments.push({
          chunkIndex: mergedSegments.length,
          startSec:
            normalizedStart !== null
              ? Number((normalizedStart + chunkWindow.startSec).toFixed(3))
              : null,
          endSec:
            normalizedEnd !== null ? Number((normalizedEnd + chunkWindow.startSec).toFixed(3)) : null,
          text: segment.text
        });
      }
    }

    const fullText = mergedSegments.map((segment) => segment.text).join(" ").trim();
    return {
      text: fullText.length > 0 ? fullText : chunkTexts.join(" ").trim(),
      durationSeconds: params.durationSeconds,
      segments: mergedSegments
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const databaseUrl = buildDatabaseUrl(env);
const redisPassword =
  env.REDIS_PASSWORD && env.REDIS_PASSWORD.trim().length > 0
    ? env.REDIS_PASSWORD
    : undefined;
const uploadsRootDir = isAbsolute(env.UPLOADS_DIR)
  ? env.UPLOADS_DIR
  : resolve(monorepoRootDir, env.UPLOADS_DIR);
const outputsRootDir = isAbsolute(env.OUTPUTS_DIR)
  ? env.OUTPUTS_DIR
  : resolve(monorepoRootDir, env.OUTPUTS_DIR);
const dlqQueueName =
  env.TRANSCRIPTION_DLQ_QUEUE && env.TRANSCRIPTION_DLQ_QUEUE.trim().length > 0
    ? env.TRANSCRIPTION_DLQ_QUEUE.trim()
    : `${env.TRANSCRIPTION_QUEUE}.dlq`;
const ociConfigured = hasAnyOciConfig(env);
const objectStorage = createOciObjectStorageService(env);
if (objectStorage) {
  logWorker("info", "OCI Object Storage enabled.", {
    queue: env.TRANSCRIPTION_QUEUE,
    dlq_queue: dlqQueueName
  });
} else if (ociConfigured) {
  logWorker(
    "warn",
    "OCI_* variables detected but Object Storage is disabled. Falling back to local storage.",
    {
      queue: env.TRANSCRIPTION_QUEUE,
      dlq_queue: dlqQueueName
    }
  );
}
if (env.WHISPER_PROVIDER === "openai" && whisperProvider === "simulation") {
  logWorker(
    "warn",
    "OPENAI_API_KEY ausente. Fallback automático para WHISPER_PROVIDER=simulation.",
    {
      queue: env.TRANSCRIPTION_QUEUE
    }
  );
}
const prisma = new PrismaClient({
  datasourceUrl: databaseUrl
});

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  db: env.REDIS_DB,
  password: redisPassword,
  maxRetriesPerRequest: null
};

const queue = new Queue<TranscriptionJobData>(env.TRANSCRIPTION_QUEUE, {
  connection
});

const dlqQueue = new Queue<TranscriptionDlqData>(dlqQueueName, {
  connection
});

const queueEvents = new QueueEvents(env.TRANSCRIPTION_QUEUE, {
  connection
});

let cleanupInFlight = false;
let outputCleanupInFlight = false;
let cleanupTimer: NodeJS.Timeout | null = null;

async function cleanupExpiredRawUploads(trigger: "startup" | "interval") {
  if (cleanupInFlight) {
    return;
  }
  cleanupInFlight = true;

  const cutoff = new Date(Date.now() - env.RAW_UPLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const expiredJobs = await prisma.transcriptionJob.findMany({
      where: {
        status: {
          in: ["completed", "failed"]
        },
        updatedAt: {
          lt: cutoff
        }
      },
      orderBy: {
        updatedAt: "asc"
      },
      take: env.RAW_UPLOAD_CLEANUP_BATCH_SIZE,
      select: {
        id: true,
        userId: true,
        sourceObjectKey: true
      }
    });

    if (expiredJobs.length === 0) {
      return;
    }

    let removed = 0;
    let skipped = 0;
    for (const expiredJob of expiredJobs) {
      if (!expiredJob.sourceObjectKey.startsWith("uploads/")) {
        skipped += 1;
        continue;
      }

      try {
        if (objectStorage) {
          await objectStorage.deleteObject(expiredJob.sourceObjectKey);
        } else {
          const sourceFilePath = resolveStoragePath(uploadsRootDir, expiredJob.sourceObjectKey);
          if (!sourceFilePath || !existsSync(sourceFilePath)) {
            skipped += 1;
            continue;
          }
          await unlink(sourceFilePath);
        }

        await prisma.transcriptionJob.update({
          where: { id: expiredJob.id },
          data: { sourceObjectKey: "" }
        });
        removed += 1;
      } catch (error) {
        const statusCode = getErrorStatusCode(error);
        if (statusCode === 404 || toErrorMessage(error).includes("ENOENT")) {
          skipped += 1;
          continue;
        }
        logWorker("warn", "Failed to cleanup expired raw upload.", {
          trigger,
          job_id: expiredJob.id,
          user_id: expiredJob.userId,
          source_object_key: expiredJob.sourceObjectKey,
          error: toErrorMessage(error)
        });
      }
    }

    logWorker("info", "Expired raw upload cleanup completed.", {
      trigger,
      retention_days: env.RAW_UPLOAD_RETENTION_DAYS,
      scanned: expiredJobs.length,
      removed,
      skipped
    });
  } finally {
    cleanupInFlight = false;
  }
}

async function cleanupExpiredOutputs(trigger: "startup" | "interval") {
  if (outputCleanupInFlight) {
    return;
  }
  outputCleanupInFlight = true;

  const cutoff = new Date(Date.now() - env.OUTPUT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const expiredOutputs = await prisma.jobOutput.findMany({
      where: {
        createdAt: {
          lt: cutoff
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      take: env.OUTPUT_CLEANUP_BATCH_SIZE,
      select: {
        id: true,
        jobId: true,
        format: true,
        objectKey: true,
        job: {
          select: { userId: true }
        }
      }
    });

    if (expiredOutputs.length === 0) {
      return;
    }

    let removed = 0;
    let skipped = 0;
    for (const output of expiredOutputs) {
      if (!output.objectKey.startsWith("outputs/")) {
        skipped += 1;
        continue;
      }

      try {
        if (objectStorage) {
          await objectStorage.deleteObject(output.objectKey);
        } else {
          const outputFilePath = resolveStoragePath(outputsRootDir, output.objectKey);
          if (!outputFilePath || !existsSync(outputFilePath)) {
            skipped += 1;
            continue;
          }
          await unlink(outputFilePath);
        }

        await prisma.jobOutput.delete({ where: { id: output.id } });
        removed += 1;
      } catch (error) {
        const statusCode = getErrorStatusCode(error);
        if (statusCode === 404 || toErrorMessage(error).includes("ENOENT")) {
          await prisma.jobOutput.delete({ where: { id: output.id } }).catch(() => undefined);
          skipped += 1;
          continue;
        }
        logWorker("warn", "Failed to cleanup expired output.", {
          trigger,
          job_id: output.jobId,
          output_id: output.id,
          format: output.format,
          object_key: output.objectKey,
          error: toErrorMessage(error)
        });
      }
    }

    logWorker("info", "Expired output cleanup completed.", {
      trigger,
      retention_days: env.OUTPUT_RETENTION_DAYS,
      scanned: expiredOutputs.length,
      removed,
      skipped
    });
  } finally {
    outputCleanupInFlight = false;
  }
}

const worker = new Worker<TranscriptionJobData>(
  env.TRANSCRIPTION_QUEUE,
  async (job: Job<TranscriptionJobData>) => {
    const validatingStatus: JobStatus = JOB_STATUSES[1];
    const processingStatus: JobStatus = JOB_STATUSES[3];
    const completedStatus: JobStatus = JOB_STATUSES[4];
    const failedStatus: JobStatus = JOB_STATUSES[5];
    let heldChargeAmount: Prisma.Decimal | null = null;
    const processingRequestId = randomUUID();
    const configuredAttempts =
      typeof job.opts.attempts === "number" && job.opts.attempts > 0
        ? job.opts.attempts
        : env.TRANSCRIPTION_MAX_ATTEMPTS;

    try {
      logWorker("info", "Processing job started.", {
        request_id: processingRequestId,
        queue_job_id: job.id,
        job_id: job.data.jobId,
        user_id: job.data.userId,
        attempt: job.attemptsMade + 1,
        max_attempts: configuredAttempts
      });

      const jobEntity = await prisma.transcriptionJob.findUnique({
        where: {
          id: job.data.jobId
        }
      });
      if (!jobEntity || jobEntity.userId !== job.data.userId) {
        throw new Error("Job not found or ownership mismatch.");
      }

      await prisma.transcriptionJob.update({
        where: { id: jobEntity.id },
        data: {
          status: validatingStatus,
          errorCode: null,
          errorMessage: null
        }
      });

      let durationSeconds: number | null = null;
      let audioBuffer: Buffer;
      if (objectStorage) {
        await objectStorage.headObject(jobEntity.sourceObjectKey);
        audioBuffer = await objectStorage.getObjectBuffer(jobEntity.sourceObjectKey);
        durationSeconds = await getMediaDurationFromBuffer(
          jobEntity.sourceObjectKey,
          audioBuffer
        );
      } else {
        const sourceFilePath = resolveStoragePath(uploadsRootDir, jobEntity.sourceObjectKey);
        if (!sourceFilePath || !existsSync(sourceFilePath)) {
          throw new Error("Source media file not found.");
        }

        durationSeconds = await getMediaDurationSeconds(sourceFilePath);
        audioBuffer = await readFile(sourceFilePath);
      }

      const estimatedChargeAmount =
        durationSeconds !== null
          ? new Prisma.Decimal(((durationSeconds * env.PRICE_PER_MINUTE) / 60).toFixed(6))
          : null;

      if (estimatedChargeAmount && estimatedChargeAmount.gt(0)) {
        await prisma.$transaction(async (tx) => {
          await reserveCreditsForJob({
            tx,
            userId: jobEntity.userId,
            jobId: jobEntity.id,
            amount: estimatedChargeAmount
          });
          await tx.transcriptionJob.update({
            where: { id: jobEntity.id },
            data: {
              status: processingStatus,
              durationSeconds:
                durationSeconds !== null ? Math.max(1, Math.ceil(durationSeconds)) : null,
              chargeAmount: estimatedChargeAmount
            }
          });
        });
        heldChargeAmount = estimatedChargeAmount;
      } else {
        await prisma.transcriptionJob.update({
          where: { id: jobEntity.id },
          data: {
            status: processingStatus,
            durationSeconds:
              durationSeconds !== null ? Math.max(1, Math.ceil(durationSeconds)) : null
          }
        });
      }

      logWorker("info", "Job moved to processing.", {
        request_id: processingRequestId,
        queue_job_id: job.id,
        job_id: jobEntity.id,
        user_id: jobEntity.userId,
        source_object_key: jobEntity.sourceObjectKey,
        status: processingStatus
      });

      let transcriptionText = "";
      let segments: WhisperSegment[] = [];
      if (whisperProvider === "simulation") {
        transcriptionText =
          "Modo simulação habilitado. Configure OPENAI_API_KEY para usar transcrição real.";
        segments = [
          {
            chunkIndex: 0,
            startSec: 0,
            endSec: durationSeconds,
            text: transcriptionText
          }
        ];
      } else {
        const mustChunkBySize = audioBuffer.byteLength > env.OPENAI_MAX_FILE_BYTES;
        const shouldChunkByDuration =
          durationSeconds !== null &&
          durationSeconds > env.TRANSCRIPTION_CHUNK_TARGET_SECONDS + env.TRANSCRIPTION_CHUNK_OVERLAP_SECONDS;
        if (mustChunkBySize || shouldChunkByDuration) {
          if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            throw new Error(
              "Arquivo exige chunking por tamanho, mas a duração não pôde ser calculada."
            );
          }
          const chunked = await transcribeOpenAiWithChunking({
            jobId: jobEntity.id,
            userId: jobEntity.userId,
            sourceObjectKey: jobEntity.sourceObjectKey,
            language: jobEntity.language,
            audioBuffer,
            durationSeconds,
            requestId: processingRequestId
          });
          transcriptionText = chunked.text.trim();
          durationSeconds = chunked.durationSeconds ?? durationSeconds;
          segments = chunked.segments;
        } else {
          const transcription = await transcribeWithOpenAi({
            apiKey: getOpenAiApiKey(),
            baseUrl: env.OPENAI_BASE_URL,
            model: env.OPENAI_WHISPER_MODEL,
            fileName: getObjectFileName(jobEntity.sourceObjectKey),
            language: jobEntity.language,
            audioBuffer,
            timeoutMs: env.OPENAI_TIMEOUT_MS
          });
          transcriptionText = transcription.text.trim();
          durationSeconds = transcription.durationSeconds ?? durationSeconds;
          segments = transcription.segments;
        }
      }

      if (segments.length === 0) {
        segments = [
          {
            chunkIndex: 0,
            startSec: 0,
            endSec: durationSeconds,
            text: transcriptionText || "Transcrição concluída sem segmentos."
          }
        ];
      }

      const roundedDuration =
        durationSeconds !== null ? Math.max(1, Math.ceil(durationSeconds)) : null;
      const chargeAmount =
        heldChargeAmount ??
        (durationSeconds !== null
          ? new Prisma.Decimal(((durationSeconds * env.PRICE_PER_MINUTE) / 60).toFixed(6))
          : null);

      const txtContent = renderTranscriptText({
        id: jobEntity.id,
        sourceObjectKey: jobEntity.sourceObjectKey,
        language: jobEntity.language,
        durationSeconds,
        segments,
        text: transcriptionText || segments.map((segment) => segment.text).join(" ")
      });
      const srtContent = renderSrtText(segments);

      const txtObjectKey = `outputs/${jobEntity.userId}/${jobEntity.id}.${OUTPUT_FORMATS[0]}`;
      const srtObjectKey = `outputs/${jobEntity.userId}/${jobEntity.id}.${OUTPUT_FORMATS[1]}`;
      if (objectStorage) {
        await objectStorage.putObject(
          txtObjectKey,
          txtContent,
          "text/plain; charset=utf-8"
        );
        await objectStorage.putObject(
          srtObjectKey,
          srtContent,
          "application/x-subrip; charset=utf-8"
        );
      } else {
        const txtOutputPath = resolveStoragePath(outputsRootDir, txtObjectKey);
        const srtOutputPath = resolveStoragePath(outputsRootDir, srtObjectKey);
        if (!txtOutputPath || !srtOutputPath) {
          throw new Error("Invalid output path.");
        }

        await mkdir(dirname(txtOutputPath), { recursive: true });
        await writeFile(txtOutputPath, txtContent, "utf8");
        await mkdir(dirname(srtOutputPath), { recursive: true });
        await writeFile(srtOutputPath, srtContent, "utf8");
      }

      await prisma.$transaction(async (tx) => {
        await tx.transcriptionChunk.deleteMany({
          where: {
            jobId: jobEntity.id
          }
        });
        await tx.transcriptionChunk.createMany({
          data: segments.map((segment) => ({
            jobId: jobEntity.id,
            chunkIndex: segment.chunkIndex,
            startSec:
              segment.startSec !== null
                ? new Prisma.Decimal(segment.startSec.toFixed(3))
                : null,
            endSec:
              segment.endSec !== null
                ? new Prisma.Decimal(segment.endSec.toFixed(3))
                : null,
            status: "completed"
          }))
        });

        await tx.jobOutput.upsert({
          where: {
            jobId_format: {
              jobId: jobEntity.id,
              format: "txt"
            }
          },
          create: {
            jobId: jobEntity.id,
            format: "txt",
            objectKey: txtObjectKey,
            sizeBytes: Buffer.byteLength(txtContent, "utf8")
          },
          update: {
            objectKey: txtObjectKey,
            sizeBytes: Buffer.byteLength(txtContent, "utf8")
          }
        });

        await tx.jobOutput.upsert({
          where: {
            jobId_format: {
              jobId: jobEntity.id,
              format: "srt"
            }
          },
          create: {
            jobId: jobEntity.id,
            format: "srt",
            objectKey: srtObjectKey,
            sizeBytes: Buffer.byteLength(srtContent, "utf8")
          },
          update: {
            objectKey: srtObjectKey,
            sizeBytes: Buffer.byteLength(srtContent, "utf8")
          }
        });

        if (heldChargeAmount && heldChargeAmount.gt(0)) {
          await captureReservedCreditsForJob({
            tx,
            userId: jobEntity.userId,
            jobId: jobEntity.id,
            amount: heldChargeAmount
          });
        }

        await tx.transcriptionJob.update({
          where: { id: jobEntity.id },
          data: {
            status: completedStatus,
            durationSeconds: roundedDuration,
            chargeAmount,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null
          }
        });
      });

      logWorker("info", "Job completed successfully.", {
        request_id: processingRequestId,
        queue_job_id: job.id,
        job_id: jobEntity.id,
        user_id: jobEntity.userId,
        status: completedStatus,
        chunks: segments.length
      });
      return {
        status: completedStatus,
        processedAt: new Date().toISOString(),
        chunks: segments.length
      };
    } catch (error) {
      const message = toErrorMessage(error);
      const errorCode =
        error instanceof InsufficientCreditsError
          ? "INSUFFICIENT_CREDITS"
          : "WORKER_PROCESSING_ERROR";
      logWorker("error", "Job failed during processing.", {
        request_id: processingRequestId,
        queue_job_id: job.id,
        job_id: job.data.jobId,
        user_id: job.data.userId,
        error_code: errorCode,
        error: message,
        attempt: job.attemptsMade + 1
      });

      if (heldChargeAmount && heldChargeAmount.gt(0)) {
        const refundAmount = heldChargeAmount;
        await prisma.$transaction(async (tx) => {
          await refundReservedCreditsForJob({
            tx,
            userId: job.data.userId,
            jobId: job.data.jobId,
            amount: refundAmount
          });
        });
      }

      await prisma.transcriptionJob.updateMany({
        where: { id: job.data.jobId },
        data: {
          status: failedStatus,
          errorCode,
          errorMessage: message
        }
      });

      const isFinalAttempt =
        error instanceof InsufficientCreditsError || job.attemptsMade + 1 >= configuredAttempts;
      if (isFinalAttempt) {
        const failedAt = new Date().toISOString();
        await dlqQueue.add(
          `${TRANSCRIPTION_JOB_NAME}.failed`,
          {
            jobId: job.data.jobId,
            userId: job.data.userId,
            sourceObjectKey: job.data.sourceObjectKey,
            language: job.data.language,
            attempts: job.attemptsMade + 1,
            failedAt,
            errorCode,
            failedReason: message
          },
          {
            jobId: `${job.data.jobId}:${Date.now()}`,
            removeOnComplete: 1000,
            removeOnFail: 1000
          }
        );
        logWorker("warn", "Job routed to DLQ after final failure.", {
          request_id: processingRequestId,
          queue_job_id: job.id,
          job_id: job.data.jobId,
          user_id: job.data.userId,
          dlq_queue: dlqQueueName,
          attempts: job.attemptsMade + 1,
          error_code: errorCode
        });
      }

      if (error instanceof InsufficientCreditsError) {
        job.discard();
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

queueEvents.on("failed", ({ jobId, failedReason }) => {
  logWorker("warn", "Queue event failed.", {
    queue: env.TRANSCRIPTION_QUEUE,
    queue_job_id: jobId,
    failed_reason: failedReason
  });
});

worker.on("ready", async () => {
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const failed = await queue.getFailedCount();
  const dlqWaiting = await dlqQueue.getWaitingCount();

  logWorker("info", "Worker ready.", {
    queue: env.TRANSCRIPTION_QUEUE,
    waiting,
    active,
    failed,
    dlq_queue: dlqQueueName,
    dlq_waiting: dlqWaiting
  });

  void cleanupExpiredRawUploads("startup");
  void cleanupExpiredOutputs("startup");
  cleanupTimer = setInterval(() => {
    void cleanupExpiredRawUploads("interval");
    void cleanupExpiredOutputs("interval");
  }, env.RAW_UPLOAD_CLEANUP_INTERVAL_MINUTES * 60 * 1000);
  cleanupTimer.unref();
});

worker.on("completed", (job) => {
  logWorker("info", "Queue event completed.", {
    queue: env.TRANSCRIPTION_QUEUE,
    queue_job_id: job.id
  });
});

worker.on("error", (error) => {
  logWorker("error", "Worker runtime error.", {
    error: toErrorMessage(error)
  });
});

async function shutdown(signal: NodeJS.Signals) {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  logWorker("info", "Shutting down worker.", {
    signal
  });
  await worker.close();
  await queueEvents.close();
  await queue.close();
  await dlqQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
