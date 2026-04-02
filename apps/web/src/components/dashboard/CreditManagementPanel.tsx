import { useEffect, useMemo, useState } from "react";
import MercadoPagoCardTopUpForm from "./MercadoPagoCardTopUpForm";
import { formatCurrency, formatDateTime } from "../../lib/transcriptions";
import type { PaymentSummary, PixPaymentResponse } from "../../lib/types";

type CreditManagementPanelProps = {
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  onCreatePixPayment: () => void;
  onCreateCardPayment: (payload: {
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
  }) => Promise<void>;
  payerEmail: string | null;
  isCreatingPayment: boolean;
  isCreatingCardPayment: boolean;
  isRefreshingData: boolean;
  activePix: PixPaymentResponse | null;
  onConfirmMockPayment: () => void;
  isConfirmingMockPayment: boolean;
  payments: PaymentSummary[];
  feedbackMessage: string;
  feedbackTone: "neutral" | "success" | "error";
  onSelectedMethodChange: (method: TopUpMethod) => void;
};

type TopUpMethod = "pix" | "credit_card";


function getStatusLabel(status: PaymentSummary["status"]) {
  switch (status) {
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Recusado";
    case "expired":
      return "Expirado";
    case "pending":
    default:
      return "Pendente";
  }
}

function getStatusClassName(status: PaymentSummary["status"]) {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    case "expired":
      return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
    case "pending":
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  }
}

