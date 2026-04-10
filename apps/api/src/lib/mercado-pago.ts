type MercadoPagoClientConfig = {
  accessToken: string;
  apiBaseUrl: string;
  timeoutMs: number;
};

export type MercadoPagoPixPaymentRequest = {
  amount: number;
  payerEmail: string;
  description: string;
  externalReference: string;
  idempotencyKey: string;
  expiresAt?: string;
  notificationUrl?: string;
};

export type MercadoPagoPixPaymentResponse = {
  id: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
  raw: unknown;
};

export type MercadoPagoPaymentStatusResponse = {
  id: string;
  status: string;
  statusDetail: string | null;
  raw: unknown;
};

export type MercadoPagoCardPaymentRequest = {
  amount: number;
  token: string;
  description: string;
  externalReference: string;
  idempotencyKey: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  notificationUrl?: string;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  processingMode?: string;
  paymentMethodOptionId?: string;
};

export type MercadoPagoCardPaymentResponse = {
  id: string;
  status: string;
  statusDetail: string | null;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  installments: number | null;
  issuerId: string | null;
  lastFourDigits: string | null;
  raw: unknown;
};

function normalizeApiBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function toErrorText(payload: unknown) {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    try {
      return JSON.stringify(payload);
    } catch {
      return "[unserializable-payload]";
    }
  }
  return "";
}

async function parseJsonSafe(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function createMercadoPagoClient(config: MercadoPagoClientConfig) {
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);

  async function request(path: string, options: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          ...(options.headers ?? {})
        },
        signal: controller.signal
      });

      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(
          `Mercado Pago API error (${response.status}): ${toErrorText(payload) || response.statusText}`
        );
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async createPixPayment(
      payment: MercadoPagoPixPaymentRequest
    ): Promise<MercadoPagoPixPaymentResponse> {
      const payload = await request("/v1/payments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": payment.idempotencyKey
        },
        body: JSON.stringify({
          transaction_amount: payment.amount,
          description: payment.description,
          payment_method_id: "pix",
          external_reference: payment.externalReference,
          date_of_expiration: payment.expiresAt,
          notification_url: payment.notificationUrl,
          payer: {
            email: payment.payerEmail
          }
        })
      });

      const record = payload as {
        id?: string | number;
        status?: string;
        date_of_expiration?: string;
        point_of_interaction?: {
          transaction_data?: {
            qr_code?: string;
            qr_code_base64?: string;
            ticket_url?: string;
          };
        };
      };

      const providerId =
        typeof record.id === "number" || typeof record.id === "string"
          ? String(record.id)
          : null;
      if (!providerId) {
        throw new Error("Mercado Pago create payment response missing payment id.");
      }

      return {
        id: providerId,
        status: typeof record.status === "string" ? record.status : "pending",
        qrCode: record.point_of_interaction?.transaction_data?.qr_code ?? null,
        qrCodeBase64: record.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        ticketUrl: record.point_of_interaction?.transaction_data?.ticket_url ?? null,
        expiresAt:
          typeof record.date_of_expiration === "string"
            ? record.date_of_expiration
            : null,
        raw: payload
      };
    },

    async createCardPayment(
      payment: MercadoPagoCardPaymentRequest
    ): Promise<MercadoPagoCardPaymentResponse> {
      const payload = await request("/v1/payments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": payment.idempotencyKey
        },
        body: JSON.stringify({
          transaction_amount: payment.amount,
          token: payment.token,
          description: payment.description,
          installments: payment.installments,
          payment_method_id: payment.paymentMethodId,
          issuer_id: payment.issuerId,
          external_reference: payment.externalReference,
          notification_url: payment.notificationUrl,
          processing_mode: payment.processingMode,
          payment_method_option_id: payment.paymentMethodOptionId,
          payer: {
            email: payment.payer.email,
            identification: payment.payer.identification
          }
        })
      });

      const record = payload as {
        id?: string | number;
        status?: string;
        status_detail?: string;
        payment_method_id?: string;
        payment_type_id?: string;
        installments?: number;
        issuer_id?: string | number;
        card?: {
          last_four_digits?: string;
        };
      };

      const providerId =
        typeof record.id === "number" || typeof record.id === "string"
          ? String(record.id)
          : null;
      if (!providerId) {
        throw new Error("Mercado Pago create card payment response missing payment id.");
      }

      return {
        id: providerId,
        status: typeof record.status === "string" ? record.status : "pending",
        statusDetail:
          typeof record.status_detail === "string" ? record.status_detail : null,
        paymentMethodId:
          typeof record.payment_method_id === "string"
            ? record.payment_method_id
            : null,
        paymentTypeId:
          typeof record.payment_type_id === "string" ? record.payment_type_id : null,
        installments:
          typeof record.installments === "number" ? record.installments : null,
        issuerId:
          typeof record.issuer_id === "number" || typeof record.issuer_id === "string"
            ? String(record.issuer_id)
            : null,
        lastFourDigits: record.card?.last_four_digits ?? null,
        raw: payload
      };
    },

    async getPaymentStatus(paymentId: string): Promise<MercadoPagoPaymentStatusResponse> {
      const payload = await request(`/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: "GET"
      });

      const record = payload as {
        id?: string | number;
        status?: string;
        status_detail?: string;
      };
      const providerId =
        typeof record.id === "number" || typeof record.id === "string"
          ? String(record.id)
          : paymentId;

      return {
        id: providerId,
        status: typeof record.status === "string" ? record.status : "pending",
        statusDetail:
          typeof record.status_detail === "string" ? record.status_detail : null,
        raw: payload
      };
    },

    async cancelPayment(
      paymentId: string,
      idempotencyKey: string
    ): Promise<MercadoPagoPaymentStatusResponse> {
      const payload = await request(`/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          status: "cancelled"
        })
      });

      const record = payload as {
        id?: string | number;
        status?: string;
        status_detail?: string;
      };
      const providerId =
        typeof record.id === "number" || typeof record.id === "string"
          ? String(record.id)
          : paymentId;

      return {
        id: providerId,
        status: typeof record.status === "string" ? record.status : "pending",
        statusDetail:
          typeof record.status_detail === "string" ? record.status_detail : null,
        raw: payload
      };
    }
  };
}
