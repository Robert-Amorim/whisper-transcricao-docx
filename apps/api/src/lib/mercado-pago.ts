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

    async getPaymentStatus(paymentId: string): Promise<MercadoPagoPaymentStatusResponse> {
      const payload = await request(`/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: "GET"
      });

      const record = payload as {
        id?: string | number;
        status?: string;
      };
      const providerId =
        typeof record.id === "number" || typeof record.id === "string"
          ? String(record.id)
          : paymentId;

      return {
        id: providerId,
        status: typeof record.status === "string" ? record.status : "pending",
        raw: payload
      };
    }
  };
}
