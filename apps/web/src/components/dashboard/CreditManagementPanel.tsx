import { formatCurrency, formatDateTime } from "../../lib/transcriptions";
import type { PaymentSummary, PixPaymentResponse } from "../../lib/types";

type CreditManagementPanelProps = {
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  onCreatePixPayment: () => void;
  isCreatingPayment: boolean;
  isRefreshingData: boolean;
  activePix: PixPaymentResponse | null;
  onConfirmMockPayment: () => void;
  isConfirmingMockPayment: boolean;
  payments: PaymentSummary[];
  feedbackMessage: string;
  feedbackTone: "neutral" | "success" | "error";
};

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
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-clarity-border dark:bg-clarity-surface/40 dark:text-slate-300";
}

export default function CreditManagementPanel({
  amountInput,
  onAmountInputChange,
  onCreatePixPayment,
  isCreatingPayment,
  isRefreshingData,
  activePix,
  onConfirmMockPayment,
  isConfirmingMockPayment,
  payments,
  feedbackMessage,
  feedbackTone
}: CreditManagementPanelProps) {
  return (
    <section
      id="creditos"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-clarity-border dark:bg-clarity-surface"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-bold">Gerenciamento de créditos</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gere PIX para recarga e acompanhe o status dos pagamentos.
          </p>
        </div>
        {isRefreshingData ? (
          <span className="text-xs text-slate-400">Atualizando...</span>
        ) : null}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-clarity-border">
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
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-clarity-border dark:bg-clarity-surface"
            placeholder="Ex.: 20.00"
          />
          <button
            type="button"
            disabled={isCreatingPayment}
            onClick={onCreatePixPayment}
            className="min-h-0 rounded-lg bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {isCreatingPayment ? "Gerando..." : "Gerar PIX"}
          </button>
        </div>
      </div>

      {feedbackMessage ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${getFeedbackClassName(feedbackTone)}`}>
          {feedbackMessage}
        </p>
      ) : null}

      {activePix ? (
        <article className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-primary">PIX pronto para pagamento</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Copia e cola: <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-clarity-surface-strong">{activePix.pix.copyPasteCode}</code>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Expira em: {formatDateTime(activePix.pix.expiresAt)}
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
            <div className="mt-2 flex justify-center rounded-lg border border-slate-200 bg-white p-3 dark:border-clarity-border dark:bg-clarity-canvas">
              <img
                alt="QR Code PIX"
                src={`data:image/png;base64,${activePix.pix.qrCodeBase64}`}
                className="h-40 w-40"
              />
            </div>
          ) : null}
          {activePix.pix.providerMode === "mock" ? (
            <button
              type="button"
              onClick={onConfirmMockPayment}
              disabled={isConfirmingMockPayment}
              className="min-h-0 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-60"
            >
              {isConfirmingMockPayment ? "Confirmando..." : "Confirmar pagamento (modo mock)"}
            </button>
          ) : null}
        </article>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-semibold">Últimos pagamentos</h5>
          <span className="text-[10px] font-mono text-slate-400">GET /v1/payments</span>
        </div>

        {payments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-clarity-border">
            Ainda não há pagamentos registrados.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{formatCurrency(payment.amount)}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {formatDateTime(payment.createdAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClassName(payment.status)}`}
                >
                  {getStatusLabel(payment.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
