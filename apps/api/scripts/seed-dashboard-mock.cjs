#!/usr/bin/env node

const path = require("node:path");
const { mkdir, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const dotenv = require("dotenv");
const argon2 = require("argon2");
const { Prisma, PrismaClient } = require("@prisma/client");

const rootDir = path.resolve(__dirname, "../../..");
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(rootDir, ".env")
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL.trim();
  }

  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const name = process.env.DB_NAME || "voxora";
  const user = encodeURIComponent(process.env.DB_USER || "root");
  const pass = encodeURIComponent(process.env.DB_PASS || "root");

  return `mysql://${user}:${pass}@${host}:${port}/${name}`;
}

const databaseUrl = buildDatabaseUrl();
const prisma = new PrismaClient({
  datasourceUrl: databaseUrl
});

const demoEmail = (process.env.SEED_DEMO_EMAIL || "admin@voxora.ai").trim().toLowerCase();
const demoName = (process.env.SEED_DEMO_NAME || "Usuário Admin").trim();
const demoPassword = process.env.SEED_DEMO_PASSWORD || "Admin@123456";
const outputsRoot = path.resolve(process.env.OUTPUTS_DIR || path.join(rootDir, "storage/outputs"));

function seedId(prefix, userId) {
  const clean = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `seed_${prefix}_${clean}`.slice(0, 150);
}

function dec(value) {
  return new Prisma.Decimal(value);
}

function date(value) {
  return new Date(value);
}

function getJobSeedDefinitions(userId) {
  return [
    {
      id: seedId("job_processing", userId),
      sourceObjectKey: `uploads/${userId}/meeting_record_01.mp3`,
      language: "PT-BR",
      status: "processing",
      pricePerMinute: dec("0.27"),
      chargeAmount: null,
      durationSeconds: 389,
      createdAt: date("2024-05-18T10:45:00-03:00"),
      updatedAt: date("2024-05-18T10:52:00-03:00"),
      completedAt: null,
      errorCode: null,
      errorMessage: null
    },
    {
      id: seedId("job_completed", userId),
      sourceObjectKey: `uploads/${userId}/interview_final.wav`,
      language: "EN-US",
      status: "completed",
      pricePerMinute: dec("0.27"),
      chargeAmount: dec("12.50"),
      durationSeconds: 765,
      createdAt: date("2024-05-18T09:30:00-03:00"),
      updatedAt: date("2024-05-18T09:45:00-03:00"),
      completedAt: date("2024-05-18T09:45:00-03:00"),
      errorCode: null,
      errorMessage: null
    },
    {
      id: seedId("job_failed", userId),
      sourceObjectKey: `uploads/${userId}/podcast_ep32.mp4`,
      language: "PT-BR",
      status: "failed",
      pricePerMinute: dec("0.27"),
      chargeAmount: dec("4.20"),
      durationSeconds: 252,
      createdAt: date("2024-05-18T08:15:00-03:00"),
      updatedAt: date("2024-05-18T08:30:00-03:00"),
      completedAt: null,
      errorCode: "AUDIO_DECODE_ERROR",
      errorMessage: "Falha ao decodificar o áudio (formato inválido)."
    },
    {
      id: seedId("job_queued", userId),
      sourceObjectKey: `uploads/${userId}/aula_metodologia.m4a`,
      language: "ES-ES",
      status: "queued",
      pricePerMinute: dec("0.27"),
      chargeAmount: null,
      durationSeconds: null,
      createdAt: date("2024-05-17T18:00:00-03:00"),
      updatedAt: date("2024-05-17T18:02:00-03:00"),
      completedAt: null,
      errorCode: null,
      errorMessage: null
    },
    {
      id: seedId("job_uploaded", userId),
      sourceObjectKey: `uploads/${userId}/buffer_temp_092.tmp`,
      language: "--",
      status: "uploaded",
      pricePerMinute: dec("0.27"),
      chargeAmount: null,
      durationSeconds: null,
      createdAt: date("2024-05-17T17:30:00-03:00"),
      updatedAt: date("2024-05-17T17:30:00-03:00"),
      completedAt: null,
      errorCode: null,
      errorMessage: null
    }
  ];
}

async function ensureUserAndWallet() {
  const existing = await prisma.user.findUnique({
    where: { email: demoEmail }
  });

  const passwordHash = await argon2.hash(demoPassword, {
    type: argon2.argon2id
  });

  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: demoName,
        passwordHash
      }
    });
  } else {
    user = await prisma.user.create({
      data: {
        name: demoName,
        email: demoEmail,
        passwordHash
      }
    });
  }

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {
      availableBalance: dec("1450.00"),
      heldBalance: dec("0.00")
    },
    create: {
      userId: user.id,
      availableBalance: dec("1450.00"),
      heldBalance: dec("0.00")
    }
  });

  return user;
}

async function seedJobs(userId) {
  const jobs = getJobSeedDefinitions(userId);

  for (const job of jobs) {
    await prisma.transcriptionJob.upsert({
      where: { id: job.id },
      update: {
        userId,
        sourceObjectKey: job.sourceObjectKey,
        language: job.language,
        status: job.status,
        pricePerMinute: job.pricePerMinute,
        chargeAmount: job.chargeAmount,
        durationSeconds: job.durationSeconds,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt
      },
      create: {
        id: job.id,
        userId,
        sourceObjectKey: job.sourceObjectKey,
        language: job.language,
        status: job.status,
        pricePerMinute: job.pricePerMinute,
        chargeAmount: job.chargeAmount,
        durationSeconds: job.durationSeconds,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt
      }
    });
  }

  return jobs;
}