function getFeedbackClassName(tone: CreditManagementPanelProps["feedbackTone"]) {
  if (tone === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (tone === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300";
}

function getPaymentMethodLabel(method: PaymentSummary["method"]) {
  return method === "credit_card" ? "Cartao" : "PIX";
}

function getStatusGuidance(payment: PaymentSummary, nowMs: number) {
  if (payment.status === "approved") {
    return "Recarga concluida. Os créditos já devem estar disponíveis na carteira.";
  }

  if (payment.status === "rejected") {
    return (
      payment.statusDetail ??
      "O provedor recusou o pagamento. Revise os dados e tente novamente."
    );
  }

  if (payment.status === "expired") {
    return payment.method === "pix"
      ? "O prazo do QR Code terminou. Gere um novo PIX para continuar."
      : "A tentativa expirou antes da confirmação do provedor.";
  }

  if (payment.method === "pix") {
    if (payment.expiresAt) {
      return `Aguardando pagamento. Restante: ${formatRemainingTime(payment.expiresAt, nowMs)}.`;
    }
    return "PIX gerado e aguardando pagamento.";
  }

  return (
    payment.statusDetail ??
    "Pagamento enviado. Estamos aguardando a resposta final do Mercado Pago."
  );
}

function formatRemainingTime(expiresAt: string, nowMs: number) {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return "Prazo indisponivel";
  }

  const deltaMs = expiresAtMs - nowMs;
  if (deltaMs <= 0) {
    return "Expirado";
  }

  const totalSeconds = Math.floor(deltaMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes.toString().padStart(2, "0")}m ${seconds
    .toString()
    .padStart(2, "0")}s`;
}

export default function CreditManagementPanel({
  amountInput,
  onAmountInputChange,
  onCreatePixPayment,
  onCreateCardPayment,
  payerEmail,
  isCreatingPayment,
  isCreatingCardPayment,
  isRefreshingData,
  activePix,
  onConfirmMockPayment,
  isConfirmingMockPayment,
  payments,
  feedbackMessage,
  feedbackTone,
  onSelectedMethodChange
}: CreditManagementPanelProps) {
  const [selectedMethod, setSelectedMethod] = useState<TopUpMethod>("pix");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!activePix && payments.every((payment) => !payment.expiresAt)) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activePix, payments]);

  useEffect(() => {
    const preferredPaymentId = activePix?.payment.id ?? payments[0]?.id ?? null;
    if (!preferredPaymentId) {
      setSelectedPaymentId(null);
      return;
    }

    if (!selectedPaymentId || !payments.some((payment) => payment.id === selectedPaymentId)) {
      setSelectedPaymentId(preferredPaymentId);
    }
  }, [activePix?.payment.id, payments, selectedPaymentId]);

  useEffect(() => {
    onSelectedMethodChange(selectedMethod);
  }, [onSelectedMethodChange, selectedMethod]);

  const parsedAmount = useMemo(() => {
    const parsed = Number.parseFloat(amountInput.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [amountInput]);

  const activePixRemaining = useMemo(() => {
    if (!activePix?.pix.expiresAt) {
      return null;
    }
    return formatRemainingTime(activePix.pix.expiresAt, nowMs);
  }, [activePix, nowMs]);

  const selectedPayment = useMemo(() => {
    if (!selectedPaymentId) {
      return payments[0] ?? null;
    }
    return payments.find((payment) => payment.id === selectedPaymentId) ?? payments[0] ?? null;
  }, [payments, selectedPaymentId]);

  return (
    <section
      id="creditos"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-bold">Gerenciamento de créditos</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gere PIX com prazo de pagamento ou recarregue com cartão de crédito.
          </p>
        </div>
        {isRefreshingData ? (
          <span className="text-xs text-slate-400">Atualizando...</span>
        ) : null}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Valor da recarga (BRL)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            step="0.01"
            value={amountInput}
            onChange={(event) => onAmountInputChange(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800"
            placeholder="Ex.: 20.00"
          />
          <button
            type="button"
            disabled={selectedMethod !== "pix" || isCreatingPayment}
            onClick={onCreatePixPayment}
            className="min-h-0 rounded-lg bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {isCreatingPayment ? "Gerando..." : "Gerar PIX"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={() => setSelectedMethod("pix")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            selectedMethod === "pix"
              ? "bg-white text-primary shadow-sm dark:bg-slate-900"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          PIX
        </button>
        <button
          type="button"
          onClick={() => setSelectedMethod("credit_card")}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            selectedMethod === "credit_card"
              ? "bg-white text-primary shadow-sm dark:bg-slate-900"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Cartão de crédito
        </button>
      </div>

      {feedbackMessage ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${getFeedbackClassName(feedbackTone)}`}>
          {feedbackMessage}
        </p>
      ) : null}

      {selectedPayment ? (
        <article className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Status detalhado da recarga</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {getPaymentMethodLabel(selectedPayment.method)}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClassName(selectedPayment.status)}`}
            >
              {getStatusLabel(selectedPayment.status)}
            </span>
          </div>

          <div className="grid gap-3 text-xs text-slate-500 dark:text-slate-400 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Resumo</p>
              <p className="mt-2">{formatCurrency(selectedPayment.amount)}</p>
              <p>Criado em {formatDateTime(selectedPayment.createdAt)}</p>
              {selectedPayment.expiresAt ? (
                <p>Expira em {formatDateTime(selectedPayment.expiresAt)}</p>
              ) : null}
              {selectedPayment.card?.lastFourDigits ? (
                <p>
                  Cartão final {selectedPayment.card.lastFourDigits}
                  {selectedPayment.card.installments
                    ? ` • ${selectedPayment.card.installments}x`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Próximo passo</p>
              <p className="mt-2">{getStatusGuidance(selectedPayment, nowMs)}</p>
            </div>
          </div>
        </article>
      ) : null}

      {selectedMethod === "pix" ? (
        activePix ? (
          <article className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-primary">PIX pronto para pagamento</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Prazo restante:{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {activePixRemaining ?? "Calculando..."}
                  </span>
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClassName(activePix.payment.status)}`}
              >
                {getStatusLabel(activePix.payment.status)}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Copia e cola:{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 break-all dark:bg-slate-800">
                {activePix.pix.copyPasteCode}
              </code>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Valido ate: {formatDateTime(activePix.pix.expiresAt)}
            </p>
            {activePix.pix.ticketUrl ? (
              <a
                href={activePix.pix.ticketUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-xs font-semibold text-primary underline"
              >
                Abrir comprovante PIX
              </a>
            ) : null}
            {activePix.pix.qrCodeBase64 ? (
              <div className="mt-2 flex justify-center rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <img
                  alt="QR Code PIX"
                  src={`data:image/png;base64,${activePix.pix.qrCodeBase64}`}
                  className="h-40 w-40"
                />
              </div>
            ) : null}
          </article>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Gere um PIX para liberar o QR Code com prazo de pagamento.
          </div>
        )
      ) : (
        <div className="space-y-3">
          <MercadoPagoCardTopUpForm
            amount={parsedAmount}
            payerEmail={payerEmail}
            isSubmitting={isCreatingCardPayment}
            onSubmit={onCreateCardPayment}
          />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-semibold">Últimos pagamentos</h5>
        </div>

        {payments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700">
            Ainda não há pagamentos registrados.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <button
                type="button"
                key={payment.id}
                onClick={() => setSelectedPaymentId(payment.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition dark:border-slate-800 ${
                  selectedPayment?.id === payment.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {formatCurrency(payment.amount)}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        {getPaymentMethodLabel(payment.method)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {formatDateTime(payment.createdAt)}
                    </p>
                    {payment.method === "credit_card" && payment.card?.lastFourDigits ? (
                      <p className="truncate text-[11px] text-slate-500">
                        Final {payment.card.lastFourDigits}
                        {payment.card.paymentMethodId
                          ? ` • ${payment.card.paymentMethodId.toUpperCase()}`
                          : ""}
                        {payment.card.installments ? ` • ${payment.card.installments}x` : ""}
                      </p>
                    ) : null}
                    {payment.method === "pix" && payment.expiresAt ? (
                      <p className="truncate text-[11px] text-slate-500">
                        Prazo: {formatDateTime(payment.expiresAt)}
                      </p>
                    ) : null}
                    {payment.statusDetail ? (
                      <p className="truncate text-[11px] text-slate-500">{payment.statusDetail}</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClassName(payment.status)}`}
                  >
                    {getStatusLabel(payment.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
