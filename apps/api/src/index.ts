import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Queue } from "bullmq";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_MIME_TYPES,
  JOB_STATUSES,
  LEDGER_TYPES,
  OUTPUT_FORMATS,
  TRANSCRIPTION_JOB_NAME
} from "@voxora/shared";
import { z } from "zod";
import {
  createOciObjectStorageService,
  hasAnyOciConfig
} from "./lib/object-storage";

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
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
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
  API_EXTERNAL_URL: z.string().optional(),
  UPLOADS_DIR: z.string().default("storage/uploads"),
  OUTPUTS_DIR: z.string().default("storage/outputs"),
  UPLOAD_SIGNING_SECRET: z.string().optional(),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(524288000),
  OCI_PRIVATE_KEY_PATH: z.string().optional(),
  OCI_TENANCY_OCID: z.string().optional(),
  OCI_USER_OCID: z.string().optional(),
  OCI_FINGERPRINT: z.string().optional(),
  OCI_REGION: z.string().optional(),
  OCI_NAMESPACE: z.string().optional(),
  OCI_BUCKET: z.string().optional(),
  OCI_READ_URL_TTL_MINUTES: z.coerce.number().int().min(1).max(43200).default(10080),
  JWT_SECRET: z.string().min(16).default("change-this-secret-to-a-secure-value"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d")
});

const env = envSchema.parse(process.env);

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

const databaseUrl = buildDatabaseUrl(env);
const redisPassword =
  env.REDIS_PASSWORD && env.REDIS_PASSWORD.trim().length > 0
    ? env.REDIS_PASSWORD
    : undefined;
const uploadsRootDir = resolve(env.UPLOADS_DIR);
const outputsRootDir = resolve(env.OUTPUTS_DIR);
const uploadSigningSecret =
  env.UPLOAD_SIGNING_SECRET && env.UPLOAD_SIGNING_SECRET.length > 0
    ? env.UPLOAD_SIGNING_SECRET
    : env.JWT_SECRET;
const acceptedUploadExtensions = new Set<string>(ACCEPTED_UPLOAD_EXTENSIONS);
const acceptedUploadMimeTypes = new Set<string>(ACCEPTED_UPLOAD_MIME_TYPES);
const ociConfigured = hasAnyOciConfig(env);
const objectStorage = createOciObjectStorageService(env);

const prisma = new PrismaClient({
  datasourceUrl: databaseUrl
});

type TranscriptionQueueData = {
  jobId: string;
  userId: string;
  sourceObjectKey: string;
  language: string;
};

const transcriptionQueue = new Queue<TranscriptionQueueData>(env.TRANSCRIPTION_QUEUE, {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: redisPassword,
    maxRetriesPerRequest: null
  }
});

const registerBodySchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  password: z.string().min(8).max(128)
});

const loginBodySchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(8).max(128)
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(20)
});

const updateMeBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(180).optional(),
    currentPassword: z.string().min(8).max(128).optional(),
    newPassword: z.string().min(8).max(128).optional()
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided."
  })
  .refine((body) => !body.newPassword || !!body.currentPassword, {
    message: "Current password is required to change password.",
    path: ["currentPassword"]
  })
  .refine((body) => !body.currentPassword || !!body.newPassword, {
    message: "New password is required when current password is provided.",
    path: ["newPassword"]
  });

const walletLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  type: z.enum(LEDGER_TYPES).optional()
});

const uploadPresignBodySchema = z.object({
  fileName: z.string().min(3).max(255),
  contentType: z.string().min(3).max(120).optional(),
  sizeBytes: z.coerce.number().int().min(1).max(524288000).optional()
});

const createTranscriptionBodySchema = z.object({
  sourceObjectKey: z.string().min(10).max(500),
  language: z.string().min(2).max(16).default("pt-BR")
});

const transcriptionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(JOB_STATUSES).optional()
});

const transcriptionParamsSchema = z.object({
  id: z.string().min(1)
});

const uploadTokenParamsSchema = z.object({
  uploadToken: z.string().min(20)
});

const transcriptionDownloadQuerySchema = z.object({
  format: z.enum(OUTPUT_FORMATS)
});

type JwtTokenType = "access" | "refresh";
type UploadTokenPayload = {
  objectKey: string;
  userId: string;
  contentType: string;
  maxBytes: number;
  expiresAt: number;
};
type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};
type PublicTranscriptionOutput = {
  format: "txt" | "srt";
  objectKey: string;
  sizeBytes: number;
  createdAt: string;
};
type PublicTranscriptionChunk = {
  chunkIndex: number;
  startSec: string | null;
  endSec: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
};
type PublicTranscriptionJob = {
  id: string;
  status:
    | "uploaded"
    | "validating"
    | "queued"
    | "processing"
    | "completed"
    | "failed";
  sourceObjectKey: string;
  language: string;
  durationSeconds: number | null;
  pricePerMinute: string;
  chargeAmount: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  outputs: PublicTranscriptionOutput[];
  chunks?: PublicTranscriptionChunk[];
};

