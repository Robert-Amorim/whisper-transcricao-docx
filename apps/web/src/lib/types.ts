export const JOB_STATUSES = [
  "uploaded",
  "validating",
  "queued",
  "processing",
  "completed",
  "failed"
] as const;

export const OUTPUT_FORMATS = ["txt", "srt"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type WalletSummary = {
  userId: string;
  availableBalance: string;
  heldBalance: string;
  updatedAt: string;
};

export type WalletLedgerEntry = {
  id: string;
  type: "credit" | "hold" | "capture" | "refund" | "adjustment";
  amount: string;
  jobId: string | null;
  paymentId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
};

export type TranscriptionOutput = {
  format: OutputFormat;
  objectKey: string;
  sizeBytes: number;
  createdAt: string;
};

export type TranscriptionChunk = {
  chunkIndex: number;
  startSec: string | null;
  endSec: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type TranscriptionJob = {
  id: string;
  status: JobStatus;
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
  outputs: TranscriptionOutput[];
};

export type TranscriptionJobDetail = TranscriptionJob & {
  chunks?: TranscriptionChunk[];
};

export type AuthResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

export type UploadPresignRequest = {
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
};

export type UploadPresignResponse = {
  objectKey: string;
  method: "PUT";
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  maxBytes: number;
  expiresInSeconds: number;
};
