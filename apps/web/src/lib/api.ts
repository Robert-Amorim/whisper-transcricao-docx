import { clearSessionTokens, getSessionTokens, setSessionTokens } from "./session";
import type {
  AuthResponse,
  CardPaymentResponse,
  JobStatus,
  OutputFormat,
  PaymentStatus,
  PaymentSummary,
  PixPaymentResponse,
  PublicUser,
  SessionTokens,
  TranscriptionJob,
  TranscriptionJobDetail,
  UploadPresignRequest,
  UploadPresignResponse,
  WalletLedgerEntry,
  WalletSummary
} from "./types";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:3333" : window.location.origin)
).replace(/\/+$/, "");

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  signal?: AbortSignal;
};

type ApiErrorBody = {
  message?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function buildUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function isBodyInit(body: unknown): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  );
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function parseError(response: Response): Promise<ApiError> {
  let details: ApiErrorBody | undefined;
  try {
    details = await parseBody<ApiErrorBody>(response);
  } catch {
    details = undefined;
  }

  const message = details?.message ?? "Falha na comunicacao com a API.";
  return new ApiError(message, response.status, details);
}

async function refreshTokens(): Promise<SessionTokens | null> {
  const session = getSessionTokens();
  if (!session?.refreshToken) {
    clearSessionTokens();
    return null;
  }

  const response = await fetch(buildUrl("/v1/auth/refresh"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken
    })
  });

  if (!response.ok) {
    clearSessionTokens();
    return null;
  }

  const payload = await parseBody<Pick<AuthResponse, "accessToken" | "refreshToken">>(response);
  if (!payload?.accessToken || !payload?.refreshToken) {
    clearSessionTokens();
    return null;
  }

  const updated = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken
  };
  setSessionTokens(updated);
  return updated;
}

async function requestRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);

  let serializedBody: BodyInit | undefined;
  if (options.body !== undefined) {
    if (isBodyInit(options.body)) {
      serializedBody = options.body;
    } else {
      headers.set("content-type", "application/json");
      serializedBody = JSON.stringify(options.body);
    }
  }

  let token = getSessionTokens()?.accessToken;
  if (options.auth) {
    if (!token) {
      throw new ApiError("Sessao expirada. Faca login novamente.", 401);
    }
    headers.set("authorization", `Bearer ${token}`);
  }

  const execute = () =>
    fetch(buildUrl(path), {
      method,
      headers,
      body: serializedBody,
      signal: options.signal
    });

  let response = await execute();

  if (response.status === 401 && options.auth && options.retryOnUnauthorized !== false) {
    const refreshed = await refreshTokens();
    if (refreshed?.accessToken) {
      token = refreshed.accessToken;
      headers.set("authorization", `Bearer ${token}`);
      response = await execute();
    }
  }

  return response;
}

async function requestJson<T>(path: string, options: RequestOptions = {}) {
  const response = await requestRaw(path, options);
  if (!response.ok) {
    throw await parseError(response);
  }
  return parseBody<T>(response);
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return `Nao foi possivel conectar na API (${API_BASE_URL}). Verifique se o backend esta em execucao.`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export async function login(payload: { email: string; password: string }) {
  return requestJson<AuthResponse>("/v1/auth/login", {
    method: "POST",
    body: payload
  });
}

export async function register(payload: { name: string; email: string; password: string }) {
  return requestJson<AuthResponse>("/v1/auth/register", {
    method: "POST",
    body: payload
  });
}

export async function getMe() {
  return requestJson<PublicUser>("/v1/me", {
    auth: true
  });
}

export async function updateMe(payload: {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  return requestJson<PublicUser>("/v1/me", {
    method: "PUT",
    body: payload,
    auth: true
  });
}

export async function getWallet() {
  return requestJson<WalletSummary>("/v1/wallet", {
    auth: true
  });
}

export async function listWalletLedger(params?: { limit?: number; offset?: number; type?: WalletLedgerEntry["type"] }) {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 50) });
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.type) query.set("type", params.type);
  return requestJson<{ items: WalletLedgerEntry[]; total: number; hasMore: boolean }>(
    `/v1/wallet/ledger?${query.toString()}`, { auth: true }
  );
}

