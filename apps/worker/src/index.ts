import { execFile } from "node:child_process";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import { Job, Queue, QueueEvents, Worker } from "bullmq";
import {
  JOB_STATUSES,
  OUTPUT_FORMATS,
  TRANSCRIPTION_JOB_NAME,
  type JobStatus
} from "@whisper-transcricao/shared";
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
  DB_NAME: z.string().min(1).default("whisper_transcricao"),
  DB_USER: z.string().min(1).default("root"),
  DB_PASS: z.string().default("root"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_PASSWORD: z.string().optional(),
  TRANSCRIPTION_QUEUE: z.string().default("transcriptions"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  WHISPER_PROVIDER: z.enum(["openai", "simulation"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_WHISPER_MODEL: z.string().default("whisper-1"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(300000),
  OPENAI_MAX_FILE_BYTES: z.coerce.number().int().min(1024).default(26214400),
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

type TranscriptionJobData = {
  jobId: string;
  userId: string;
  sourceObjectKey: string;
  language?: string;
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

function getObjectFileName(objectKey: string) {
  const parts = objectKey.split("/");
  return parts[parts.length - 1] || "audio.bin";
}

function getOpenAiApiKey() {
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Defina a chave para usar o provedor Whisper."
    );
  }

  return env.OPENAI_API_KEY.trim();
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown worker error.";
}

const databaseUrl = buildDatabaseUrl(env);
const redisPassword =
  env.REDIS_PASSWORD && env.REDIS_PASSWORD.trim().length > 0
    ? env.REDIS_PASSWORD
    : undefined;
const uploadsRootDir = resolve(env.UPLOADS_DIR);
const outputsRootDir = resolve(env.OUTPUTS_DIR);
const ociConfigured = hasAnyOciConfig(env);
const objectStorage = createOciObjectStorageService(env);
if (objectStorage) {
  console.log("[worker] OCI Object Storage enabled.");
} else if (ociConfigured) {
  console.warn(
    "[worker] OCI_* variables detected but Object Storage is disabled. Falling back to local storage."
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

const queueEvents = new QueueEvents(env.TRANSCRIPTION_QUEUE, {
  connection
});

const worker = new Worker<TranscriptionJobData>(
  env.TRANSCRIPTION_QUEUE,
  async (job: Job<TranscriptionJobData>) => {
    const validatingStatus: JobStatus = JOB_STATUSES[1];
    const processingStatus: JobStatus = JOB_STATUSES[3];
    const completedStatus: JobStatus = JOB_STATUSES[4];
    const failedStatus: JobStatus = JOB_STATUSES[5];

    try {
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
      } else {
        const sourceFilePath = resolveStoragePath(uploadsRootDir, jobEntity.sourceObjectKey);
        if (!sourceFilePath || !existsSync(sourceFilePath)) {
          throw new Error("Source media file not found.");
        }

        durationSeconds = await getMediaDurationSeconds(sourceFilePath);
        audioBuffer = await readFile(sourceFilePath);
      }

      if (
        env.WHISPER_PROVIDER === "openai" &&
        audioBuffer.byteLength > env.OPENAI_MAX_FILE_BYTES
      ) {
        throw new Error(
          `Arquivo excede o limite de ${env.OPENAI_MAX_FILE_BYTES} bytes para transcrição direta via OpenAI Whisper.`
        );
      }

      await prisma.transcriptionJob.update({
        where: { id: jobEntity.id },
        data: {
          status: processingStatus,
          durationSeconds:
            durationSeconds !== null ? Math.max(1, Math.ceil(durationSeconds)) : null
        }
      });

      console.log(
        `[worker] Job ${job.id} -> ${processingStatus} (${jobEntity.sourceObjectKey})`
      );

      let transcriptionText = "";
      let segments: WhisperSegment[] = [];
      if (env.WHISPER_PROVIDER === "simulation") {
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
        durationSeconds !== null
          ? new Prisma.Decimal(((durationSeconds * env.PRICE_PER_MINUTE) / 60).toFixed(6))
          : null;

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

      console.log(`[worker] Job ${job.id} -> ${completedStatus}`);
      return {
        status: completedStatus,
        processedAt: new Date().toISOString(),
        chunks: segments.length
      };
    } catch (error) {
      const message = toErrorMessage(error);
      console.error(`[worker] Job ${job.id} failed during processing: ${message}`);
      await prisma.transcriptionJob.updateMany({
        where: { id: job.data.jobId },
        data: {
          status: failedStatus,
          errorCode: "WORKER_PROCESSING_ERROR",
          errorMessage: message
        }
      });
      throw error;
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`[worker] Job ${jobId} failed: ${failedReason}`);
});

worker.on("ready", async () => {
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();

  console.log(
    `[worker] Ready on queue '${env.TRANSCRIPTION_QUEUE}' (waiting=${waiting}, active=${active})`
  );
});

worker.on("completed", (job) => {
  console.log(`[worker] Completed job ${job.id}`);
});

worker.on("error", (error) => {
  console.error("[worker] Runtime error:", error);
});

async function shutdown(signal: NodeJS.Signals) {
  console.log(`[worker] Shutting down on ${signal}`);
  await worker.close();
  await queueEvents.close();
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
