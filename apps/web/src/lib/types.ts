export const JOB_STATUSES = [
  "uploaded",
  "validating",
  "queued",
  "processing",
  "completed",
  "failed"
] as const;

export const PAYMENT_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export const OUTPUT_FORMATS = ["txt", "srt", "pdf"] as const;
export const TRANSCRIPT_VARIANTS = ["original", "translated"] as const;
export const TRANSCRIPT_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "regenerating"
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type TranscriptVariant = (typeof TRANSCRIPT_VARIANTS)[number];
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

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
  variant: TranscriptVariant;
  language: string | null;
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

export type TranscriptSegment = {
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

export type TranscriptVariantDetail = {
  id: string;
  variant: TranscriptVariant;
  kind: "transcript" | "translation";
  language: string;
  status: TranscriptStatus;
  revision: number;
  sourceRevision: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  updatedAt: string;
  segments: TranscriptSegment[];
};

export type TranscriptionJob = {
  id: string;
  status: JobStatus;
  sourceObjectKey: string;
  language: string;
  translationTargetLanguage: string | null;
  diarizationEnabled: boolean;
  generatePdf: boolean;
  originalTranscriptStatus: TranscriptStatus;
  translatedTranscriptStatus: TranscriptStatus | null;
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
  transcripts: {
    original: TranscriptVariantDetail | null;
    translated: TranscriptVariantDetail | null;
  };
};

export type AuthResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  welcomeCredit?: string;
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

export type CreateTranscriptionPayload = {
  sourceObjectKey: string;
  language: string;
  features?: {
    diarization?: boolean;
    translationTargetLanguage?: string;
    generatePdf?: boolean;
  };
};

export type UpdateOriginalTranscriptPayload = {
  segments: Array<{
    segmentIndex: number;
    startSec: string | null;
    endSec: string | null;
    text: string;
    speakerLabel?: string | null;
    language?: string;
  }>;
};

export type PaymentSummary = {
  id: string;
  provider: "mercado_pago";
  providerMode: "mock" | "mercado_pago" | null;
  providerPaymentId: string;
  method: "pix" | "credit_card";
  amount: string;
  status: PaymentStatus;
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

export type PixPaymentResponse = {
  payment: PaymentSummary;
  pix: {
    providerMode: "mock" | "mercado_pago";
    copyPasteCode: string;
    expiresAt: string;
    qrCodeBase64?: string | null;
    ticketUrl?: string | null;
  };
};

export type CardPaymentResponse = {
  payment: PaymentSummary;
};
