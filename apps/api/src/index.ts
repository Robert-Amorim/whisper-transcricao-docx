import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Queue } from "bullmq";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  ACCEPTED_UPLOAD_MIME_TYPES,
  JOB_STATUSES,
  LEDGER_TYPES,
  PAYMENT_STATUSES,
  OUTPUT_FORMATS,
  TRANSCRIPT_VARIANTS,
  TRANSCRIPTION_JOB_NAME
} from "@voxora/shared";
import { z } from "zod";
import {
  createOciObjectStorageService,
  hasAnyOciConfig
} from "./lib/object-storage";
import { createMercadoPagoClient } from "./lib/mercado-pago";

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
  TRANSCRIPTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  TRANSCRIPTION_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(600000).default(2000),
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
  OCI_READ_URL_TTL_MINUTES: z.coerce.number().int().min(1).max(43200).default(60),
  JWT_SECRET: z.string().min(16).default("change-this-secret-to-a-secure-value"),
  PASSWORD_RESET_TOKEN_PEPPER: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  SUPPORT_EMAILS: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  SIGNUP_WELCOME_CREDIT: z.coerce.number().min(0).default(1),
  PIX_MIN_AMOUNT: z.coerce.number().positive().default(10),
  CARD_MIN_AMOUNT: z.coerce.number().positive().default(15),
  PIX_MAX_AMOUNT: z.coerce.number().positive().default(5000),
  PIX_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  PAYMENT_PROVIDER_MODE: z.enum(["mock", "mercado_pago"]).default("mock"),
  PAYMENT_WEBHOOK_SIGNATURE_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(86400)
    .default(300),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADO_PAGO_API_BASE_URL: z.string().url().default("https://api.mercadopago.com"),
  MERCADO_PAGO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  MERCADO_PAGO_WEBHOOK_URL: z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim().length === 0) {
        return undefined;
      }
      return value;
    },
    z.string().url().optional()
  ),
  PAYMENT_DESCRIPTION_PREFIX: z.string().default("Voxora"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(60000),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  EMAIL_HOST: z.string().default("smtpout.secureserver.net"),
  EMAIL_PORT: z.coerce.number().int().default(465),
  EMAIL_SECURE: z.coerce.boolean().default(true),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Voxora <contato@integraretech.com.br>"),
  APP_URL: z.string().default("https://voxora.integraretech.com.br"),
  EMAIL_VERIFICATION_EXPIRES_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  PASSWORD_RESET_EXPIRES_HOURS: z.coerce.number().int().min(1).max(72).default(1)
});

const env = envSchema.parse(process.env);
const MERCADO_PAGO_MIN_PIX_EXPIRES_MINUTES = 30;
const monorepoRootDir = resolve(__dirname, "../../../");
const signupWelcomeCredit = new Prisma.Decimal(env.SIGNUP_WELCOME_CREDIT.toFixed(6));
const adminEmailSet = new Set(
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const supportEmailSet = new Set(
  (env.SUPPORT_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim() || null;
const passwordResetTokenPepper =
  env.PASSWORD_RESET_TOKEN_PEPPER && env.PASSWORD_RESET_TOKEN_PEPPER.trim().length > 0
    ? env.PASSWORD_RESET_TOKEN_PEPPER.trim()
    : env.JWT_SECRET;

if (env.NODE_ENV === "production" && (!env.PASSWORD_RESET_TOKEN_PEPPER || env.PASSWORD_RESET_TOKEN_PEPPER.trim().length === 0)) {
  console.warn(
    "[voxora/api] PASSWORD_RESET_TOKEN_PEPPER is not configured. Falling back to JWT_SECRET for password reset token hashing."
  );
}

if (
  env.PAYMENT_PROVIDER_MODE === "mercado_pago" &&
  env.PIX_EXPIRES_MINUTES < MERCADO_PAGO_MIN_PIX_EXPIRES_MINUTES
) {
  console.warn(
    `[voxora/api] PIX_EXPIRES_MINUTES=${env.PIX_EXPIRES_MINUTES} is below Mercado Pago's minimum. Using ${MERCADO_PAGO_MIN_PIX_EXPIRES_MINUTES} minutes for PIX payments.`
  );
}

// Known disposable/temporary email providers
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.info", "grr.la", "sharklasers.com",
  "spam4.me", "trashmail.com", "trashmail.net", "trashmail.org", "trashmail.at",
  "trashmail.io", "trashmail.me", "yopmail.com", "yopmail.fr", "yopmail.net",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "throwam.com", "throwam.io",
  "dispostable.com", "mailnull.com", "maildrop.cc", "mailnesia.com",
  "spamgourmet.com", "spamgourmet.net", "10minutemail.com", "10minutemail.net",
  "10minutemail.org", "fakeinbox.com", "spamfree24.org", "discard.email",
  "filzmail.com", "getnada.com", "mohmal.com", "throwam.com", "mailexpire.com",
  "spamex.com", "spamoff.de", "e4ward.com", "hmamail.com", "incognitomail.org",
  "mailme.lv", "mailnew.com", "zetmail.com", "deadaddress.com", "meltmail.com",
  "nospamfor.us", "objectmail.com", "spamavert.com", "trashdevil.com",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
]);

// Email transporter (only active when EMAIL_USER and EMAIL_PASS are set)
const emailTransporter = env.EMAIL_USER && env.EMAIL_PASS
  ? nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS }
    })
  : null;

async function sendVerificationEmail(toEmail: string, toName: string, token: string) {
  if (!emailTransporter) return;
  const verifyUrl = `${env.APP_URL}/verificar-email?token=${token}`;
  await emailTransporter.sendMail({
    from: env.EMAIL_FROM,
    to: `${toName} <${toEmail}>`,
    subject: "Confirme seu e-mail — Voxora",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f1923;color:#e2e8f0;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
          <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-1px;">Voxora</span>
        </div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#ffffff;">Confirme seu e-mail</h1>
        <p style="color:#94a3b8;line-height:1.6;margin:0 0 28px;">
          Olá, <strong style="color:#e2e8f0;">${toName}</strong>. Clique no botão abaixo para verificar seu endereço de e-mail e ativar sua conta no Voxora.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;background:#2b8cee;color:#ffffff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;">
          Verificar e-mail
        </a>
        <p style="color:#475569;font-size:13px;margin:28px 0 0;line-height:1.6;">
          Este link expira em ${env.EMAIL_VERIFICATION_EXPIRES_HOURS} horas. Se você não criou uma conta no Voxora, ignore este e-mail.
        </p>
        <hr style="border:none;border-top:1px solid #1e293b;margin:28px 0;" />
        <p style="color:#334155;font-size:12px;margin:0;">
          Ou copie e cole este link no navegador:<br />
          <span style="color:#2b8cee;word-break:break-all;">${verifyUrl}</span>
        </p>
      </div>
    `
  });
}

async function sendPasswordResetEmail(toEmail: string, toName: string, token: string) {
  if (!emailTransporter) return;
  const resetUrl = `${env.APP_URL}/redefinir-senha?token=${token}`;
  await emailTransporter.sendMail({
    from: env.EMAIL_FROM,
    to: `${toName} <${toEmail}>`,
    subject: "Redefina sua senha - Voxora",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f1923;color:#e2e8f0;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
          <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-1px;">Voxora</span>
        </div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#ffffff;">Redefina sua senha</h1>
        <p style="color:#94a3b8;line-height:1.6;margin:0 0 28px;">
          Olá, <strong style="color:#e2e8f0;">${toName}</strong>. Recebemos um pedido para trocar a senha da sua conta. Clique no botão abaixo para escolher uma nova senha.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:#2b8cee;color:#ffffff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;">
          Redefinir senha
        </a>
        <p style="color:#475569;font-size:13px;margin:28px 0 0;line-height:1.6;">
          Este link expira em ${env.PASSWORD_RESET_EXPIRES_HOURS} horas. Se você não solicitou esta alteração, ignore este e-mail.
        </p>
        <hr style="border:none;border-top:1px solid #1e293b;margin:28px 0;" />
        <p style="color:#334155;font-size:12px;margin:0;">
          Ou copie e cole este link no navegador:<br />
          <span style="color:#2b8cee;word-break:break-all;">${resetUrl}</span>
        </p>
      </div>
    `
  });
}

async function sendPasswordChangedEmail(toEmail: string, toName: string) {
  if (!emailTransporter) return;
  await emailTransporter.sendMail({
    from: env.EMAIL_FROM,
    to: `${toName} <${toEmail}>`,
    subject: "Sua senha foi alterada - Voxora",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f1923;color:#e2e8f0;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
          <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-1px;">Voxora</span>
        </div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#ffffff;">Senha alterada com sucesso</h1>
        <p style="color:#94a3b8;line-height:1.6;margin:0 0 16px;">
          Olá, <strong style="color:#e2e8f0;">${toName}</strong>. Confirmamos a alteração da senha da sua conta.
        </p>
        <p style="color:#94a3b8;line-height:1.6;margin:0 0 28px;">
          Se você não reconhece esta ação, redefina sua senha imediatamente e entre em contato com o suporte.
        </p>
        <a href="${env.APP_URL}/login" style="display:inline-block;background:#2b8cee;color:#ffffff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;">
          Ir para o login
        </a>
      </div>
    `
  });
}

async function sendSupportEmail(params: {
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
}) {
  if (!emailTransporter) return;

  const recipientLabel = params.toName?.trim() ? `${params.toName.trim()} <${params.toEmail}>` : params.toEmail;
  const normalizedBody = params.body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="color:#94a3b8;line-height:1.7;margin:0 0 16px;">${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

  await emailTransporter.sendMail({
    from: env.EMAIL_FROM,
    to: recipientLabel,
    subject: params.subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0f1923;color:#e2e8f0;border-radius:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
          <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-1px;">Voxora</span>
          <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.16em;">Suporte</span>
        </div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 14px;color:#ffffff;">${params.subject}</h1>
        ${normalizedBody}
        <hr style="border:none;border-top:1px solid #1e293b;margin:28px 0;" />
        <p style="color:#475569;font-size:13px;margin:0;line-height:1.6;">
          Se você já possui conta, também pode acompanhar seus chamados dentro do painel da Voxora.
        </p>
      </div>
    `
  });
}

async function getStaffNotificationRecipients(excludeUserId?: string | null) {
  return prisma.user.findMany({
    where: {
      role: {
        in: ["support", "admin"]
      },
      ...(excludeUserId
        ? {
            id: {
              not: excludeUserId
            }
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });
}

async function notifyStaffAboutTicket(params: {
  threadId: string;
  subject: string;
  requesterName?: string | null;
  requesterEmail: string;
  categoryLabel: string;
  preview: string;
  excludeUserId?: string | null;
  notificationType: "new_ticket" | "customer_reply" | "public_request";
}) {
  if (!emailTransporter) return;

  const recipients = await getStaffNotificationRecipients(params.excludeUserId);
  if (recipients.length === 0) return;

  const subjectPrefix =
    params.notificationType === "new_ticket"
      ? "Novo ticket"
      : params.notificationType === "public_request"
        ? "Novo contato público"
        : "Nova resposta do cliente";

  const body = [
    `${subjectPrefix}: ${params.subject}`,
    `Solicitante: ${params.requesterName?.trim() || params.requesterEmail} <${params.requesterEmail}>`,
    `Categoria: ${params.categoryLabel}`,
    "",
    params.preview,
    "",
    `Abrir ticket: ${env.APP_URL}/admin/tickets/${params.threadId}`
  ].join("\n");

  await Promise.all(
    recipients.map((recipient) =>
      sendSupportEmail({
        toEmail: recipient.email,
        toName: recipient.name,
        subject: `${subjectPrefix} - ${params.subject}`,
        body
      })
    )
  );
}

async function notifyRequesterAboutTicketReply(params: {
  requesterEmail: string;
  requesterName?: string | null;
  subject: string;
  bodyPreview: string;
}) {
  if (!emailTransporter) return;

  await sendSupportEmail({
    toEmail: params.requesterEmail,
    toName: params.requesterName,
    subject: `Atualização no seu ticket - ${params.subject}`,
    body: [
      "A equipe da Voxora respondeu ao seu chamado.",
      "",
      params.bodyPreview,
      "",
      `Acompanhe a conversa em: ${env.APP_URL}/suporte`
    ].join("\n")
  });
}

async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!turnstileSecretKey) return true;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: turnstileSecretKey, response: token })
    });
    const data = await response.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
const paymentWebhookSignatureSecret =
  env.PAYMENT_WEBHOOK_SIGNATURE_SECRET &&
  env.PAYMENT_WEBHOOK_SIGNATURE_SECRET.trim().length > 0
    ? env.PAYMENT_WEBHOOK_SIGNATURE_SECRET.trim()
    : null;
