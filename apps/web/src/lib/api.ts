import { clearSessionTokens, getSessionTokens, setSessionTokens } from "./session";
import type {
  AdminSupportSummary,
  AdminSupportThreadDetail,
  AdminUserDetail,
  AdminUserListItem,
  AuthResponse,
  CardPaymentResponse,
  CreateTranscriptionPayload,
  JobStatus,
  OutputFormat,
  PaymentStatus,
  PaymentSummary,
  PixPaymentResponse,
  PublicUser,
  SessionTokens,
  SupportMessageDeliveryChannel,
  SupportSummary,
  SupportThread,
  SupportThreadCategory,
  SupportThreadDetail,
  SupportThreadStatus,
  TranscriptVariant,
  TranscriptionJob,
  TranscriptionJobDetail,
  UpdateOriginalTranscriptPayload,
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
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  signal?: AbortSignal;
};

type ApiErrorBody = {
  message?: string;
  issues?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
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
    } else {
      // Both tokens expired — throw 401 so each call-site's catch block
      // can call navigate("/login"). Using window.location.replace here
      // conflicts with React Router's navigate() and corrupts its state.
      throw new ApiError("Sessao expirada. Faca login novamente.", 401);
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
    const issues = (error.details as ApiErrorBody | undefined)?.issues;
    const formError = issues?.formErrors?.find(Boolean);
    if (formError) {
      return formError;
    }

    if (issues?.fieldErrors) {
      for (const messages of Object.values(issues.fieldErrors)) {
        const message = messages?.find(Boolean);
        if (message) {
          return message;
        }
      }
    }

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

export async function register(payload: { name: string; email: string; password: string; turnstileToken?: string }) {
  return requestJson<AuthResponse>("/v1/auth/register", {
    method: "POST",
    body: payload
  });
}

export async function requestPasswordReset(payload: { email: string }) {
  return requestJson<{ message: string; deliveryAvailable: boolean }>("/v1/auth/request-password-reset", {
    method: "POST",
    body: payload
  });
}

export async function resetPassword(payload: { token: string; newPassword: string }) {
  return requestJson<{ message: string }>("/v1/auth/reset-password", {
    method: "POST",
    body: payload
  });
}

export async function verifyEmail(token: string) {
  return requestJson<{ message: string }>(`/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {});
}

export async function resendVerification() {
  return requestJson<{ message: string }>("/v1/auth/resend-verification", {
    method: "POST",
    auth: true
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

export async function listSupportTickets(params?: { limit?: number; offset?: number; status?: SupportThreadStatus }) {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 20) });
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.status) query.set("status", params.status);
  return requestJson<{ items: SupportThread[]; total: number; hasMore: boolean }>(
    `/v1/support/tickets?${query.toString()}`,
    { auth: true }
  );
}

export async function getSupportSummary() {
  return requestJson<SupportSummary>("/v1/support/summary", {
    auth: true
  });
}

export async function createSupportTicket(payload: {
  category: SupportThreadCategory;
  subject: string;
  message: string;
}) {
  return requestJson<{ thread: SupportThreadDetail }>("/v1/support/tickets", {
    method: "POST",
    body: payload,
    auth: true
  });
}

export async function getSupportTicket(threadId: string) {
  return requestJson<{ thread: SupportThreadDetail }>(`/v1/support/tickets/${encodeURIComponent(threadId)}`, {
    auth: true
  });
}

export async function createSupportTicketMessage(threadId: string, payload: { body: string }) {
  return requestJson<{ thread: SupportThreadDetail }>(
    `/v1/support/tickets/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      body: payload,
      auth: true
    }
  );
}

export async function createPublicSupportRequest(payload: {
  name: string;
  email: string;
  category: SupportThreadCategory;
  subject: string;
  message: string;
}) {
  return requestJson<{ message: string }>("/v1/support/public-requests", {
    method: "POST",
    body: payload
  });
}

export async function getAdminSupportSummary() {
  return requestJson<AdminSupportSummary>("/v1/admin/support/summary", {
    auth: true
  });
}