type UserAuthShape = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

const app = Fastify({
  bodyLimit: env.MAX_UPLOAD_BYTES,
  maxParamLength: 4096,
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug"
  }
});

for (const contentType of new Set([
  ...ACCEPTED_UPLOAD_MIME_TYPES,
  "application/octet-stream"
])) {
  app.addContentTypeParser(contentType, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });
}

if (objectStorage) {
  app.log.info("OCI Object Storage enabled for uploads and downloads.");
} else if (ociConfigured) {
  app.log.warn(
    "OCI_* variables detected but Object Storage is disabled. Falling back to local storage."
  );
}

function encodeTokenPart(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeTokenPart(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function signUploadToken(payload: UploadTokenPayload) {
  const payloadRaw = JSON.stringify(payload);
  const payloadPart = encodeTokenPart(payloadRaw);
  const signature = createHmac("sha256", uploadSigningSecret)
    .update(payloadPart)
    .digest("base64url");
  return `${payloadPart}.${signature}`;
}

function verifyUploadToken(token: string): UploadTokenPayload | null {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = createHmac("sha256", uploadSigningSecret)
    .update(payloadPart)
    .digest("base64url");
  if (!safeCompare(signaturePart, expectedSignature)) {
    return null;
  }

  let payload: UploadTokenPayload;
  try {
    payload = JSON.parse(decodeTokenPart(payloadPart)) as UploadTokenPayload;
  } catch {
    return null;
  }

  if (!payload.expiresAt || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

function trimTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getApiPublicBaseUrl() {
  if (env.API_EXTERNAL_URL && env.API_EXTERNAL_URL.trim().length > 0) {
    return trimTrailingSlash(env.API_EXTERNAL_URL);
  }

  if (env.API_HOST === "0.0.0.0") {
    return `http://localhost:${env.API_PORT}`;
  }

  return `http://${env.API_HOST}:${env.API_PORT}`;
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

function inferMimeTypeByExtension(extension: string) {
  switch (extension) {
    case "mp3":
    case "mpeg":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "audio/webm";
    case "ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

function serializeOutput(output: {
  format: "txt" | "srt";
  objectKey: string;
  sizeBytes: number;
  createdAt: Date;
}): PublicTranscriptionOutput {
  return {
    format: output.format,
    objectKey: output.objectKey,
    sizeBytes: output.sizeBytes,
    createdAt: output.createdAt.toISOString()
  };
}

function serializeChunk(chunk: {
  chunkIndex: number;
  startSec: Prisma.Decimal | null;
  endSec: Prisma.Decimal | null;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}): PublicTranscriptionChunk {
  return {
    chunkIndex: chunk.chunkIndex,
    startSec: chunk.startSec ? chunk.startSec.toString() : null,
    endSec: chunk.endSec ? chunk.endSec.toString() : null,
    status: chunk.status,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString()
  };
}

function serializeTranscriptionJob(
  job: Prisma.TranscriptionJobGetPayload<{ include: { outputs: true } }>
): PublicTranscriptionJob {
  return {
    id: job.id,
    status: job.status,
    sourceObjectKey: job.sourceObjectKey,
    language: job.language,
    durationSeconds: job.durationSeconds,
    pricePerMinute: job.pricePerMinute.toString(),
    chargeAmount: job.chargeAmount ? job.chargeAmount.toString() : null,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    outputs: job.outputs.map((output) => serializeOutput(output))
  };
}

function serializeTranscriptionJobDetail(
  job: Prisma.TranscriptionJobGetPayload<{ include: { outputs: true; chunks: true } }>
): PublicTranscriptionJob {
  return {
    ...serializeTranscriptionJob(job),
    chunks: job.chunks
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => serializeChunk(chunk))
  };
}

function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function issueTokens(user: { id: string; email: string }) {
  return {
    accessToken: app.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        tokenType: "access" as JwtTokenType
      },
      {
        expiresIn: env.JWT_EXPIRES_IN
      }
    ),
    refreshToken: app.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        tokenType: "refresh" as JwtTokenType
      },
      {
        expiresIn: env.JWT_REFRESH_EXPIRES_IN
      }
    )
  };
}

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (request.user.tokenType !== "access") {
      return reply.code(401).send({
        message: "Invalid token type."
      });
    }
    return;
  } catch {
    return reply.code(401).send({
      message: "Unauthorized."
    });
  }
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      message: "Invalid request payload.",
      issues: error.flatten()
    });
  }

  app.log.error(error);
  return reply.code(500).send({
    message: "Internal server error."
  });
});