const paymentWebhookSecret =
  env.PAYMENT_WEBHOOK_SECRET && env.PAYMENT_WEBHOOK_SECRET.trim().length > 0
    ? env.PAYMENT_WEBHOOK_SECRET.trim()
    : null;
const webhookSignatureToleranceMs = env.PAYMENT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS * 1000;

if (
  env.PAYMENT_PROVIDER_MODE === "mercado_pago" &&
  !paymentWebhookSignatureSecret &&
  !paymentWebhookSecret
) {
  console.warn(
    "[voxora/api] Mercado Pago webhook auth is not configured. Set PAYMENT_WEBHOOK_SIGNATURE_SECRET or PAYMENT_WEBHOOK_SECRET before enabling automatic payment crediting."
  );
}
const mercadoPagoAccessToken =
  env.MERCADO_PAGO_ACCESS_TOKEN && env.MERCADO_PAGO_ACCESS_TOKEN.trim().length > 0
    ? env.MERCADO_PAGO_ACCESS_TOKEN.trim()
    : null;
const mercadoPagoClient =
  env.PAYMENT_PROVIDER_MODE === "mercado_pago" && mercadoPagoAccessToken
    ? createMercadoPagoClient({
        accessToken: mercadoPagoAccessToken,
        apiBaseUrl: env.MERCADO_PAGO_API_BASE_URL,
        timeoutMs: env.MERCADO_PAGO_TIMEOUT_MS
      })
    : null;

function toMoneyDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(6));
}

function toPrismaJsonValue(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return Prisma.JsonNull;
  }
}

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
const uploadsRootDir = isAbsolute(env.UPLOADS_DIR)
  ? env.UPLOADS_DIR
  : resolve(monorepoRootDir, env.UPLOADS_DIR);
const outputsRootDir = isAbsolute(env.OUTPUTS_DIR)
  ? env.OUTPUTS_DIR
  : resolve(monorepoRootDir, env.OUTPUTS_DIR);
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
  taskType: "transcription" | "refresh-original" | "translation";
  sourceObjectKey?: string;
  language?: string;
  sourceRevision?: number;
  transcriptionHints?: string;
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

const SUPPORT_THREAD_STATUSES = [
  "new",
  "open",
  "waiting_user",
  "waiting_support",
  "resolved",
  "closed"
] as const;
const SUPPORT_THREAD_CATEGORIES = [
  "acesso",
  "pagamento",
  "transcricao",
  "entrega",
  "conta"
] as const;
const SUPPORT_THREAD_CHANNELS = ["in_app", "public_form"] as const;
const SUPPORT_MESSAGE_AUTHOR_ROLES = ["customer", "support", "admin", "system"] as const;
const SUPPORT_MESSAGE_DELIVERY_CHANNELS = ["in_app", "email"] as const;

const registerBodySchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().optional()
});

const loginBodySchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(8).max(128)
});

const passwordResetRequestBodySchema = z.object({
  email: z.string().trim().email().max(180)
});

const passwordResetConfirmBodySchema = z.object({
  token: z.string().trim().min(20).max(191),
  newPassword: z.string().min(8).max(128)
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

const supportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(SUPPORT_THREAD_STATUSES).optional()
});

const supportThreadParamsSchema = z.object({
  id: z.string().min(1)
});

const createSupportThreadBodySchema = z.object({
  category: z.enum(SUPPORT_THREAD_CATEGORIES),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(10).max(10000)
});

const createPublicSupportRequestBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  category: z.enum(SUPPORT_THREAD_CATEGORIES),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(10).max(10000)
});

const createSupportMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(10000)
});

const createAdminSupportMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(10000),
  deliveryChannel: z.enum(SUPPORT_MESSAGE_DELIVERY_CHANNELS).default("in_app"),
  isPublic: z.boolean().default(true)
});

const createSupportNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(10000)
});

const updateSupportThreadBodySchema = z
  .object({
    status: z.enum(SUPPORT_THREAD_STATUSES).optional(),
    assigneeUserId: z.string().trim().min(1).nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided."
  });

const linkSupportThreadUserBodySchema = z.object({
  userId: z.string().trim().min(1)
});

const adminTicketListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(SUPPORT_THREAD_STATUSES).optional(),
  channel: z.enum(SUPPORT_THREAD_CHANNELS).optional(),
  category: z.enum(SUPPORT_THREAD_CATEGORIES).optional(),
  q: z.string().trim().min(1).max(180).optional(),
  assignee: z.enum(["me", "unassigned"]).optional()
});

const adminUserListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(180).optional()
});

const adminUserParamsSchema = z.object({
  id: z.string().min(1)
});

const walletLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(LEDGER_TYPES).optional()
});

const paymentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(PAYMENT_STATUSES).optional()
});

const createPixPaymentBodySchema = z.object({
  amount: z.coerce
    .number()
    .refine(
      (value) => value >= env.PIX_MIN_AMOUNT && value <= env.PIX_MAX_AMOUNT,
      `PIX amount must be between ${env.PIX_MIN_AMOUNT} and ${env.PIX_MAX_AMOUNT}.`
    )
});

const createCardPaymentBodySchema = z.object({
  amount: z.coerce
    .number()
    .refine(
      (value) => value >= env.CARD_MIN_AMOUNT && value <= env.PIX_MAX_AMOUNT,
      `Card amount must be between ${env.CARD_MIN_AMOUNT} and ${env.PIX_MAX_AMOUNT}.`
    ),
  token: z.string().min(10).max(400),
  issuerId: z.string().trim().min(1).max(100).optional(),
  paymentMethodId: z.string().trim().min(1).max(100),
  paymentMethodOptionId: z.string().trim().min(1).max(120).optional(),
  processingMode: z.string().trim().min(1).max(120).optional(),
  installments: z.coerce.number().int().min(1).max(36),
  payer: z.object({
    email: z.string().trim().email().max(180),
    identification: z
      .object({
        type: z.string().trim().min(1).max(40),
        number: z.string().trim().min(3).max(40)
      })
      .optional()
  }),
  cardholderName: z.string().trim().min(2).max(160).optional(),
  paymentTypeId: z.string().trim().min(1).max(80).optional(),
  lastFourDigits: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional()
});

const paymentWebhookDirectBodySchema = z.object({
  providerPaymentId: z.string().min(4).max(200),
  status: z.enum(PAYMENT_STATUSES),
  idempotencyKey: z.string().min(6).max(200).optional(),
  rawPayload: z.unknown().optional()
});

const paymentWebhookMercadoPagoEventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]).optional()
      })
      .optional()
  })
  .passthrough();

const uploadPresignBodySchema = z.object({
  fileName: z.string().min(3).max(255),
  contentType: z.string().min(3).max(120).optional(),
  sizeBytes: z.coerce.number().int().min(1).max(524288000).optional()
});

const createTranscriptionBodySchema = z.object({
  sourceObjectKey: z.string().min(10).max(500),
  language: z.string().min(2).max(16).default("pt-BR"),
  transcriptionHints: z.string().trim().max(500).optional(),
  features: z
    .object({
      diarization: z.boolean().default(true),
      translationTargetLanguage: z.string().min(2).max(16).optional(),
      generatePdf: z.boolean().default(true)
    })
    .default({
      diarization: true,
      generatePdf: true
    })
});

const transcriptionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(JOB_STATUSES).optional()
});

const transcriptionParamsSchema = z.object({
  id: z.string().min(1)
});

const paymentParamsSchema = z.object({
  id: z.string().min(1)
});

const uploadTokenParamsSchema = z.object({
  uploadToken: z.string().min(20)
});

const transcriptionDownloadQuerySchema = z.object({
  format: z.enum(OUTPUT_FORMATS),
  variant: z.enum(TRANSCRIPT_VARIANTS).default("original")
});

const updateOriginalTranscriptBodySchema = z
  .object({
    segments: z
      .array(
        z.object({
          segmentIndex: z.coerce.number().int().min(0),
          startSec: z.string().nullable(),
          endSec: z.string().nullable(),
          text: z.string().min(1),
          speakerLabel: z.string().max(120).nullable().optional(),
          language: z.string().min(2).max(16).optional()
        })
      )
      .min(1)
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    for (let index = 0; index < value.segments.length; index += 1) {
      const segment = value.segments[index];
      if (segment.text.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "text"],
          message: "Segment text cannot be empty."
        });
      }
      if (seen.has(segment.segmentIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "segmentIndex"],
          message: "Segment indexes must be unique."
        });
      }
      seen.add(segment.segmentIndex);
      if (segment.startSec !== null && segment.endSec !== null) {
        const start = Number(segment.startSec);
        const end = Number(segment.endSec);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", index, "endSec"],
            message: "Segment timestamps are invalid."
          });
        }
      }
      if (segment.segmentIndex !== index) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "segmentIndex"],
          message: "Segment indexes must be contiguous and sorted."
        });
      }
    }
  });