export async function listPayments(params?: { limit?: number; offset?: number; status?: PaymentStatus }) {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 20) });
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.status) query.set("status", params.status);
  return requestJson<{ items: PaymentSummary[]; total: number; hasMore: boolean }>(
    `/v1/payments?${query.toString()}`, { auth: true }
  );
}

export async function createPixPayment(payload: { amount: number }) {
  return requestJson<PixPaymentResponse>("/v1/payments/pix", {
    method: "POST",
    body: payload,
    auth: true
  });
}

export async function createCardPayment(payload: {
  amount: number;
  token: string;
  issuerId?: string;
  paymentMethodId: string;
  paymentMethodOptionId?: string;
  processingMode?: string;
  installments: number;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  cardholderName?: string;
  paymentTypeId?: string;
  lastFourDigits?: string;
}) {
  return requestJson<CardPaymentResponse>("/v1/payments/card", {
    method: "POST",
    body: payload,
    auth: true
  });
}

export async function confirmPixPayment(paymentId: string) {
  return requestJson<{ payment: PaymentSummary; credited: boolean }>(
    `/v1/payments/${encodeURIComponent(paymentId)}/confirm`,
    {
      method: "POST",
      auth: true
    }
  );
}

export async function listTranscriptions(params?: { limit?: number; offset?: number; status?: JobStatus }) {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 20) });
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.status) query.set("status", params.status);
  return requestJson<{ items: TranscriptionJob[]; total: number; hasMore: boolean }>(
    `/v1/transcriptions?${query.toString()}`, { auth: true }
  );
}

export async function getTranscription(id: string) {
  return requestJson<{ job: TranscriptionJobDetail }>(`/v1/transcriptions/${encodeURIComponent(id)}`, {
    auth: true
  });
}

export async function createUploadPresign(payload: UploadPresignRequest) {
  return requestJson<UploadPresignResponse>("/v1/uploads/presign", {
    method: "POST",
    body: payload,
    auth: true
  });
}

export async function uploadToPresignedUrl(request: UploadPresignResponse, file: File) {
  const response = await fetch(request.uploadUrl, {
    method: request.method,
    headers: request.requiredHeaders,
    body: file
  });

  if (!response.ok) {
    throw new ApiError(
      `Falha no upload do arquivo (status ${response.status}).`,
      response.status
    );
  }
}

export async function createTranscription(payload: { sourceObjectKey: string; language: string }) {
  return requestJson<{ job: TranscriptionJob }>("/v1/transcriptions", {
    method: "POST",
    body: payload,
    auth: true
  });
}

export async function reprocessTranscription(jobId: string) {
  return requestJson<{ job: TranscriptionJob }>(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/reprocess`,
    {
      method: "POST",
      auth: true
    }
  );
}

function getFilenameFromDisposition(headerValue: string | null, fallback: string) {
  if (!headerValue) {
    return fallback;
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = headerValue.match(/filename="([^"]+)"/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

export async function downloadTranscriptionOutput(jobId: string, format: OutputFormat) {
  const response = await requestRaw(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/download?format=${format}`,
    {
      auth: true
    }
  );

  if (!response.ok) {
    throw await parseError(response);
  }

  const blob = await response.blob();
  const fileName = getFilenameFromDisposition(
    response.headers.get("content-disposition"),
    `transcricao-${jobId}.${format}`
  );

  return {
    blob,
    fileName
  };
}

export async function getTranscriptionOutputText(jobId: string, format: OutputFormat) {
  const response = await requestRaw(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/download?format=${format}`,
    {
      auth: true
    }
  );

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.text();
}