async function seedChunks(jobs) {
  const processingJob = jobs.find((job) => job.status === "processing");
  const completedJob = jobs.find((job) => job.status === "completed");
  const queuedJob = jobs.find((job) => job.status === "queued");

  if (processingJob) {
    await prisma.transcriptionChunk.upsert({
      where: {
        jobId_chunkIndex: {
          jobId: processingJob.id,
          chunkIndex: 0
        }
      },
      update: {
        status: "processing",
        startSec: dec("0"),
        endSec: dec("45")
      },
      create: {
        jobId: processingJob.id,
        chunkIndex: 0,
        status: "processing",
        startSec: dec("0"),
        endSec: dec("45")
      }
    });
  }

  if (queuedJob) {
    await prisma.transcriptionChunk.upsert({
      where: {
        jobId_chunkIndex: {
          jobId: queuedJob.id,
          chunkIndex: 0
        }
      },
      update: {
        status: "queued",
        startSec: null,
        endSec: null
      },
      create: {
        jobId: queuedJob.id,
        chunkIndex: 0,
        status: "queued",
        startSec: null,
        endSec: null
      }
    });
  }

  if (completedJob) {
    await prisma.transcriptionChunk.upsert({
      where: {
        jobId_chunkIndex: {
          jobId: completedJob.id,
          chunkIndex: 0
        }
      },
      update: {
        status: "completed",
        startSec: dec("0"),
        endSec: dec("120")
      },
      create: {
        jobId: completedJob.id,
        chunkIndex: 0,
        status: "completed",
        startSec: dec("0"),
        endSec: dec("120")
      }
    });
  }
}

async function seedOutputs(userId, jobs) {
  const completedJob = jobs.find((job) => job.status === "completed");
  if (!completedJob) {
    return;
  }

  const txtObjectKey = `outputs/${userId}/${completedJob.id}.txt`;
  const srtObjectKey = `outputs/${userId}/${completedJob.id}.srt`;

  await prisma.jobOutput.upsert({
    where: {
      jobId_format: {
        jobId: completedJob.id,
        format: "txt"
      }
    },
    update: {
      objectKey: txtObjectKey,
      sizeBytes: 312
    },
    create: {
      jobId: completedJob.id,
      format: "txt",
      objectKey: txtObjectKey,
      sizeBytes: 312
    }
  });

  await prisma.jobOutput.upsert({
    where: {
      jobId_format: {
        jobId: completedJob.id,
        format: "srt"
      }
    },
    update: {
      objectKey: srtObjectKey,
      sizeBytes: 411
    },
    create: {
      jobId: completedJob.id,
      format: "srt",
      objectKey: srtObjectKey,
      sizeBytes: 411
    }
  });

  const txtPath = path.resolve(outputsRoot, txtObjectKey);
  const srtPath = path.resolve(outputsRoot, srtObjectKey);
  await mkdir(path.dirname(txtPath), { recursive: true });
  await mkdir(path.dirname(srtPath), { recursive: true });

  await writeFile(
    txtPath,
    "Speaker 1: Entao, a ideia principal e organizar a transcricao com clareza.\nSpeaker 2: A leitura fica limpa e pronta para compartilhar.\nSpeaker 1: Vamos preparar a demonstracao para o time.\n",
    "utf8"
  );

  await writeFile(
    srtPath,
    "1\n00:00:00,000 --> 00:00:04,500\nEntao, a ideia principal e organizar a transcricao com clareza.\n\n2\n00:00:04,500 --> 00:00:08,000\nA leitura fica limpa e pronta para compartilhar.\n\n3\n00:00:08,000 --> 00:00:12,000\nVamos preparar a demonstracao para o time.\n",
    "utf8"
  );
}

async function seedLedger(userId, jobs) {
  const completedJob = jobs.find((job) => job.status === "completed");
  const failedJob = jobs.find((job) => job.status === "failed");

  const entries = [
    {
      idempotencyKey: `seed:${userId}:credit`,
      type: "credit",
      amount: dec("500.00"),
      jobId: null,
      createdAt: date("2024-05-18T14:22:00-03:00")
    },
    {
      idempotencyKey: `seed:${userId}:capture:completed`,
      type: "capture",
      amount: dec("12.50"),
      jobId: completedJob ? completedJob.id : null,
      createdAt: date("2024-05-18T09:35:00-03:00")
    },
    {
      idempotencyKey: `seed:${userId}:capture:api`,
      type: "capture",
      amount: dec("4.20"),
      jobId: failedJob ? failedJob.id : null,
      createdAt: date("2024-05-17T23:10:00-03:00")
    },
    {
      idempotencyKey: `seed:${userId}:refund:error`,
      type: "refund",
      amount: dec("8.00"),
      jobId: failedJob ? failedJob.id : null,
      createdAt: date("2024-05-17T11:05:00-03:00")
    }
  ];

  for (const entry of entries) {
    await prisma.walletLedger.upsert({
      where: { idempotencyKey: entry.idempotencyKey },
      update: {
        userId,
        type: entry.type,
        amount: entry.amount,
        jobId: entry.jobId,
        paymentId: null,
        createdAt: entry.createdAt
      },
      create: {
        userId,
        type: entry.type,
        amount: entry.amount,
        jobId: entry.jobId,
        paymentId: null,
        idempotencyKey: entry.idempotencyKey,
        createdAt: entry.createdAt
      }
    });
  }
}

async function main() {
  const user = await ensureUserAndWallet();
  const jobs = await seedJobs(user.id);
  await seedChunks(jobs);
  await seedOutputs(user.id, jobs);
  await seedLedger(user.id, jobs);

  console.log("Dashboard mock seed concluído.");
  console.log(`Usuário: ${demoEmail}`);
  console.log(`Senha: ${demoPassword}`);
}

main()
  .catch((error) => {
    console.error("Falha ao executar seed de dashboard:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