export async function listAdminSupportTickets(params?: {
  limit?: number;
  offset?: number;
  status?: SupportThreadStatus;
  channel?: SupportThread["channel"];
  category?: SupportThreadCategory;
  q?: string;
  assignee?: "me" | "unassigned";
}) {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 20) });
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.status) query.set("status", params.status);
  if (params?.channel) query.set("channel", params.channel);
  if (params?.category) query.set("category", params.category);
  if (params?.q) query.set("q", params.q);
  if (params?.assignee) query.set("assignee", params.assignee);
  return requestJson<{ items: SupportThread[]; total: number; hasMore: boolean }>(
    `/v1/admin/tickets?${query.toString()}`,
    { auth: true }
  );
}

export async function getAdminSupportTicket(threadId: string) {
  return requestJson<{ thread: AdminSupportThreadDetail }>(`/v1/admin/tickets/${encodeURIComponent(threadId)}`, {
    auth: true
  });
}

export async function createAdminSupportMessage(
  threadId: string,
  payload: {
    body: string;
    deliveryChannel?: SupportMessageDeliveryChannel;
    isPublic?: boolean;
  }
) {
  return requestJson<{ thread: AdminSupportThreadDetail }>(
    `/v1/admin/tickets/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      body: payload,
      auth: true
    }
  );
}

export async function createAdminSupportNote(threadId: string, payload: { body: string }) {
  return requestJson<{ thread: AdminSupportThreadDetail }>(
    `/v1/admin/tickets/${encodeURIComponent(threadId)}/notes`,
    {
      method: "POST",
      body: payload,
      auth: true
    }
  );
}

export async function updateAdminSupportTicket(
  threadId: string,
  payload: { status?: SupportThreadStatus; assigneeUserId?: string | null }
) {
  return requestJson<{ thread: AdminSupportThreadDetail }>(
    `/v1/admin/tickets/${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      body: payload,
      auth: true
    }
  );
}

export async function linkAdminSupportTicketUser(threadId: string, payload: { userId: string }) {
  return requestJson<{ thread: AdminSupportThreadDetail }>(
    `/v1/admin/tickets/${encodeURIComponent(threadId)}/link-user`,
    {
      method: "PATCH",
      body: payload,
      auth: true
    }
  );
}

export async function listAdminUsers(params?: { limit?: number; offset?: number; q?: string }) {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 20) });
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.q) query.set("q", params.q);
  return requestJson<{ items: AdminUserListItem[]; total: number; hasMore: boolean }>(
    `/v1/admin/users?${query.toString()}`,
    { auth: true }
  );
}

export async function getAdminUser(userId: string) {
  return requestJson<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(userId)}`, {
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

export async function cancelPixPayment(paymentId: string) {
  return requestJson<{ payment: PaymentSummary }>(
    `/v1/payments/${encodeURIComponent(paymentId)}/cancel`,
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

export async function createTranscription(payload: CreateTranscriptionPayload) {
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

export async function updateOriginalTranscript(jobId: string, payload: UpdateOriginalTranscriptPayload) {
  return requestJson<{ job: TranscriptionJobDetail }>(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/transcript/original`,
    {
      method: "PUT",
      body: payload,
      auth: true
    }
  );
}

export async function regenerateTranslation(jobId: string) {
  return requestJson<{ job: TranscriptionJobDetail }>(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/translation/regenerate`,
    {
      method: "POST",
      auth: true
    }
  );
}

export async function downloadTranscriptionOutput(
  jobId: string,
  format: OutputFormat,
  variant: TranscriptVariant = "original"
) {
  const response = await requestRaw(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/download?format=${format}&variant=${variant}`,
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
    `transcricao-${jobId}-${variant}.${format}`
  );

  return {
    blob,
    fileName
  };
}

export async function getTranscriptionOutputText(
  jobId: string,
  format: OutputFormat,
  variant: TranscriptVariant = "original"
) {
  const response = await requestRaw(
    `/v1/transcriptions/${encodeURIComponent(jobId)}/download?format=${format}&variant=${variant}`,
    {
      auth: true
    }
  );

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.text();
}