type JwtTokenType = "access" | "refresh";
type UploadTokenPayload = {
  objectKey: string;
  userId: string;
  contentType: string;
  maxBytes: number;
  expiresAt: number;
};
type UserRole = "customer" | "support" | "admin";
type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};
type PublicSupportMessage = {
  id: string;
  authorRole: (typeof SUPPORT_MESSAGE_AUTHOR_ROLES)[number];
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  deliveryChannel: (typeof SUPPORT_MESSAGE_DELIVERY_CHANNELS)[number];
  isPublic: boolean;
  createdAt: string;
};
type PublicSupportNote = {
  id: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
type PublicSupportThread = {
  id: string;
  channel: (typeof SUPPORT_THREAD_CHANNELS)[number];
  status: (typeof SUPPORT_THREAD_STATUSES)[number];
  priority: "normal";
  category: (typeof SUPPORT_THREAD_CATEGORIES)[number];
  subject: string;
  requester: {
    userId: string | null;
    name: string | null;
    email: string;
  };
  assignee: {
    userId: string | null;
    name: string | null;
    email: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  lastPublicMessageAt: string | null;
  hasUnreadForCustomer: boolean;
  hasUnreadForStaff: boolean;
};
type PublicSupportThreadDetail = PublicSupportThread & {
  messages: PublicSupportMessage[];
};
type AdminSupportThreadDetail = PublicSupportThreadDetail & {
  notes: PublicSupportNote[];
  operationalContext: {
    wallet: {
      userId: string;
      availableBalance: string;
      heldBalance: string;
      updatedAt: string;
    } | null;
    ledger: Array<{
      id: string;
      type: (typeof LEDGER_TYPES)[number];
      amount: string;
      jobId: string | null;
      paymentId: string | null;
      createdAt: string;
    }>;
    payments: PublicPayment[];
    jobs: PublicTranscriptionJob[];
  };
};
type PublicSupportSummary = {
  openTickets: number;
  unreadReplies: number;
};
type PublicTranscriptionOutput = {
  format: "txt" | "srt" | "pdf";
  variant: "original" | "translated";
  language: string | null;
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
type PublicTranscriptSegment = {
  id: string;
  revision: number;
  segmentIndex: number;
  startSec: string | null;
  endSec: string | null;
  text: string;
  speakerLabel: string | null;
  speakerConfidence: string | null;
  language: string;
  kind: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
};
type PublicTranscript = {
  id: string;
  variant: "original" | "translated";
  kind: "transcript" | "translation";
  language: string;
  status: "pending" | "processing" | "ready" | "failed" | "regenerating";
  revision: number;
  sourceRevision: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  updatedAt: string;
  segments: PublicTranscriptSegment[];
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
  translationTargetLanguage: string | null;
  diarizationEnabled: boolean;
  generatePdf: boolean;
  originalTranscriptStatus: "pending" | "processing" | "ready" | "failed" | "regenerating";
  translatedTranscriptStatus: "pending" | "processing" | "ready" | "failed" | "regenerating" | null;
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
  transcripts?: {
    original: PublicTranscript | null;
    translated: PublicTranscript | null;
  };
};
type PublicPayment = {
  id: string;
  provider: "mercado_pago";
  providerMode: "mock" | "mercado_pago" | null;
  providerPaymentId: string;
  method: "pix" | "credit_card";
  amount: string;
  status: "pending" | "approved" | "rejected" | "expired";
  statusDetail: string | null;
  expiresAt: string | null;
  pix: {
    copyPasteCode: string | null;
    qrCodeBase64: string | null;
    ticketUrl: string | null;
  } | null;
  card: {
    lastFourDigits: string | null;
    paymentMethodId: string | null;
    paymentTypeId: string | null;
    cardholderName: string | null;
    installments: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};
type AdminSupportSummary = {
  openTickets: number;
  waitingSupport: number;
  unreadForStaff: number;
  failedJobsLast24Hours: number;
  attentionPaymentsLast24Hours: number;
};

type UserAuthShape = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

const app = Fastify({
  bodyLimit: env.MAX_UPLOAD_BYTES,
  routerOptions: {
    maxParamLength: 4096
  },
  requestTimeout: env.REQUEST_TIMEOUT_MS,
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug"
  }
});

app.addHook("onRequest", async (request, reply) => {
  reply.header("x-request-id", request.id);
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

function hashOpaqueToken(token: string) {
  return createHmac("sha256", passwordResetTokenPepper).update(token, "utf8").digest("hex");
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

function parseOptionalDecimal(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid decimal value '${value}'.`);
  }

  return new Prisma.Decimal(parsed.toFixed(3));
}

function serializeOutput(output: {
  format: "txt" | "srt" | "pdf";
  variant: "original" | "translated";
  language: string | null;
  objectKey: string;
  sizeBytes: number;
  createdAt: Date;
}): PublicTranscriptionOutput {
  return {
    format: output.format,
    variant: output.variant,
    language: output.language,
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

function serializeTranscriptSegment(segment: {
  id: string;
  revision: number;
  segmentIndex: number;
  startSec: Prisma.Decimal | null;
  endSec: Prisma.Decimal | null;
  text: string;
  speakerLabel: string | null;
  speakerConfidence: Prisma.Decimal | null;
  language: string;
  kind: string;
  status: "active";
  createdAt: Date;
  updatedAt: Date;
}): PublicTranscriptSegment {
  return {
    id: segment.id,
    revision: segment.revision,
    segmentIndex: segment.segmentIndex,
    startSec: segment.startSec ? segment.startSec.toString() : null,
    endSec: segment.endSec ? segment.endSec.toString() : null,
    text: segment.text,
    speakerLabel: segment.speakerLabel,
    speakerConfidence: segment.speakerConfidence ? segment.speakerConfidence.toString() : null,
    language: segment.language,
    kind: segment.kind,
    status: segment.status,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString()
  };
}

function serializeTranscript(
  transcript: Prisma.TranscriptionTranscriptGetPayload<{ include: { segments: true } }> | null
): PublicTranscript | null {
  if (!transcript) {
    return null;
  }

  return {
    id: transcript.id,
    variant: transcript.variant,
    kind: transcript.kind,
    language: transcript.language,
    status: transcript.status,
    revision: transcript.revision,
    sourceRevision: transcript.sourceRevision,
    errorCode: transcript.errorCode,
    errorMessage: transcript.errorMessage,
    publishedAt: transcript.publishedAt ? transcript.publishedAt.toISOString() : null,
    updatedAt: transcript.updatedAt.toISOString(),
    segments: transcript.segments
      .filter((segment) => segment.revision === transcript.revision)
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
      .map((segment) => serializeTranscriptSegment(segment))
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
    translationTargetLanguage: job.translationTargetLanguage,
    diarizationEnabled: job.diarizationEnabled,
    generatePdf: job.generatePdf,
    originalTranscriptStatus: job.originalTranscriptStatus,
    translatedTranscriptStatus: job.translatedTranscriptStatus,
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
  job: Prisma.TranscriptionJobGetPayload<{
    include: { outputs: true; chunks: true; transcripts: { include: { segments: true } } };
  }>
): PublicTranscriptionJob {
  const originalTranscript = job.transcripts.find((transcript) => transcript.variant === "original") ?? null;
  const translatedTranscript = job.transcripts.find((transcript) => transcript.variant === "translated") ?? null;

  return {
    ...serializeTranscriptionJob(job),
    chunks: job.chunks
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => serializeChunk(chunk)),
    transcripts: {
      original: serializeTranscript(originalTranscript),
      translated: serializeTranscript(translatedTranscript)
    }
  };
}

function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function hasUnreadSince(lastMessageAt: Date | null, lastViewedAt: Date | null) {
  if (!lastMessageAt) {
    return false;
  }

  if (!lastViewedAt) {
    return true;
  }

  return lastMessageAt.getTime() > lastViewedAt.getTime();
}

function getSupportThreadLastPublicMessageAt(messages: Array<{ createdAt: Date; isPublic: boolean }>) {
  const lastPublic = messages
    .filter((message) => message.isPublic)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

  return lastPublic ? lastPublic.createdAt.toISOString() : null;
}

function serializeSupportMessage(message: {
  id: string;
  authorRole: (typeof SUPPORT_MESSAGE_AUTHOR_ROLES)[number];
  authorUserId: string | null;
  body: string;
  deliveryChannel: (typeof SUPPORT_MESSAGE_DELIVERY_CHANNELS)[number];
  isPublic: boolean;
  createdAt: Date;
  author?: {
    name: string;
  } | null;
}): PublicSupportMessage {
  return {
    id: message.id,
    authorRole: message.authorRole,
    authorUserId: message.authorUserId,
    authorName: message.author?.name ?? null,
    body: message.body,
    deliveryChannel: message.deliveryChannel,
    isPublic: message.isPublic,
    createdAt: message.createdAt.toISOString()
  };
}

function serializeSupportNote(note: {
  id: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    name: string;
  };
}): PublicSupportNote {
  return {
    id: note.id,
    authorUserId: note.authorUserId,
    authorName: note.author.name,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  };
}

function serializeSupportThread(thread: {
  id: string;
  channel: (typeof SUPPORT_THREAD_CHANNELS)[number];
  status: (typeof SUPPORT_THREAD_STATUSES)[number];
  priority: "normal";
  category: (typeof SUPPORT_THREAD_CATEGORIES)[number];
  subject: string;
  requesterUserId: string | null;
  requesterName: string | null;
  requesterEmail: string;
  assigneeUserId: string | null;
  customerLastViewedAt: Date | null;
  staffLastViewedAt: Date | null;
  lastCustomerMessageAt: Date | null;
  lastStaffMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  requester?: {
    name: string;
  } | null;
  assignee?: {
    name: string;
    email: string;
  } | null;
  messages?: Array<{
    createdAt: Date;
    isPublic: boolean;
  }>;
}): PublicSupportThread {
  return {
    id: thread.id,
    channel: thread.channel,
    status: thread.status,
    priority: thread.priority,
    category: thread.category,
    subject: thread.subject,
    requester: {
      userId: thread.requesterUserId,
      name: thread.requester?.name ?? thread.requesterName ?? null,
      email: thread.requesterEmail
    },
    assignee: thread.assigneeUserId
      ? {
          userId: thread.assigneeUserId,
          name: thread.assignee?.name ?? null,
          email: thread.assignee?.email ?? null
        }
      : null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    resolvedAt: thread.resolvedAt ? thread.resolvedAt.toISOString() : null,
    closedAt: thread.closedAt ? thread.closedAt.toISOString() : null,
    lastPublicMessageAt: thread.messages ? getSupportThreadLastPublicMessageAt(thread.messages) : null,
    hasUnreadForCustomer: hasUnreadSince(thread.lastStaffMessageAt, thread.customerLastViewedAt),
    hasUnreadForStaff: hasUnreadSince(thread.lastCustomerMessageAt, thread.staffLastViewedAt)
  };
}

async function bootstrapStaffRoles() {
  if (adminEmailSet.size === 0 && supportEmailSet.size === 0) {
    return;
  }

  const [adminResult, supportResult] = await Promise.all([
    adminEmailSet.size > 0
      ? prisma.user.updateMany({
          where: {
            email: {
              in: [...adminEmailSet]
            }
          },
          data: {
            role: "admin"
          }
        })
      : Promise.resolve({ count: 0 }),
    supportEmailSet.size > 0
      ? prisma.user.updateMany({
          where: {
            email: {
              in: [...supportEmailSet].filter((email) => !adminEmailSet.has(email))
            }
          },
          data: {
            role: "support"
          }
        })
      : Promise.resolve({ count: 0 })
  ]);

  if (adminResult.count > 0 || supportResult.count > 0) {
    app.log.info(
      {
        adminUsersBootstrapped: adminResult.count,
        supportUsersBootstrapped: supportResult.count
      },
      "Support/admin roles synchronized from environment."
    );
  }
}

function getRoleDisplayName(role: UserRole) {
  switch (role) {
    case "admin":
      return "Admin";
    case "support":
      return "Suporte";
    default:
      return "Cliente";
  }
}

function getSupportCategoryDisplayName(category: (typeof SUPPORT_THREAD_CATEGORIES)[number]) {
  switch (category) {
    case "acesso":
      return "Acesso";
    case "pagamento":
      return "Pagamento";
    case "transcricao":
      return "Transcricao";
    case "entrega":
      return "Entrega";
    case "conta":
      return "Conta";
    default:
      return category;
  }
}

function isOpenSupportThread(status: (typeof SUPPORT_THREAD_STATUSES)[number]) {
  return !["resolved", "closed"].includes(status);
}

function getMercadoPagoPixErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (
    message.includes("Collector user without key enabled for QR render") ||
    message.includes("\"code\":13253")
  ) {
    return "O PIX ainda nao esta habilitado na conta de producao do Mercado Pago. Cadastre uma chave Pix na conta usada pela integracao e tente novamente.";
  }

  return "Nao foi possivel gerar o PIX no Mercado Pago agora.";
}

function getBootstrapRole(email: string): UserRole {
  const normalized = email.trim().toLowerCase();
  if (adminEmailSet.has(normalized)) {
    return "admin";
  }
  if (supportEmailSet.has(normalized)) {
    return "support";
  }
  return "customer";
}

function resolveThreadTimestamps(status: (typeof SUPPORT_THREAD_STATUSES)[number]) {
  return {
    resolvedAt: status === "resolved" ? new Date() : null,
    closedAt: status === "closed" ? new Date() : null
  };
}

async function markSupportThreadViewedByRequester(threadId: string, requesterUserId: string) {
  await prisma.supportThread.updateMany({
    where: {
      id: threadId,
      requesterUserId
    },
    data: {
      customerLastViewedAt: new Date()
    }
  });
}

async function markSupportThreadViewedByStaff(threadId: string) {
  await prisma.supportThread.updateMany({
    where: {
      id: threadId
    },
    data: {
      staffLastViewedAt: new Date()
    }
  });
}

async function loadSupportThreadForRequester(threadId: string, requesterUserId: string) {
  const thread = await prisma.supportThread.findFirst({
    where: {
      id: threadId,
      requesterUserId
    },
    include: {
      requester: {
        select: {
          name: true
        }
      },
      assignee: {
        select: {
          name: true,
          email: true
        }
      },
      messages: {
        where: {
          isPublic: true
        },
        orderBy: {
          createdAt: "asc"
        },
        include: {
          author: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  if (!thread) {
    return null;
  }

  return {
    ...serializeSupportThread(thread),
    messages: thread.messages.map((message) => serializeSupportMessage(message))
  } satisfies PublicSupportThreadDetail;
}

async function loadAdminSupportThread(threadId: string) {
  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
    include: {
      requester: {
        select: {
          name: true,
          email: true
        }
      },
      assignee: {
        select: {
          name: true,
          email: true
        }
      },
      messages: {
        orderBy: {
          createdAt: "asc"
        },
        include: {
          author: {
            select: {
              name: true
            }
          }
        }
      },
      notes: {
        orderBy: {
          createdAt: "asc"
        },
        include: {
          author: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  if (!thread) {
    return null;
  }

  const [wallet, ledger, payments, jobs] = thread.requesterUserId
    ? await Promise.all([
        prisma.wallet.findUnique({
          where: {
            userId: thread.requesterUserId
          }
        }),
        prisma.walletLedger.findMany({
          where: {
            userId: thread.requesterUserId
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 10
        }),
        prisma.payment.findMany({
          where: {
            userId: thread.requesterUserId
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 10
        }),
        prisma.transcriptionJob.findMany({
          where: {
            userId: thread.requesterUserId
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 10,
          include: {
            outputs: true
          }
        })
      ])
    : [null, [], [], []];

  return {
    ...serializeSupportThread(thread),
    messages: thread.messages.map((message) => serializeSupportMessage(message)),
    notes: thread.notes.map((note) => serializeSupportNote(note)),
    operationalContext: {
      wallet: wallet
        ? {
            userId: wallet.userId,
            availableBalance: wallet.availableBalance.toString(),
            heldBalance: wallet.heldBalance.toString(),
            updatedAt: wallet.updatedAt.toISOString()
          }
        : null,
      ledger: ledger.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount.toString(),
        jobId: entry.jobId,
        paymentId: entry.paymentId,
        createdAt: entry.createdAt.toISOString()
      })),
      payments: payments.map((payment) => serializePayment(payment)),
      jobs: jobs.map((job) => serializeTranscriptionJob(job))
    }
  } satisfies AdminSupportThreadDetail;
}

function serializePayment(payment: {
  id: string;
  provider: "mercado_pago";
  providerPaymentId: string;
  amount: Prisma.Decimal;
  status: "pending" | "approved" | "rejected" | "expired";
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicPayment {
  const metadata = getPaymentMetadata(payment.rawPayload);
  return {
    id: payment.id,
    provider: payment.provider,
    providerMode: getStringValue(getJsonObject(payment.rawPayload)?.providerMode) as
      | "mock"
      | "mercado_pago"
      | null,
    providerPaymentId: payment.providerPaymentId,
    method: metadata.method,
    amount: payment.amount.toString(),
    status: payment.status,
    statusDetail: metadata.statusDetail,
    expiresAt: metadata.expiresAt,
    pix: metadata.method === "pix" ? metadata.pix : null,
    card: metadata.method === "credit_card" ? metadata.card : null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString()
  };
}

function getJsonObject(
  value: Prisma.JsonValue | Prisma.NullableJsonNullValueInput | null | undefined
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPaymentMetadata(
  rawPayload: Prisma.JsonValue | Prisma.NullableJsonNullValueInput | null | undefined
) {
  const raw = getJsonObject(rawPayload);
  const providerPayload = getJsonObject(raw?.providerPayload as Prisma.JsonValue | undefined);
  const methodCandidate =
    getStringValue(raw?.method) ?? getStringValue(raw?.paymentMethod) ?? null;
  const method =
    methodCandidate === "credit_card" || methodCandidate === "pix"
      ? methodCandidate
      : raw?.copyPasteCode
        ? "pix"
        : "credit_card";
  const expiresAt =
    getStringValue(raw?.expiresAt) ??
    getStringValue(providerPayload?.date_of_expiration) ??
    null;
  const statusDetail =
    getStringValue(raw?.statusDetail) ??
    getStringValue(providerPayload?.status_detail) ??
    null;

  return {
    method,
    expiresAt,
    statusDetail,
    pix:
      method === "pix"
        ? {
            copyPasteCode: getStringValue(raw?.copyPasteCode),
            qrCodeBase64: getStringValue(raw?.qrCodeBase64),
            ticketUrl: getStringValue(raw?.ticketUrl)
          }
        : null,
    card:
      method === "credit_card"
        ? {
            lastFourDigits:
              getStringValue(raw?.lastFourDigits) ??
              getStringValue(getJsonObject(providerPayload?.card as Prisma.JsonValue)?.last_four_digits),
            paymentMethodId:
              getStringValue(raw?.paymentMethodId) ??
              getStringValue(providerPayload?.payment_method_id),
            paymentTypeId:
              getStringValue(raw?.paymentTypeId) ??
              getStringValue(providerPayload?.payment_type_id),
            cardholderName: getStringValue(raw?.cardholderName),
            installments:
              getNumberValue(raw?.installments) ?? getNumberValue(providerPayload?.installments)
          }
        : null
  } as const;
}

function isPaymentExpired(
  payment: Pick<Prisma.PaymentGetPayload<object>, "status" | "rawPayload">
) {
  if (payment.status !== "pending") {
    return false;
  }

  const metadata = getPaymentMetadata(payment.rawPayload);
  if (metadata.method !== "pix" || !metadata.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(metadata.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= Date.now();
}

async function expirePaymentIfNeeded(
  payment: Prisma.PaymentGetPayload<object>
): Promise<Prisma.PaymentGetPayload<object>> {
  if (!isPaymentExpired(payment)) {
    return payment;
  }

  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: "expired" }
  });
}

function getHeaderValue(headers: FastifyRequest["headers"], key: string) {
  const value = headers[key];
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function verifyWebhookSecret(request: FastifyRequest) {
  if (!paymentWebhookSecret) {
    return true;
  }

  const provided = getHeaderValue(request.headers, "x-payment-webhook-secret");
  if (!provided) {
    return false;
  }
  return safeCompare(provided, paymentWebhookSecret);
}

function parseMercadoPagoSignatureHeader(rawSignature: string) {
  const parts = rawSignature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const parsed: Record<string, string> = {};
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    parsed[key.trim().toLowerCase()] = rest.join("=").trim();
  }

  return {
    ts: parsed.ts ?? null,
    v1: parsed.v1 ?? null
  };
}

function normalizeManifestId(providerPaymentId: string) {
  return providerPaymentId.trim().toLowerCase();
}

function buildMercadoPagoWebhookManifest(params: {
  providerPaymentId: string;
  requestId: string;
  timestampSeconds: string;
}) {
  return `id:${normalizeManifestId(params.providerPaymentId)};request-id:${params.requestId};ts:${params.timestampSeconds};`;
}

function verifyMercadoPagoWebhookSignature(params: {
  request: FastifyRequest;
  providerPaymentId: string;
}) {
  if (!paymentWebhookSignatureSecret) {
    return {
      ok: true
    } as const;
  }

  const signatureRaw = getHeaderValue(params.request.headers, "x-signature");
  const requestId = getHeaderValue(params.request.headers, "x-request-id");
  if (!signatureRaw || !requestId) {
    return {
      ok: false,
      message: "Missing Mercado Pago signature headers."
    } as const;
  }

  const signature = parseMercadoPagoSignatureHeader(signatureRaw);
  if (!signature.ts || !signature.v1) {
    return {
      ok: false,
      message: "Invalid Mercado Pago signature format."
    } as const;
  }

  const signatureTimestamp = Number.parseInt(signature.ts, 10);
  if (!Number.isFinite(signatureTimestamp)) {
    return {
      ok: false,
      message: "Invalid Mercado Pago signature timestamp."
    } as const;
  }

  if (webhookSignatureToleranceMs > 0) {
    const deltaMs = Math.abs(Date.now() - signatureTimestamp * 1000);
    if (deltaMs > webhookSignatureToleranceMs) {
      return {
        ok: false,
        message: "Mercado Pago signature expired."
      } as const;
    }
  }

  const manifest = buildMercadoPagoWebhookManifest({
    providerPaymentId: params.providerPaymentId,
    requestId,
    timestampSeconds: signature.ts
  });
  const expected = createHmac("sha256", paymentWebhookSignatureSecret)
    .update(manifest)
    .digest("hex");
  const provided = signature.v1.toLowerCase();
  if (!safeCompare(provided, expected.toLowerCase())) {
    return {
      ok: false,
      message: "Mercado Pago signature mismatch."
    } as const;
  }

  return {
    ok: true
  } as const;
}

function verifyPaymentWebhookAuth(params: {
  request: FastifyRequest;
  providerPaymentId: string;
}) {
  if (!paymentWebhookSignatureSecret && !paymentWebhookSecret) {
    return {
      ok: false,
      message: "Webhook authentication is not configured."
    } as const;
  }

  const signatureValidation = verifyMercadoPagoWebhookSignature(params);
  if (!signatureValidation.ok) {
    return signatureValidation;
  }

  if (!paymentWebhookSignatureSecret && !verifyWebhookSecret(params.request)) {
    return {
      ok: false,
      message: "Invalid webhook secret."
    } as const;
  }

  return {
    ok: true
  } as const;
}

function buildTranscriptionQueueOptions(
  jobId: string,
  taskType: TranscriptionQueueData["taskType"],
  sourceRevision?: number
) {
  return {
    jobId:
      taskType === "transcription"
        ? jobId
        : `${jobId}.${taskType}.${sourceRevision ?? Date.now()}`,
    attempts: taskType === "translation" ? 1 : env.TRANSCRIPTION_MAX_ATTEMPTS,
    backoff: {
      type: "exponential" as const,
      delay: env.TRANSCRIPTION_RETRY_DELAY_MS
    },
    removeOnComplete: 100,
    removeOnFail: 200
  };
}

function getRequestContext(
  request: FastifyRequest,
  extra: Record<string, unknown> = {}
) {
  const maybeUser = request as FastifyRequest & { user?: { sub?: string } };
  const userId = maybeUser.user?.sub ?? null;
  return {
    request_id: request.id,
    user_id: userId,
    ...extra
  };
}

function mapMercadoPagoStatusToPaymentStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case "approved":
      return "approved" as const;
    case "rejected":
    case "cancelled":
    case "cancelled_by_payer":
    case "charged_back":
      return "rejected" as const;
    case "expired":
      return "expired" as const;
    case "pending":
    case "in_process":
    case "in_mediation":
    case "authorized":
    default:
      return "pending" as const;
  }
}

function resolveWebhookProviderPaymentId(
  request: FastifyRequest,
  body: unknown
): string | null {
  const direct = paymentWebhookDirectBodySchema.safeParse(body);
  if (direct.success) {
    return direct.data.providerPaymentId.trim();
  }

  const event = paymentWebhookMercadoPagoEventSchema.safeParse(body);
  if (event.success) {
    const query = request.query as Record<string, unknown> | undefined;
    const candidate =
      event.data.data?.id ?? event.data.id ?? query?.["data.id"] ?? query?.id;
    if (typeof candidate === "number" || typeof candidate === "string") {
      return String(candidate);
    }
  }

  return null;
}

async function resolveWebhookPaymentStatus(params: {
  request: FastifyRequest;
  body: unknown;
  providerPaymentId: string;
}) {
  const direct = paymentWebhookDirectBodySchema.safeParse(params.body);
  if (direct.success) {
    return {
      status: direct.data.status,
      statusDetail: null,
      rawPayload: direct.data.rawPayload ?? params.body
    };
  }

  if (env.PAYMENT_PROVIDER_MODE === "mercado_pago" && mercadoPagoClient) {
    const providerStatus = await mercadoPagoClient.getPaymentStatus(
      params.providerPaymentId
    );
    return {
      status: mapMercadoPagoStatusToPaymentStatus(providerStatus.status),
      statusDetail: providerStatus.statusDetail,
      rawPayload: providerStatus.raw
    };
  }

  return null;
}

function mergePaymentRawPayload(
  currentRawPayload: Prisma.JsonValue | Prisma.NullableJsonNullValueInput | null | undefined,
  updates: {
    providerPayload?: unknown;
    statusDetail?: string | null;
    status?: string | null;
    approvedAt?: string | null;
  }
) {
  const current = getJsonObject(currentRawPayload) ?? {};
  return toPrismaJsonValue({
    ...current,
    providerPayload:
      updates.providerPayload !== undefined
        ? updates.providerPayload
        : current.providerPayload ?? null,
    statusDetail:
      updates.statusDetail !== undefined ? updates.statusDetail : current.statusDetail ?? null,
    status: updates.status !== undefined ? updates.status : current.status ?? null,
    approvedAt:
      updates.approvedAt !== undefined ? updates.approvedAt : current.approvedAt ?? null
  });
}

function getCancelledByUserStatusDetail() {
  return "Pagamento cancelado pelo usuário.";
}

async function approvePaymentAndCreditWallet(params: {
  paymentId: string;
  rawPayload?: {
    providerPayload?: unknown;
    statusDetail?: string | null;
    approvedAt?: string | null;
  };
  idempotencyKey?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: params.paymentId }
    });
    if (!payment) {
      return null;
    }

    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "approved",
        rawPayload: mergePaymentRawPayload(payment.rawPayload, {
          providerPayload: params.rawPayload?.providerPayload,
          statusDetail: params.rawPayload?.statusDetail,
          status: "approved",
          approvedAt: params.rawPayload?.approvedAt ?? new Date().toISOString()
        })
      }
    });

    const creditIdempotencyKey =
      params.idempotencyKey && params.idempotencyKey.trim().length > 0
        ? params.idempotencyKey.trim()
        : `payment:${payment.id}:credit`;

    const existingCredit = await tx.walletLedger.findUnique({
      where: {
        idempotencyKey: creditIdempotencyKey
      }
    });
    if (existingCredit) {
      return {
        payment: updatedPayment,
        credited: false
      };
    }

    await tx.wallet.update({
      where: {
        userId: payment.userId
      },
      data: {
        availableBalance: {
          increment: payment.amount
        }
      }
    });

    await tx.walletLedger.create({
      data: {
        userId: payment.userId,
        type: "credit",
        amount: payment.amount,
        paymentId: payment.id,
        idempotencyKey: creditIdempotencyKey
      }
    });

    return {
      payment: updatedPayment,
      credited: true
    };
  });
}

function issueTokens(user: { id: string; email: string; role: UserRole; sessionVersion: number }) {
  return {
    accessToken: app.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion,
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
        role: user.role,
        sessionVersion: user.sessionVersion,
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

    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { sessionVersion: true, role: true }
    });
    if (!user || user.sessionVersion !== request.user.sessionVersion) {
      return reply.code(401).send({
        message: "Sessão expirada. Faça login novamente."
      });
    }
    request.user.role = user.role;
    return;
  } catch {
    return reply.code(401).send({
      message: "Unauthorized."
    });
  }
}

function requireRole(roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({
        message: "Forbidden."
      });
    }

    return;
  };
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
  const corsOrigin = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : env.NODE_ENV === "production"
      ? false
      : true;

  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false
  });

  await app.register(cors, {
    origin: corsOrigin,
    credentials: true
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      const userId = (request as any).user?.id;
      return userId ?? request.ip;
    }
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "api",
    now: new Date().toISOString()
  }));

  app.post("/v1/auth/register", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 hour",
        keyGenerator: (request) => request.ip
      }
    }
  }, async (request, reply) => {
    const body = registerBodySchema.parse(request.body);
    const email = body.email.trim().toLowerCase();

    // Block disposable email providers
    const emailDomain = email.split("@")[1] ?? "";
    if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
      return reply.code(422).send({
        message: "Este provedor de e-mail não é permitido. Use um e-mail pessoal ou corporativo."
      });
    }

    // Verify Turnstile CAPTCHA token when secret key is configured
    if (turnstileSecretKey) {
      const token = body.turnstileToken ?? "";
      if (!token) {
        return reply.code(422).send({ message: "Verificação de segurança obrigatória." });
      }
      const valid = await verifyTurnstileToken(token);
      if (!valid) {
        return reply.code(422).send({ message: "Verificação de segurança inválida. Tente novamente." });
      }
    }

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
            role: getBootstrapRole(email),
            passwordHash
          }
        });

        await tx.wallet.create({
          data: {
            userId: createdUser.id,
            availableBalance: signupWelcomeCredit
          }
        });

        if (signupWelcomeCredit.gt(0)) {
          await tx.walletLedger.create({
            data: {
              userId: createdUser.id,
              type: "credit",
              amount: signupWelcomeCredit,
              idempotencyKey: `signup:${createdUser.id}:welcome-credit`
            }
          });
        }

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

    // Generate email verification token
    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(
      Date.now() + env.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
    );
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt
      }
    });

    // Send verification email (non-blocking — don't fail registration if email fails)
    void sendVerificationEmail(user.email, user.name, verificationToken).catch((err) => {
      app.log.error({ err }, "Failed to send verification email");
    });

    const tokens = issueTokens(user);
    return reply.code(201).send({
      user: serializeUser(user),
      welcomeCredit: signupWelcomeCredit.toString(),
      emailVerificationSent: emailTransporter !== null,
      ...tokens
    });
  });

  // Verify email endpoint
  app.get("/v1/auth/verify-email", async (request, reply) => {
    const { token } = (request.query as Record<string, string>);
    if (!token || typeof token !== "string") {
      return reply.code(400).send({ message: "Token de verificação inválido." });
    }

    const user = await prisma.user.findUnique({
      where: { emailVerificationToken: token },
      select: { id: true, emailVerifiedAt: true, emailVerificationExpiresAt: true }
    });

    if (!user) {
      return reply.code(400).send({ message: "Token de verificação inválido ou já utilizado." });
    }
    if (user.emailVerifiedAt) {
      return reply.send({ message: "E-mail já verificado." });
    }
    if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt < new Date()) {
      return reply.code(400).send({ message: "Token expirado. Solicite um novo e-mail de verificação." });
    }

    // Keep the token in DB so the link remains idempotent (clicking again shows success)
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() }
    });

    return reply.send({ message: "E-mail verificado com sucesso." });
  });

  // Resend verification email
  app.post("/v1/auth/resend-verification", {
    config: { rateLimit: { max: 3, timeWindow: "1 hour", keyGenerator: (req) => req.ip } },
    preHandler: [authenticate]
  }, async (request, reply) => {
    const userId = (request.user as unknown as { id: string }).id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true }
    });

    if (!user) return reply.code(404).send({ message: "Usuário não encontrado." });
    if (user.emailVerifiedAt) return reply.send({ message: "E-mail já verificado." });

    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(
      Date.now() + env.EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000
    );
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerificationToken: verificationToken, emailVerificationExpiresAt: verificationExpiresAt }
    });

    void sendVerificationEmail(user.email, user.name, verificationToken).catch((err) => {
      app.log.error({ err }, "Failed to resend verification email");
    });

    return reply.send({ message: "E-mail de verificação reenviado." });
  });

  app.post("/v1/auth/request-password-reset", {
    config: { rateLimit: { max: 3, timeWindow: "1 hour", keyGenerator: (req) => req.ip } }
  }, async (request, reply) => {
    const body = passwordResetRequestBodySchema.parse(request.body);
    const email = body.email.trim().toLowerCase();
    const genericMessage = "Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.";

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true }
    });

    if (!user) {
      return reply.send({
        message: genericMessage,
        deliveryAvailable: emailTransporter !== null
      });
    }

    const passwordResetToken = randomBytes(32).toString("hex");
    const passwordResetTokenHash = hashOpaqueToken(passwordResetToken);
    const passwordResetExpiresAt = new Date(
      Date.now() + env.PASSWORD_RESET_EXPIRES_HOURS * 60 * 60 * 1000
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: passwordResetTokenHash,
        passwordResetExpiresAt
      }
    });

    void sendPasswordResetEmail(user.email, user.name, passwordResetToken).catch((err) => {
      app.log.error({ err }, "Failed to send password reset email");
    });

    return reply.send({
      message: genericMessage,
      deliveryAvailable: emailTransporter !== null
    });
  });

  app.post("/v1/auth/reset-password", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour", keyGenerator: (req) => req.ip } }
  }, async (request, reply) => {
    const body = passwordResetConfirmBodySchema.parse(request.body);
    const passwordResetTokenHash = hashOpaqueToken(body.token);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { passwordResetToken: passwordResetTokenHash },
          { passwordResetToken: body.token }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        sessionVersion: true,
        passwordResetExpiresAt: true
      }
    });

    if (!user) {
      return reply.code(400).send({ message: "Link de redefinição inválido ou já utilizado." });
    }

    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: null,
          passwordResetExpiresAt: null
        }
      });

      return reply.code(400).send({ message: "Link expirado. Solicite uma nova recuperação de senha." });
    }

    const passwordHash = await argon2.hash(body.newPassword, {
      type: argon2.argon2id
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        sessionVersion: {
          increment: 1
        },
        passwordResetToken: null,
        passwordResetExpiresAt: null
      }
    });

    void sendPasswordChangedEmail(user.email, user.name).catch((err) => {
      app.log.error({ err }, "Failed to send password changed email after password reset");
    });

    return reply.send({ message: "Senha redefinida com sucesso." });
  });

  app.post("/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
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

    if (!user.emailVerifiedAt) {
      return reply.code(403).send({
        message: "Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada."
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
      role: UserRole;
      sessionVersion: number;
      tokenType: JwtTokenType;
    };
    try {
      payload = app.jwt.verify(body.refreshToken) as {
        sub: string;
        email: string;
        role: UserRole;
        sessionVersion: number;
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
    if (user.sessionVersion !== payload.sessionVersion) {
      return reply.code(401).send({
        message: "Sessão expirada. Faça login novamente."
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
        updateData.sessionVersion = {
          increment: 1
        };
        updateData.passwordResetToken = null;
        updateData.passwordResetExpiresAt = null;
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

        if (body.currentPassword && body.newPassword) {
          void sendPasswordChangedEmail(updatedUser.email, updatedUser.name).catch((err) => {
            app.log.error({ err }, "Failed to send password changed email after profile update");
          });
        }

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
    "/v1/support/tickets",
    {
      preHandler: [authenticate]
    },
    async (request) => {
      const query = supportListQuerySchema.parse(request.query);
      const where: Prisma.SupportThreadWhereInput = {
        requesterUserId: request.user.sub
      };

      if (query.status) {
        where.status = query.status;
      }

      const [threads, total] = await Promise.all([
        prisma.supportThread.findMany({
          where,
          orderBy: {
            updatedAt: "desc"
          },
          take: query.limit,
          skip: query.offset,
          include: {
            requester: {
              select: {
                name: true
              }
            },
            assignee: {
              select: {
                name: true,
                email: true
              }
            },
            messages: {
              select: {
                createdAt: true,
                isPublic: true
              }
            }
          }
        }),
        prisma.supportThread.count({ where })
      ]);

      return {
        items: threads.map((thread) => serializeSupportThread(thread)),
        total,
        hasMore: query.offset + query.limit < total
      };
    }
  );

  app.get(
    "/v1/support/summary",
    {
      preHandler: [authenticate]
    },
    async (request) => {
      const threads = await prisma.supportThread.findMany({
        where: {
          requesterUserId: request.user.sub
        },
        select: {
          status: true,
          lastStaffMessageAt: true,
          customerLastViewedAt: true
        }
      });

      return {
        openTickets: threads.filter((thread) => isOpenSupportThread(thread.status)).length,
        unreadReplies: threads.filter((thread) =>
          hasUnreadSince(thread.lastStaffMessageAt, thread.customerLastViewedAt)
        ).length
      } satisfies PublicSupportSummary;
    }
  );

  app.post(
    "/v1/support/tickets",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const body = createSupportThreadBodySchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: {
          id: request.user.sub
        },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }

      const now = new Date();

      const thread = await prisma.$transaction(async (tx) => {
        const createdThread = await tx.supportThread.create({
          data: {
            channel: "in_app",
            status: "open",
            category: body.category,
            subject: body.subject,
            requesterUserId: user.id,
            requesterName: user.name,
            requesterEmail: user.email,
            customerLastViewedAt: now,
            lastCustomerMessageAt: now
          },
          include: {
            requester: {
              select: {
                name: true
              }
            },
            assignee: {
              select: {
                name: true,
                email: true
              }
            },
            messages: {
              select: {
                createdAt: true,
                isPublic: true
              }
            }
          }
        });

        await tx.supportMessage.create({
          data: {
            threadId: createdThread.id,
            authorRole: "customer",
            authorUserId: user.id,
            body: body.message,
            deliveryChannel: "in_app",
            isPublic: true
          }
        });

        return tx.supportThread.findUniqueOrThrow({
          where: {
            id: createdThread.id
          },
          include: {
            requester: {
              select: {
                name: true
              }
            },
            assignee: {
              select: {
                name: true,
                email: true
              }
            },
            messages: {
              orderBy: {
                createdAt: "asc"
              },
              where: {
                isPublic: true
              },
              include: {
                author: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        });
      });

      await notifyStaffAboutTicket({
        threadId: thread.id,
        subject: thread.subject,
        requesterName: user.name,
        requesterEmail: user.email,
        categoryLabel: getSupportCategoryDisplayName(thread.category),
        preview: body.message,
        excludeUserId: user.id,
        notificationType: "new_ticket"
      });

      return reply.code(201).send({
        thread: {
          ...serializeSupportThread(thread),
          messages: thread.messages.map((message) => serializeSupportMessage(message))
        } satisfies PublicSupportThreadDetail
      });
    }
  );

  app.get(
    "/v1/support/tickets/:id",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      await markSupportThreadViewedByRequester(params.id, request.user.sub);
      const thread = await loadSupportThreadForRequester(params.id, request.user.sub);

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      return {
        thread
      };
    }
  );

  app.post(
    "/v1/support/tickets/:id/messages",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      const body = createSupportMessageBodySchema.parse(request.body);

      const thread = await prisma.supportThread.findFirst({
        where: {
          id: params.id,
          requesterUserId: request.user.sub
        }
      });

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.supportMessage.create({
          data: {
            threadId: thread.id,
            authorRole: "customer",
            authorUserId: request.user.sub,
            body: body.body,
            deliveryChannel: "in_app",
            isPublic: true
          }
        });

        await tx.supportThread.update({
          where: {
            id: thread.id
          },
          data: {
            status: "waiting_support",
            resolvedAt: null,
            closedAt: null,
            lastCustomerMessageAt: now,
            customerLastViewedAt: now
          }
        });
      });

      await notifyStaffAboutTicket({
        threadId: thread.id,
        subject: thread.subject,
        requesterName: thread.requesterName,
        requesterEmail: thread.requesterEmail,
        categoryLabel: getSupportCategoryDisplayName(thread.category),
        preview: body.body,
        excludeUserId: request.user.sub,
        notificationType: "customer_reply"
      });

      const detail = await loadSupportThreadForRequester(thread.id, request.user.sub);
      return {
        thread: detail
      };
    }
  );

  app.post(
    "/v1/support/public-requests",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
          keyGenerator: (request) => request.ip
        }
      }
    },
    async (request, reply) => {
      const body = createPublicSupportRequestBodySchema.parse(request.body);
      const now = new Date();
      const thread = await prisma.supportThread.create({
        data: {
          channel: "public_form",
          status: "new",
          category: body.category,
          subject: body.subject,
          requesterName: body.name,
          requesterEmail: body.email.toLowerCase(),
          lastCustomerMessageAt: now
        }
      });

      await prisma.supportMessage.create({
        data: {
          threadId: thread.id,
          authorRole: "customer",
          body: body.message,
          deliveryChannel: "email",
          isPublic: true
        }
      });

      await notifyStaffAboutTicket({
        threadId: thread.id,
        subject: thread.subject,
        requesterName: body.name,
        requesterEmail: thread.requesterEmail,
        categoryLabel: getSupportCategoryDisplayName(thread.category),
        preview: body.message,
        notificationType: "public_request"
      });

      return reply.code(201).send({
        message: emailTransporter
          ? "Recebemos sua mensagem. Nossa equipe responderá por e-mail."
          : "Recebemos sua mensagem e ela já está disponível para a equipe."
      });
    }
  );

  app.get(
    "/v1/admin/support/summary",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [
        openTickets,
        waitingSupport,
        unreadThreads,
        failedJobsLast24Hours,
        attentionPaymentsLast24Hours
      ] = await Promise.all([
        prisma.supportThread.count({
          where: {
            status: {
              in: ["new", "open", "waiting_user", "waiting_support"]
            }
          }
        }),
        prisma.supportThread.count({
          where: {
            status: {
              in: ["new", "waiting_support"]
            }
          }
        }),
        prisma.supportThread.findMany({
          select: {
            lastCustomerMessageAt: true,
            staffLastViewedAt: true
          }
        }),
        prisma.transcriptionJob.count({
          where: {
            status: "failed",
            updatedAt: {
              gte: since
            }
          }
        }),
        prisma.payment.count({
          where: {
            status: {
              in: ["pending", "rejected"]
            },
            createdAt: {
              gte: since
            }
          }
        })
      ]);

      return {
        openTickets,
        waitingSupport,
        unreadForStaff: unreadThreads.filter((thread) =>
          hasUnreadSince(thread.lastCustomerMessageAt, thread.staffLastViewedAt)
        ).length,
        failedJobsLast24Hours,
        attentionPaymentsLast24Hours
      } satisfies AdminSupportSummary;
    }
  );

  app.get(
    "/v1/admin/tickets",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request) => {
      const query = adminTicketListQuerySchema.parse(request.query);
      const where: Prisma.SupportThreadWhereInput = {};

      if (query.status) {
        where.status = query.status;
      }
      if (query.channel) {
        where.channel = query.channel;
      }
      if (query.category) {
        where.category = query.category;
      }
      if (query.assignee === "me") {
        where.assigneeUserId = request.user.sub;
      } else if (query.assignee === "unassigned") {
        where.assigneeUserId = null;
      }
      if (query.q) {
        where.OR = [
          {
            subject: {
              contains: query.q
            }
          },
          {
            requesterName: {
              contains: query.q
            }
          },
          {
            requesterEmail: {
              contains: query.q
            }
          }
        ];
      }

      const [threads, total] = await Promise.all([
        prisma.supportThread.findMany({
          where,
          orderBy: {
            updatedAt: "desc"
          },
          take: query.limit,
          skip: query.offset,
          include: {
            requester: {
              select: {
                name: true
              }
            },
            assignee: {
              select: {
                name: true,
                email: true
              }
            },
            messages: {
              select: {
                createdAt: true,
                isPublic: true
              }
            }
          }
        }),
        prisma.supportThread.count({ where })
      ]);

      return {
        items: threads.map((thread) => serializeSupportThread(thread)),
        total,
        hasMore: query.offset + query.limit < total
      };
    }
  );

  app.get(
    "/v1/admin/tickets/:id",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      await markSupportThreadViewedByStaff(params.id);
      const thread = await loadAdminSupportThread(params.id);

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      return {
        thread
      };
    }
  );

  app.post(
    "/v1/admin/tickets/:id/messages",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      const body = createAdminSupportMessageBodySchema.parse(request.body);

      const thread = await prisma.supportThread.findUnique({
        where: {
          id: params.id
        }
      });

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      if (body.deliveryChannel === "email" && !emailTransporter) {
        return reply.code(503).send({
          message: "E-mail de suporte indisponível neste ambiente."
        });
      }

      if (body.deliveryChannel === "email") {
        await sendSupportEmail({
          toEmail: thread.requesterEmail,
          toName: thread.requesterName,
          subject: `Re: ${thread.subject}`,
          body: body.body
        });
      }

      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.supportMessage.create({
          data: {
            threadId: thread.id,
            authorRole: request.user.role,
            authorUserId: request.user.sub,
            body: body.body,
            deliveryChannel: body.deliveryChannel,
            isPublic: body.isPublic
          }
        });

        await tx.supportThread.update({
          where: {
            id: thread.id
          },
          data: {
            status: "waiting_user",
            resolvedAt: null,
            closedAt: null,
            staffLastViewedAt: now,
            ...(body.isPublic
              ? {
                  lastStaffMessageAt: now
                }
              : {})
          }
        });
      });

      if (body.isPublic && body.deliveryChannel !== "email") {
        await notifyRequesterAboutTicketReply({
          requesterEmail: thread.requesterEmail,
          requesterName: thread.requesterName,
          subject: thread.subject,
          bodyPreview: body.body
        });
      }

      const detail = await loadAdminSupportThread(thread.id);
      return {
        thread: detail
      };
    }
  );

  app.post(
    "/v1/admin/tickets/:id/notes",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      const body = createSupportNoteBodySchema.parse(request.body);

      const thread = await prisma.supportThread.findUnique({
        where: {
          id: params.id
        }
      });

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.supportInternalNote.create({
          data: {
            threadId: thread.id,
            authorUserId: request.user.sub,
            body: body.body
          }
        });

        await tx.supportThread.update({
          where: {
            id: thread.id
          },
          data: {
            updatedAt: new Date()
          }
        });
      });

      const detail = await loadAdminSupportThread(thread.id);
      return {
        thread: detail
      };
    }
  );

  app.patch(
    "/v1/admin/tickets/:id",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      const body = updateSupportThreadBodySchema.parse(request.body);

      const thread = await prisma.supportThread.findUnique({
        where: {
          id: params.id
        }
      });

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      const data: Prisma.SupportThreadUpdateInput = {};

      if (body.status) {
        data.status = body.status;
        const timestamps = resolveThreadTimestamps(body.status);
        data.resolvedAt = timestamps.resolvedAt;
        data.closedAt = timestamps.closedAt;
      }

      if (body.assigneeUserId !== undefined) {
        if (body.assigneeUserId === null) {
          data.assignee = {
            disconnect: true
          };
        } else {
          const assignee = await prisma.user.findUnique({
            where: {
              id: body.assigneeUserId
            },
            select: {
              id: true,
              role: true
            }
          });

          if (!assignee || !["support", "admin"].includes(assignee.role)) {
            return reply.code(422).send({
              message: "Assigned user must be admin or support."
            });
          }

          data.assignee = {
            connect: {
              id: assignee.id
            }
          };
        }
      }

      await prisma.supportThread.update({
        where: {
          id: thread.id
        },
        data
      });

      const detail = await loadAdminSupportThread(thread.id);
      return {
        thread: detail
      };
    }
  );

  app.patch(
    "/v1/admin/tickets/:id/link-user",
    {
      preHandler: [requireRole(["admin"])]
    },
    async (request, reply) => {
      const params = supportThreadParamsSchema.parse(request.params);
      const body = linkSupportThreadUserBodySchema.parse(request.body);

      const [thread, user] = await Promise.all([
        prisma.supportThread.findUnique({
          where: {
            id: params.id
          }
        }),
        prisma.user.findUnique({
          where: {
            id: body.userId
          },
          select: {
            id: true,
            name: true,
            email: true
          }
        })
      ]);

      if (!thread) {
        return reply.code(404).send({
          message: "Support ticket not found."
        });
      }

      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }

      await prisma.supportThread.update({
        where: {
          id: thread.id
        },
        data: {
          requesterUserId: user.id,
          requesterName: user.name,
          requesterEmail: user.email
        }
      });

      const detail = await loadAdminSupportThread(thread.id);
      return {
        thread: detail
      };
    }
  );

  app.get(
    "/v1/admin/users",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request) => {
      const query = adminUserListQuerySchema.parse(request.query);
      const where: Prisma.UserWhereInput = {};

      if (query.q) {
        where.OR = [
          {
            name: {
              contains: query.q
            }
          },
          {
            email: {
              contains: query.q
            }
          }
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: {
            createdAt: "desc"
          },
          take: query.limit,
          skip: query.offset,
          include: {
            wallet: true
          }
        }),
        prisma.user.count({ where })
      ]);

      return {
        items: users.map((user) => ({
          ...serializeUser(user),
          wallet: user.wallet
            ? {
                availableBalance: user.wallet.availableBalance.toString(),
                heldBalance: user.wallet.heldBalance.toString(),
                updatedAt: user.wallet.updatedAt.toISOString()
              }
            : null
        })),
        total,
        hasMore: query.offset + query.limit < total
      };
    }
  );

  app.get(
    "/v1/admin/users/:id",
    {
      preHandler: [requireRole(["support", "admin"])]
    },
    async (request, reply) => {
      const params = adminUserParamsSchema.parse(request.params);
      const user = await prisma.user.findUnique({
        where: {
          id: params.id
        }
      });

      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }

      const [wallet, ledger, payments, jobs, tickets] = await Promise.all([
        prisma.wallet.findUnique({
          where: {
            userId: user.id
          }
        }),
        prisma.walletLedger.findMany({
          where: {
            userId: user.id
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        }),
        prisma.payment.findMany({
          where: {
            userId: user.id
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        }),
        prisma.transcriptionJob.findMany({
          where: {
            userId: user.id
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 20,
          include: {
            outputs: true
          }
        }),
        prisma.supportThread.findMany({
          where: {
            requesterUserId: user.id
          },
          orderBy: {
            updatedAt: "desc"
          },
          include: {
            requester: {
              select: {
                name: true
              }
            },
            assignee: {
              select: {
                name: true,
                email: true
              }
            },
            messages: {
              select: {
                createdAt: true,
                isPublic: true
              }
            },
            notes: {
              orderBy: {
                createdAt: "desc"
              },
              include: {
                author: {
                  select: {
                    name: true
                  }
                }
              },
              take: 5
            }
          }
        })
      ]);

      return {
        user: serializeUser(user),
        wallet: wallet
          ? {
              userId: wallet.userId,
              availableBalance: wallet.availableBalance.toString(),
              heldBalance: wallet.heldBalance.toString(),
              updatedAt: wallet.updatedAt.toISOString()
            }
          : null,
        ledger: ledger.map((entry) => ({
          id: entry.id,
          type: entry.type,
          amount: entry.amount.toString(),
          jobId: entry.jobId,
          paymentId: entry.paymentId,
          createdAt: entry.createdAt.toISOString()
        })),
        payments: payments.map((payment) => serializePayment(payment)),
        jobs: jobs.map((job) => serializeTranscriptionJob(job)),
        tickets: tickets.map((thread) => ({
          ...serializeSupportThread(thread),
          notes: thread.notes.map((note) => serializeSupportNote(note))
        }))
      };
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

      const [entries, total] = await Promise.all([
        prisma.walletLedger.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset
        }),
        prisma.walletLedger.count({ where })
      ]);

      return reply.send({
        total,
        hasMore: query.offset + query.limit < total,
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

  app.get(
    "/v1/payments",
    {
      preHandler: [authenticate]
    },
    async (request) => {
      const query = paymentListQuerySchema.parse(request.query);
      const where: Prisma.PaymentWhereInput = {
        userId: request.user.sub
      };
      if (query.status) {
        where.status = query.status;
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset
        }),
        prisma.payment.count({ where })
      ]);
      const normalizedPayments = await Promise.all(
        payments.map((payment) => expirePaymentIfNeeded(payment))
      );

      return {
        total,
        hasMore: query.offset + query.limit < total,
        items: normalizedPayments.map((payment) => serializePayment(payment))
      };
    }
  );

  app.post(
    "/v1/payments/pix",
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const body = createPixPaymentBodySchema.parse(request.body);
      const amount = toMoneyDecimal(body.amount);
      const idempotencyKey = `pix:create:${request.user.sub}:${Date.now()}:${randomUUID().slice(0, 8)}`;
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { email: true }
      });
      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }

      let providerPaymentId = `${env.PAYMENT_PROVIDER_MODE}_${Date.now()}_${randomUUID().slice(0, 8)}`;
      let providerStatus: (typeof PAYMENT_STATUSES)[number] = "pending";
      const effectivePixExpiresMinutes =
        env.PAYMENT_PROVIDER_MODE === "mercado_pago"
          ? Math.max(env.PIX_EXPIRES_MINUTES, MERCADO_PAGO_MIN_PIX_EXPIRES_MINUTES)
          : env.PIX_EXPIRES_MINUTES;
      let expiresAt = new Date(Date.now() + effectivePixExpiresMinutes * 60 * 1000);
      let copyPasteCode = `pix:${providerPaymentId}:${amount.toString()}`;
      let qrCodeBase64: string | null = null;
      let ticketUrl: string | null = null;
      let providerRawPayload: unknown = {
        providerMode: env.PAYMENT_PROVIDER_MODE,
        copyPasteCode,
        expiresAt: expiresAt.toISOString(),
        requestedExpiresMinutes: env.PIX_EXPIRES_MINUTES,
        effectiveExpiresMinutes: effectivePixExpiresMinutes
      };

      if (env.PAYMENT_PROVIDER_MODE === "mercado_pago") {
        if (!mercadoPagoClient) {
          return reply.code(503).send({
            message:
              "Mercado Pago client is not configured. Set MERCADO_PAGO_ACCESS_TOKEN."
          });
        }

        try {
          const created = await mercadoPagoClient.createPixPayment({
            amount: body.amount,
            payerEmail: user.email,
            description: `${env.PAYMENT_DESCRIPTION_PREFIX} - Recarga de créditos`,
            externalReference: `user:${request.user.sub}`,
            idempotencyKey,
            expiresAt: expiresAt.toISOString(),
            notificationUrl: env.MERCADO_PAGO_WEBHOOK_URL
          });

          providerPaymentId = created.id;
          providerStatus = mapMercadoPagoStatusToPaymentStatus(created.status);
          expiresAt = created.expiresAt ? new Date(created.expiresAt) : expiresAt;
          copyPasteCode = created.qrCode ?? copyPasteCode;
          qrCodeBase64 = created.qrCodeBase64;
          ticketUrl = created.ticketUrl;
          providerRawPayload = created.raw;
        } catch (error) {
          request.log.error(error, "Could not create PIX payment in Mercado Pago.");
          return reply.code(503).send({
            message: getMercadoPagoPixErrorMessage(error)
          });
        }
      }

      const payment = await prisma.payment.create({
        data: {
          userId: request.user.sub,
          provider: "mercado_pago",
          providerPaymentId,
          amount,
          status: providerStatus,
          rawPayload: toPrismaJsonValue({
            providerMode: env.PAYMENT_PROVIDER_MODE,
            method: "pix",
            statusDetail:
              getStringValue(
                getJsonObject(providerRawPayload as Prisma.JsonValue)?.status_detail
              ) ?? null,
            copyPasteCode,
            expiresAt: expiresAt.toISOString(),
            qrCodeBase64,
            ticketUrl,
            providerPayload: providerRawPayload
          })
        }
      });

      const finalizedPayment =
        payment.status === "approved"
          ? (await approvePaymentAndCreditWallet({
              paymentId: payment.id,
              idempotencyKey: `payment:${payment.id}:credit`
            }))?.payment ?? payment
          : payment;

      return reply.code(201).send({
        payment: serializePayment(finalizedPayment),
        pix: {
          providerMode: env.PAYMENT_PROVIDER_MODE,
          copyPasteCode,
          expiresAt: expiresAt.toISOString(),
          qrCodeBase64,
          ticketUrl
        }
      });
    }
  );

  app.post(
    "/v1/payments/card",
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      if (env.PAYMENT_PROVIDER_MODE !== "mercado_pago" || !mercadoPagoClient) {
        return reply.code(405).send({
          message:
            "Card payments are only available when PAYMENT_PROVIDER_MODE=mercado_pago."
        });
      }

      const body = createCardPaymentBodySchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { email: true }
      });
      if (!user) {
        return reply.code(404).send({
          message: "User not found."
        });
      }

      const amount = toMoneyDecimal(body.amount);
      const idempotencyKey = `card:create:${request.user.sub}:${Date.now()}:${randomUUID().slice(0, 8)}`;

      try {
        const created = await mercadoPagoClient.createCardPayment({
          amount: body.amount,
          token: body.token,
          description: `${env.PAYMENT_DESCRIPTION_PREFIX} - Recarga com cartão`,
          externalReference: `user:${request.user.sub}`,
          idempotencyKey,
          installments: body.installments,
          paymentMethodId: body.paymentMethodId,
          issuerId: body.issuerId,
          notificationUrl: env.MERCADO_PAGO_WEBHOOK_URL,
          processingMode: body.processingMode,
          paymentMethodOptionId: body.paymentMethodOptionId,
          payer: {
            email: body.payer.email || user.email,
            identification: body.payer.identification
          }
        });

        const payment = await prisma.payment.create({
          data: {
            userId: request.user.sub,
            provider: "mercado_pago",
            providerPaymentId: created.id,
            amount,
            status: mapMercadoPagoStatusToPaymentStatus(created.status),
            rawPayload: toPrismaJsonValue({
              providerMode: env.PAYMENT_PROVIDER_MODE,
              method: "credit_card",
              statusDetail: created.statusDetail,
              lastFourDigits: body.lastFourDigits ?? created.lastFourDigits,
              cardholderName: body.cardholderName,
              paymentMethodId: created.paymentMethodId ?? body.paymentMethodId,
              paymentTypeId: body.paymentTypeId ?? created.paymentTypeId,
              installments: created.installments ?? body.installments,
              issuerId: created.issuerId ?? body.issuerId,
              providerPayload: created.raw
            })
          }
        });

        const finalizedPayment =
          payment.status === "approved"
            ? (await approvePaymentAndCreditWallet({
                paymentId: payment.id,
                idempotencyKey: `payment:${payment.id}:credit`
              }))?.payment ?? payment
            : payment;

        return reply.code(201).send({
          payment: serializePayment(finalizedPayment)
        });
      } catch (error) {
        request.log.error(error, "Could not create card payment in Mercado Pago.");
        return reply.code(503).send({
          message: "Could not create card payment with Mercado Pago."
        });
      }
    }
  );

  app.post(
    "/v1/payments/:id/confirm",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      if (env.PAYMENT_PROVIDER_MODE !== "mock") {
        return reply.code(405).send({
          message:
            "Manual payment confirmation is only available in PAYMENT_PROVIDER_MODE=mock."
        });
      }

      const params = paymentParamsSchema.parse(request.params);
      const payment = await prisma.payment.findFirst({
        where: {
          id: params.id,
          userId: request.user.sub
        }
      });
      if (!payment) {
        return reply.code(404).send({
          message: "Payment not found."
        });
      }

      if (payment.status === "approved") {
        return reply.send({
          payment: serializePayment(payment),
          credited: false
        });
      }

      const approved = await approvePaymentAndCreditWallet({
        paymentId: payment.id,
        rawPayload: {
          providerPayload: {
            event: "mock_manual_confirmation",
            confirmedAt: new Date().toISOString()
          }
        },
        idempotencyKey: `payment:${payment.id}:credit`
      });
      if (!approved) {
        return reply.code(404).send({
          message: "Payment not found."
        });
      }

      return reply.send({
        payment: serializePayment(approved.payment),
        credited: approved.credited
      });
    }
  );

  app.post(
    "/v1/payments/:id/cancel",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const params = paymentParamsSchema.parse(request.params);
      const payment = await prisma.payment.findFirst({
        where: {
          id: params.id,
          userId: request.user.sub
        }
      });
      if (!payment) {
        return reply.code(404).send({
          message: "Payment not found."
        });
      }

      const metadata = getPaymentMetadata(payment.rawPayload);
      if (metadata.method !== "pix") {
        return reply.code(400).send({
          message: "Only PIX payments can be cancelled."
        });
      }

      const normalizedPayment = await expirePaymentIfNeeded(payment);
      if (normalizedPayment.status !== "pending") {
        return reply.send({
          payment: serializePayment(normalizedPayment)
        });
      }

      let nextStatus: (typeof PAYMENT_STATUSES)[number] = "rejected";
      let providerPayload: unknown = {
        event: "user_cancelled_pix",
        cancelledAt: new Date().toISOString()
      };
      let statusDetail = getCancelledByUserStatusDetail();

      if (env.PAYMENT_PROVIDER_MODE === "mercado_pago") {
        if (!mercadoPagoClient) {
          return reply.code(503).send({
            message:
              "Mercado Pago client is not configured. Set MERCADO_PAGO_ACCESS_TOKEN."
          });
        }

        try {
          const cancelled = await mercadoPagoClient.cancelPayment(
            normalizedPayment.providerPaymentId,
            `pix:cancel:${normalizedPayment.id}:${Date.now()}`
          );
          nextStatus = mapMercadoPagoStatusToPaymentStatus(cancelled.status);
          providerPayload = cancelled.raw;
          statusDetail = cancelled.statusDetail ?? getCancelledByUserStatusDetail();
        } catch (error) {
          request.log.error(error, "Could not cancel PIX payment in Mercado Pago.");
          return reply.code(503).send({
            message: "Nao foi possivel cancelar o PIX agora. Tente novamente em instantes."
          });
        }
      }

      const updated = await prisma.payment.update({
        where: { id: normalizedPayment.id },
        data: {
          status: nextStatus,
          rawPayload: mergePaymentRawPayload(normalizedPayment.rawPayload, {
            providerPayload,
            statusDetail,
            status: nextStatus
          })
        }
      });

      return reply.send({
        payment: serializePayment(updated)
      });
    }
  );

  app.post("/v1/webhooks/mercadopago", async (request, reply) => {
    const providerPaymentId = resolveWebhookProviderPaymentId(request, request.body);
    if (!providerPaymentId) {
      return reply.code(400).send({
        message: "Webhook payload missing payment identifier."
      });
    }

    const authValidation = verifyPaymentWebhookAuth({
      request,
      providerPaymentId
    });
    if (!authValidation.ok) {
      request.log.warn(
        getRequestContext(request, {
          provider_payment_id: providerPaymentId,
          reason: authValidation.message
        }),
        "Mercado Pago webhook authentication failed."
      );
      return reply.code(401).send({
        message: authValidation.message
      });
    }

    const resolved = await resolveWebhookPaymentStatus({
      request,
      body: request.body,
      providerPaymentId
    });
    if (!resolved) {
      return reply.code(400).send({
        message: "Webhook payload missing payment status."
      });
    }

    const payment = await prisma.payment.findUnique({
      where: {
        providerPaymentId
      }
    });
    if (!payment) {
      return reply.code(404).send({
        message: "Payment not found."
      });
    }

    if (resolved.status === "approved") {
      const approved = await approvePaymentAndCreditWallet({
        paymentId: payment.id,
        rawPayload: {
          providerPayload: resolved.rawPayload,
          statusDetail: resolved.statusDetail
        },
        idempotencyKey: `payment:${payment.id}:credit`
      });
      if (!approved) {
        return reply.code(404).send({
          message: "Payment not found."
        });
      }

      request.log.info(
        getRequestContext(request, {
          provider_payment_id: providerPaymentId,
          payment_id: approved.payment.id,
          payment_status: approved.payment.status,
          credited: approved.credited
        }),
        "Mercado Pago webhook approved payment processed."
      );

      return reply.send({
        ok: true,
        payment: serializePayment(approved.payment),
        credited: approved.credited
      });
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: resolved.status,
        rawPayload: mergePaymentRawPayload(payment.rawPayload, {
          providerPayload: resolved.rawPayload,
          statusDetail: resolved.statusDetail,
          status: resolved.status
        })
      }
    });

    request.log.info(
      getRequestContext(request, {
        provider_payment_id: providerPaymentId,
        payment_id: updated.id,
        payment_status: updated.status,
        credited: false
      }),
      "Mercado Pago webhook non-approved payment processed."
    );

    return reply.send({
      ok: true,
      payment: serializePayment(updated),
      credited: false
    });
  });

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
      preHandler: [authenticate],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
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

      const wallet = await prisma.wallet.findUnique({
        where: { userId: request.user.sub }
      });
      if (!wallet) {
        return reply.code(404).send({
          message: "Wallet not found."
        });
      }
      if (wallet.availableBalance.lte(0)) {
        return reply.code(402).send({
          message:
            "Insufficient credits. Add more balance to create new transcription jobs."
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
          translationTargetLanguage: body.features.translationTargetLanguage ?? null,
          diarizationEnabled: body.features.diarization,
          generatePdf: body.features.generatePdf,
          originalTranscriptStatus: "pending",
          translatedTranscriptStatus: body.features.translationTargetLanguage ? "pending" : null,
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
            taskType: "transcription",
            sourceObjectKey: job.sourceObjectKey,
            language: job.language,
            transcriptionHints: body.transcriptionHints
          },
          buildTranscriptionQueueOptions(job.id, "transcription")
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

      request.log.info(
        getRequestContext(request, {
          job_id: queuedJob.id,
          source_object_key: queuedJob.sourceObjectKey,
          queue: env.TRANSCRIPTION_QUEUE,
          attempts: env.TRANSCRIPTION_MAX_ATTEMPTS
        }),
        "Transcription job queued."
      );

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

      const [jobs, total] = await Promise.all([
        prisma.transcriptionJob.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
          include: { outputs: true }
        }),
        prisma.transcriptionJob.count({ where })
      ]);

      return {
        total,
        hasMore: query.offset + query.limit < total,
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
          chunks: true,
          transcripts: {
            include: {
              segments: true
            }
          }
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

  app.post(
    "/v1/transcriptions/:id/reprocess",
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
          outputs: true
        }
      });
      if (!job) {
        return reply.code(404).send({
          message: "Transcription job not found."
        });
      }

      if (job.status !== "failed") {
        return reply.code(409).send({
          message: "Only failed jobs can be reprocessed.",
          job: serializeTranscriptionJob(job)
        });
      }

      if (!job.sourceObjectKey) {
        return reply.code(410).send({
          message: "Source file was deleted during retention cleanup and can no longer be reprocessed."
        });
      }

      if (objectStorage) {
        try {
          await objectStorage.headObject(job.sourceObjectKey);
        } catch (error) {
          if (getErrorStatusCode(error) === 404) {
            return reply.code(404).send({
              message: "Uploaded source file not found for reprocessing."
            });
          }
          request.log.error(
            error,
            "Could not validate source object in OCI bucket before reprocess."
          );
          return reply.code(503).send({
            message: "Could not validate uploaded source file for reprocessing."
          });
        }
      } else {
        const sourcePath = resolveStoragePath(uploadsRootDir, job.sourceObjectKey);
        if (!sourcePath || !existsSync(sourcePath)) {
          return reply.code(404).send({
            message: "Uploaded source file not found for reprocessing."
          });
        }
      }

      // Check if there's already an active/waiting queue entry for this job.
      // Failed entries are intentionally left — we use a new unique queue ID
      // for reprocessing to avoid BullMQ silently ignoring add() when a job
      // with the same ID already exists in any state in Redis.
      for (const queueJobId of [job.id, `${job.id}.reprocess`]) {
        const existingQueueJob = await transcriptionQueue.getJob(queueJobId);
        if (!existingQueueJob) continue;
        const queueState = await existingQueueJob.getState();
        if (
          queueState === "active" ||
          queueState === "waiting" ||
          queueState === "delayed" ||
          queueState === "prioritized"
        ) {
          return reply.code(409).send({
            message: "Job is already queued for processing."
          });
        }
        try {
          await existingQueueJob.remove();
        } catch {
          // ignore stale queue entry cleanup failures
        }
      }

      // Reset wallet ledger entries for this job so the worker can create
      // a fresh hold/capture cycle. Without this, the old hold idempotency key
      // causes reserveCreditsForJob to no-op while heldBalance stays 0,
      // making captureReservedCreditsForJob fail at completion.
      await prisma.walletLedger.deleteMany({
        where: {
          jobId: job.id,
          type: { in: ["hold", "refund"] }
        }
      });

      // Use a timestamped queue ID so re-adds are never silently deduplicated.
      const reprocessQueueId = `${job.id}.reprocess.${Date.now()}`;
      await transcriptionQueue.add(
        TRANSCRIPTION_JOB_NAME,
        {
          jobId: job.id,
          userId: job.userId,
          taskType: "transcription",
          sourceObjectKey: job.sourceObjectKey,
          language: job.language
        },
        {
          ...buildTranscriptionQueueOptions(job.id, "transcription"),
          jobId: reprocessQueueId
        }
      );

      const queuedJob = await prisma.transcriptionJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          originalTranscriptStatus: "pending",
          translatedTranscriptStatus: job.translationTargetLanguage ? "pending" : null,
          errorCode: null,
          errorMessage: null,
          completedAt: null
        },
        include: {
          outputs: true
        }
      });

      request.log.info(
        getRequestContext(request, {
          job_id: queuedJob.id,
          queue: env.TRANSCRIPTION_QUEUE
        }),
        "Failed transcription job queued for reprocessing."
      );

      return reply.send({
        job: serializeTranscriptionJob(queuedJob)
      });
    }
  );

  app.put(
    "/v1/transcriptions/:id/transcript/original",
    {
      preHandler: [authenticate]
    },
    async (request, reply) => {
      const params = transcriptionParamsSchema.parse(request.params);
      const body = updateOriginalTranscriptBodySchema.parse(request.body);

      const job = await prisma.transcriptionJob.findFirst({
        where: {
          id: params.id,
          userId: request.user.sub
        },
        include: {
          outputs: true,
          chunks: true,
          transcripts: {
            include: {
              segments: true
            }
          }
        }
      });
      if (!job) {
        return reply.code(404).send({
          message: "Transcription job not found."
        });
      }

      const originalTranscript =
        job.transcripts.find((transcript) => transcript.variant === "original") ?? null;
      if (!originalTranscript) {
        return reply.code(409).send({
          message: "Original transcript is not available for editing yet."
        });
      }

      const nextRevision = originalTranscript.revision + 1;

      await prisma.$transaction(async (tx) => {
        await tx.transcriptionTranscript.update({
          where: { id: originalTranscript.id },
          data: {
            revision: nextRevision,
            sourceRevision: nextRevision,
            status: "regenerating",
            errorCode: null,
            errorMessage: null
          }
        });

        await tx.transcriptSegment.createMany({
          data: body.segments.map((segment) => ({
            transcriptId: originalTranscript.id,
            revision: nextRevision,
            segmentIndex: segment.segmentIndex,
            startSec: parseOptionalDecimal(segment.startSec),
            endSec: parseOptionalDecimal(segment.endSec),
            text: segment.text.trim(),
            speakerLabel: segment.speakerLabel ?? null,
            speakerConfidence: null,
            language: segment.language ?? originalTranscript.language,
            kind: "speech",
            status: "active"
          }))
        });

        if (job.translationTargetLanguage) {
          await tx.transcriptionTranscript.upsert({
            where: {
              jobId_variant: {
                jobId: job.id,
                variant: "translated"
              }
            },
            create: {
              jobId: job.id,
              variant: "translated",
              kind: "translation",
              language: job.translationTargetLanguage,
              status: "regenerating",
              revision: nextRevision,
              sourceRevision: nextRevision
            },
            update: {
              language: job.translationTargetLanguage,
              status: "regenerating",
              revision: nextRevision,
              sourceRevision: nextRevision,
              errorCode: null,
              errorMessage: null
            }
          });
        }

        await tx.transcriptionJob.update({
          where: { id: job.id },
          data: {
            originalTranscriptStatus: "regenerating",
            translatedTranscriptStatus: job.translationTargetLanguage ? "regenerating" : null
          }
        });
      });

      try {
        await transcriptionQueue.add(
          TRANSCRIPTION_JOB_NAME,
          {
            jobId: job.id,
            userId: job.userId,
            taskType: "refresh-original",
            sourceRevision: nextRevision
          },
          buildTranscriptionQueueOptions(job.id, "refresh-original", nextRevision)
        );
      } catch (error) {
        request.log.error(error, "Could not enqueue original transcript refresh.");
        await prisma.$transaction(async (tx) => {
          await tx.transcriptionJob.update({
            where: { id: job.id },
            data: {
              originalTranscriptStatus: "failed",
              translatedTranscriptStatus: job.translationTargetLanguage ? "failed" : null
            }
          });
          await tx.transcriptionTranscript.update({
            where: { id: originalTranscript.id },
            data: {
              status: "failed",
              errorCode: "QUEUE_ENQUEUE_FAILED",
              errorMessage: "Could not enqueue original transcript refresh."
            }
          });
          if (job.translationTargetLanguage) {
            await tx.transcriptionTranscript.updateMany({
              where: {
                jobId: job.id,
                variant: "translated"
              },
              data: {
                status: "failed",
                errorCode: "QUEUE_ENQUEUE_FAILED",
                errorMessage: "Could not enqueue translation regeneration."
              }
            });
          }
        });

        const failedJob = await prisma.transcriptionJob.findFirst({
          where: {
            id: job.id,
            userId: request.user.sub
          },
          include: {
            outputs: true,
            chunks: true,
            transcripts: {
              include: {
                segments: true
              }
            }
          }
        });

        return reply.code(503).send({
          message: "A revisao foi salva, mas nao foi possivel iniciar a regeneracao agora.",
          job: serializeTranscriptionJobDetail(failedJob!)
        });
      }

      const updatedJob = await prisma.transcriptionJob.findFirst({
        where: {
          id: job.id,
          userId: request.user.sub
        },
        include: {
          outputs: true,
          chunks: true,
          transcripts: {
            include: {
              segments: true
            }
          }
        }
      });

      return reply.send({
        job: serializeTranscriptionJobDetail(updatedJob!)
      });
    }
  );

  app.post(
    "/v1/transcriptions/:id/translation/regenerate",
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
          chunks: true,
          transcripts: {
            include: {
              segments: true
            }
          }
        }
      });
      if (!job) {
        return reply.code(404).send({
          message: "Transcription job not found."
        });
      }
      if (!job.translationTargetLanguage) {
        return reply.code(409).send({
          message: "This transcription does not have a target language configured."
        });
      }

      const originalTranscript =
        job.transcripts.find((transcript) => transcript.variant === "original") ?? null;
      if (!originalTranscript) {
        return reply.code(409).send({
          message: "Original transcript is not available yet."
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.transcriptionTranscript.upsert({
          where: {
            jobId_variant: {
              jobId: job.id,
              variant: "translated"
            }
          },
          create: {
            jobId: job.id,
            variant: "translated",
            kind: "translation",
            language: job.translationTargetLanguage!,
            status: "pending",
            revision: originalTranscript.revision,
            sourceRevision: originalTranscript.revision
          },
          update: {
            language: job.translationTargetLanguage!,
            status: "pending",
            revision: originalTranscript.revision,
            sourceRevision: originalTranscript.revision,
            errorCode: null,
            errorMessage: null
          }
        });

        await tx.transcriptionJob.update({
          where: { id: job.id },
          data: {
            translatedTranscriptStatus: "pending"
          }
        });
      });

      try {
        await transcriptionQueue.add(
          TRANSCRIPTION_JOB_NAME,
          {
            jobId: job.id,
            userId: job.userId,
            taskType: "translation",
            sourceRevision: originalTranscript.revision
          },
          buildTranscriptionQueueOptions(job.id, "translation", originalTranscript.revision)
        );
      } catch (error) {
        request.log.error(error, "Could not enqueue translation regeneration.");
        await prisma.$transaction(async (tx) => {
          await tx.transcriptionJob.update({
            where: { id: job.id },
            data: {
              translatedTranscriptStatus: "failed"
            }
          });
          await tx.transcriptionTranscript.updateMany({
            where: {
              jobId: job.id,
              variant: "translated"
            },
            data: {
              status: "failed",
              errorCode: "QUEUE_ENQUEUE_FAILED",
              errorMessage: "Could not enqueue translation regeneration."
            }
          });
        });

        const failedJob = await prisma.transcriptionJob.findFirst({
          where: {
            id: job.id,
            userId: request.user.sub
          },
          include: {
            outputs: true,
            chunks: true,
            transcripts: {
              include: {
                segments: true
              }
            }
          }
        });

        return reply.code(503).send({
          message: "Nao foi possivel reagendar a traducao agora.",
          job: serializeTranscriptionJobDetail(failedJob!)
        });
      }

      const updatedJob = await prisma.transcriptionJob.findFirst({
        where: {
          id: job.id,
          userId: request.user.sub
        },
        include: {
          outputs: true,
          chunks: true,
          transcripts: {
            include: {
              segments: true
            }
          }
        }
      });

      return reply.send({
        job: serializeTranscriptionJobDetail(updatedJob!)
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
          variant: query.variant,
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
      } else if (query.format === "pdf") {
        reply.type("application/pdf");
      } else {
        reply.type("text/plain; charset=utf-8");
      }
      reply.header(
        "content-disposition",
        `attachment; filename="transcription-${output.jobId}-${query.variant}.${query.format}"`
      );
      return reply.send(outputContent);
    }
  );
}

async function start() {
  await registerRoutes();
  await bootstrapStaffRoles();

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