async function registerRoutes() {
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "api",
    now: new Date().toISOString()
  }));

  app.post("/v1/auth/register", async (request, reply) => {
    const body = registerBodySchema.parse(request.body);
    const email = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (existing) {
      return reply.code(409).send({
        message: "Email already registered."
      });
    }

    const passwordHash = await argon2.hash(body.password, {
      type: argon2.argon2id
    });

    let user: UserAuthShape;
    try {
      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            name: body.name.trim(),
            email,
            passwordHash
          }
        });

        await tx.wallet.create({
          data: {
            userId: createdUser.id
          }
        });

        return createdUser;
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        return reply.code(409).send({
          message: "Email already registered."
        });
      }
      throw error;
    }

    const tokens = issueTokens(user);
    return reply.code(201).send({
      user: serializeUser(user),
      ...tokens
    });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const email = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email }
    });
    if (!user) {
      return reply.code(401).send({
        message: "Invalid credentials."
      });
    }

    const passwordMatches = await argon2.verify(user.passwordHash, body.password);
    if (!passwordMatches) {
      return reply.code(401).send({
        message: "Invalid credentials."
      });
    }

    const tokens = issueTokens(user);
    return reply.send({
      user: serializeUser(user),
      ...tokens
    });
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const body = refreshBodySchema.parse(request.body);

    let payload: {
      sub: string;
      email: string;
      tokenType: JwtTokenType;
    };
    try {
      payload = app.jwt.verify(body.refreshToken) as {
        sub: string;
        email: string;
        tokenType: JwtTokenType;
      };
    } catch {
      return reply.code(401).send({
        message: "Invalid refresh token."
      });
    }

    if (payload.tokenType !== "refresh") {
      return reply.code(401).send({
        message: "Invalid refresh token."
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    });
    if (!user) {
      return reply.code(401).send({
        message: "User not found."
      });
    }

    const tokens = issueTokens(user);
    return reply.send(tokens);
  });

  app.get(
    "/v1/me",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub }
      });
      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }
      return reply.send(serializeUser(user));
    }
  );

  app.put(
    "/v1/me",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const body = updateMeBodySchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.user.sub }
      });
      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }

      const updateData: Prisma.UserUpdateInput = {};
      if (body.name !== undefined) {
        updateData.name = body.name;
      }
      if (body.email !== undefined) {
        updateData.email = body.email.toLowerCase();
      }

      if (body.currentPassword && body.newPassword) {
        const passwordMatches = await argon2.verify(user.passwordHash, body.currentPassword);
        if (!passwordMatches) {
          return reply.code(401).send({
            message: "Current password is invalid."
          });
        }

        updateData.passwordHash = await argon2.hash(body.newPassword, {
          type: argon2.argon2id
        });
      }

      if (Object.keys(updateData).length === 0) {
        return reply.code(400).send({
          message: "No changes were provided."
        });
      }

      try {
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
        return reply.send(serializeUser(updatedUser));
      } catch (error) {
        if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
          return reply.code(409).send({
            message: "Email already registered."
          });
        }
        throw error;
      }
    }
  );

  app.get(
    "/v1/wallet",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: request.user.sub }
      });
      if (!wallet) {
        return reply.code(404).send({
          message: "Wallet not found."
        });
      }

      return reply.send({
        userId: request.user.sub,
        availableBalance: wallet.availableBalance.toString(),
        heldBalance: wallet.heldBalance.toString(),
        updatedAt: wallet.updatedAt.toISOString()
      });
    }
  );

  app.get(
    "/v1/wallet/ledger",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const query = walletLedgerQuerySchema.parse(request.query);
      const where: {
        userId: string;
        type?: (typeof LEDGER_TYPES)[number];
      } = { userId: request.user.sub };

      if (query.type) {
        where.type = query.type;
      }

      const entries = await prisma.walletLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit
      });

      return reply.send({
        items: entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          amount: entry.amount.toString(),
          jobId: entry.jobId,
          paymentId: entry.paymentId,
          idempotencyKey: entry.idempotencyKey,
          createdAt: entry.createdAt.toISOString()
        }))
      });
    }
  );

  app.post(
    "/v1/uploads/presign",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const body = uploadPresignBodySchema.parse(request.body);
      const fileName = body.fileName.trim();
      const extension = extname(fileName).replace(".", "").toLowerCase();
      if (!extension || !acceptedUploadExtensions.has(extension)) {
        return reply.code(400).send({
          message:
            "Unsupported file extension. Allowed: mp3, m4a, wav, mp4, webm, ogg, mpeg."
        });
      }

      const inferredContentType = inferMimeTypeByExtension(extension);
      const contentType = (body.contentType ?? inferredContentType).toLowerCase();
      if (!acceptedUploadMimeTypes.has(contentType)) {
        return reply.code(400).send({
          message: "Unsupported content type."
        });
      }

      const userPrefix = `uploads/${request.user.sub}/`;
      const safeBaseName = fileName
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
      const fileBaseName = safeBaseName.length > 0 ? safeBaseName : "audio";
      const objectKey = `${userPrefix}${Date.now()}-${randomUUID()}-${fileBaseName}.${extension}`;
      const maxBytes = body.sizeBytes ?? env.MAX_UPLOAD_BYTES;

      if (objectStorage) {
        try {
          const presigned = await objectStorage.createObjectWriteUrl(
            objectKey,
            env.UPLOAD_URL_TTL_SECONDS
          );
          return reply.send({
            objectKey,
            method: "PUT",
            uploadUrl: presigned.url,
            requiredHeaders: {
              "content-type": contentType
            },
            maxBytes,
            expiresInSeconds: env.UPLOAD_URL_TTL_SECONDS
          });
        } catch (error) {
          app.log.error(error, "Could not create OCI preauthenticated upload URL.");
          return reply.code(503).send({
            message: "Could not create upload URL."
          });
        }
      }

      const token = signUploadToken({
        objectKey,
        userId: request.user.sub,
        contentType,
        maxBytes,
        expiresAt: Date.now() + env.UPLOAD_URL_TTL_SECONDS * 1000
      });

      return reply.send({
        objectKey,
        method: "PUT",
        uploadUrl: `${getApiPublicBaseUrl()}/v1/uploads/direct/${token}`,
        requiredHeaders: {
          "content-type": contentType
        },
        maxBytes,
        expiresInSeconds: env.UPLOAD_URL_TTL_SECONDS
      });
    }
  );

  app.put<{
    Params: {
      uploadToken: string;
    };
    Body: Buffer;
  }>("/v1/uploads/direct/:uploadToken", async (request, reply) => {
    if (objectStorage) {
      return reply.code(410).send({
        message:
          "Direct upload endpoint is disabled when OCI Object Storage is enabled."
      });
    }

    const params = uploadTokenParamsSchema.parse(request.params);
    const tokenPayload = verifyUploadToken(params.uploadToken);
    if (!tokenPayload) {
      return reply.code(401).send({
        message: "Invalid or expired upload token."
      });
    }

    const body = request.body;
    if (!Buffer.isBuffer(body)) {
      return reply.code(400).send({
        message: "Binary payload expected."
      });
    }
    if (body.length === 0) {
      return reply.code(400).send({
        message: "Empty upload body."
      });
    }
    if (body.length > tokenPayload.maxBytes) {
      return reply.code(413).send({
        message: "Upload exceeds the allowed size."
      });
    }

    const headerContentType = request.headers["content-type"];
    const normalizedHeaderContentType = Array.isArray(headerContentType)
      ? headerContentType[0]?.split(";")[0]?.trim().toLowerCase()
      : headerContentType?.split(";")[0]?.trim().toLowerCase();
    if (normalizedHeaderContentType !== tokenPayload.contentType) {
      return reply.code(400).send({
        message: "Unexpected content type for this upload URL."
      });
    }

    const targetPath = resolveStoragePath(uploadsRootDir, tokenPayload.objectKey);
    if (!targetPath) {
      return reply.code(400).send({
        message: "Invalid object key."
      });
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, body);

    return reply.code(201).send({
      objectKey: tokenPayload.objectKey,
      sizeBytes: body.length
    });
  });

  app.post(
    "/v1/transcriptions",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const body = createTranscriptionBodySchema.parse(request.body);
      const sourceObjectKey = body.sourceObjectKey.trim();
      const userPrefix = `uploads/${request.user.sub}/`;
      if (!sourceObjectKey.startsWith(userPrefix)) {
        return reply.code(403).send({
          message: "Source object does not belong to the authenticated user."
        });
      }

      if (objectStorage) {
        try {
          await objectStorage.headObject(sourceObjectKey);
        } catch (error) {
          if (getErrorStatusCode(error) === 404) {
            return reply.code(404).send({
              message: "Uploaded source file not found."
            });
          }
          app.log.error(error, "Could not validate source object in OCI bucket.");
          return reply.code(503).send({
            message: "Could not validate uploaded source file."
          });
        }
      } else {
        const sourcePath = resolveStoragePath(uploadsRootDir, sourceObjectKey);
        if (!sourcePath || !existsSync(sourcePath)) {
          return reply.code(404).send({
            message: "Uploaded source file not found."
          });
        }
      }

      const job = await prisma.transcriptionJob.create({
        data: {
          userId: request.user.sub,
          status: "uploaded",
          sourceObjectKey,
          language: body.language,
          pricePerMinute: new Prisma.Decimal("0.27")
        },
        include: {
          outputs: true
        }
      });

      try {
        await transcriptionQueue.add(
          TRANSCRIPTION_JOB_NAME,
          {
            jobId: job.id,
            userId: request.user.sub,
            sourceObjectKey: job.sourceObjectKey,
            language: job.language
          },
          {
            jobId: job.id,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000
            },
            removeOnComplete: 100,
            removeOnFail: 200
          }
        );
      } catch (error) {
        app.log.error(error);
        const failedJob = await prisma.transcriptionJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            errorCode: "QUEUE_ENQUEUE_FAILED",
            errorMessage: "Could not enqueue transcription job."
          },
          include: {
            outputs: true
          }
        });
        return reply.code(503).send({
          message: "Could not enqueue transcription job.",
          job: serializeTranscriptionJob(failedJob)
        });
      }

      const queuedJob = await prisma.transcriptionJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          errorCode: null,
          errorMessage: null
        },
        include: {
          outputs: true
        }
      });

      return reply.code(201).send({
        job: serializeTranscriptionJob(queuedJob)
      });
    }
  );

  app.get(
    "/v1/transcriptions",
    {
      preHandler: [authenticate]
    },
    async (request) => {
      const query = transcriptionListQuerySchema.parse(request.query);
      const where: Prisma.TranscriptionJobWhereInput = {
        userId: request.user.sub
      };
      if (query.status) {
        where.status = query.status;
      }

      const jobs = await prisma.transcriptionJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        include: {
          outputs: true
        }
      });

      return {
        items: jobs.map((job) => serializeTranscriptionJob(job))
      };
    }
  );

  app.get(
    "/v1/transcriptions/:id",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const params = transcriptionParamsSchema.parse(request.params);
      const job = await prisma.transcriptionJob.findFirst({
        where: {
          id: params.id,
          userId: request.user.sub
        },
        include: {
          outputs: true,
          chunks: true
        }
      });

      if (!job) {
        return reply.code(404).send({
          message: "Transcription job not found."
        });
      }

      return reply.send({
        job: serializeTranscriptionJobDetail(job)
      });
    }
  );

  app.get(
    "/v1/transcriptions/:id/download",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const params = transcriptionParamsSchema.parse(request.params);
      const query = transcriptionDownloadQuerySchema.parse(request.query);

      const output = await prisma.jobOutput.findFirst({
        where: {
          format: query.format,
          job: {
            id: params.id,
            userId: request.user.sub
          }
        },
        include: {
          job: true
        }
      });
      if (!output) {
        return reply.code(404).send({
          message: "Output not available for this format."
        });
      }

      if (objectStorage) {
        try {
          const presigned = await objectStorage.createObjectReadUrl(
            output.objectKey,
            env.OCI_READ_URL_TTL_MINUTES
          );
          reply.code(302);
          return reply.redirect(presigned.url);
        } catch (error) {
          app.log.error(error, "Could not create OCI preauthenticated download URL.");
          return reply.code(503).send({
            message: "Could not generate download URL."
          });
        }
      }

      const outputPath = resolveStoragePath(outputsRootDir, output.objectKey);
      if (!outputPath || !existsSync(outputPath)) {
        return reply.code(404).send({
          message: "Output file not found."
        });
      }

      const outputContent = await readFile(outputPath);
      if (query.format === "srt") {
        reply.type("application/x-subrip; charset=utf-8");
      } else {
        reply.type("text/plain; charset=utf-8");
      }
      reply.header(
        "content-disposition",
        `attachment; filename="transcription-${output.jobId}.${query.format}"`
      );
      return reply.send(outputContent);
    }
  );
}

async function start() {
  await registerRoutes();

  try {
    await app.listen({
      host: env.API_HOST,
      port: env.API_PORT
    });
  } catch (error) {
    app.log.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals) {
  app.log.info(`Shutting down API on ${signal}.`);
  await app.close();
  await transcriptionQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void start();
