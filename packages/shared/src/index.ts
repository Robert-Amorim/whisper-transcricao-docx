export const JOB_STATUSES = [
  "uploaded",
  "validating",
  "queued",
  "processing",
  "completed",
  "failed"
] as const;

export const PAYMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired"
] as const;

export const LEDGER_TYPES = [
  "credit",
  "hold",
  "capture",
  "refund",
  "adjustment"
] as const;

export const OUTPUT_FORMATS = ["txt", "srt"] as const;

export const ACCEPTED_UPLOAD_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "mp4",
  "webm",
  "ogg",
  "mpeg"
] as const;

export const ACCEPTED_UPLOAD_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/x-m4a",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm"
] as const;

export const TRANSCRIPTION_JOB_NAME = "transcription.process";

export type JobStatus = (typeof JOB_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type LedgerType = (typeof LEDGER_TYPES)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type AcceptedUploadExtension = (typeof ACCEPTED_UPLOAD_EXTENSIONS)[number];
