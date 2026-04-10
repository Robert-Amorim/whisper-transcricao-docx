import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";

type CardPaymentBrickFormData = {
  token: string;
  issuer_id: string;
  payment_method_id: string;
  transaction_amount: number;
  installments: number;
  payer: {
    email?: string;
    identification?: {
      type?: string;
      number?: string;
    };
  };
  payment_method_option_id?: string;
  processing_mode?: string;
};

type CardPaymentAdditionalData = {
  lastFourDigits: string;
  cardholderName?: string;
  paymentTypeId?: string;
};

type MercadoPagoCardTopUpFormProps = {
  amount: number | null;
  minimumAmount: number;
  payerEmail: string | null;
  isSubmitting: boolean;
  onSubmit: (payload: {
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
};

const mercadoPagoPublicKey = (
  import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? ""
).trim();
const brickContainerId = "voxora-card-payment-brick";

let mercadoPagoInitialized = false;

function formatAmountLabel(amount: number | null) {
  if (!amount || amount <= 0) {
    return "--";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(amount);
}

function ensureMercadoPagoInitialized() {
  if (!mercadoPagoPublicKey || mercadoPagoInitialized) {
    return;
  }

  initMercadoPago(mercadoPagoPublicKey, {
    locale: "pt-BR"
  });
  mercadoPagoInitialized = true;
}

function normalizeBrickSelects(root: ParentNode | null) {
  if (!root) {
    return;
  }

  root.querySelectorAll("select").forEach((element) => {
    const select = element as HTMLSelectElement;
    select.style.setProperty("appearance", "none", "important");
    select.style.setProperty("-webkit-appearance", "none", "important");
    select.style.setProperty("-moz-appearance", "none", "important");
    select.style.setProperty("background-image", "none", "important");
    select.style.setProperty("padding-right", "2rem", "important");
  });
}

function MercadoPagoCardTopUpForm({
  amount,
  minimumAmount,
  payerEmail,
  isSubmitting,
  onSubmit
}: MercadoPagoCardTopUpFormProps) {
  const [isBrickReady, setIsBrickReady] = useState(false);
  const [brickError, setBrickError] = useState("");

  useEffect(() => {
    ensureMercadoPagoInitialized();
  }, []);

  useEffect(() => {
    setBrickError("");
  }, [amount, payerEmail]);

  useEffect(() => {
    if (!isBrickReady) {
      return;
    }

    const container = document.getElementById(brickContainerId);
    if (!container) {
      return;
    }

    const applySelectFixes = () => {
      normalizeBrickSelects(container);
    };

    applySelectFixes();

    const observer = new MutationObserver(() => {
      applySelectFixes();
    });

    observer.observe(container, {
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
    };
  }, [isBrickReady]);

  const canRenderBrick = useMemo(() => {
    return Boolean(
      mercadoPagoPublicKey && amount && amount >= minimumAmount && payerEmail
    );
  }, [amount, minimumAmount, payerEmail]);
  const amountLabel = useMemo(() => formatAmountLabel(amount), [amount]);
  const minimumAmountLabel = useMemo(
    () => formatAmountLabel(minimumAmount),
    [minimumAmount]
  );

  const initialization = useMemo(
    () => ({
      amount: amount ?? 0,
      payer: {
        email: payerEmail ?? ""
      }
    }),
    [amount, payerEmail]
  );

  const customization = useMemo(
    () => ({
      paymentMethods: {
        minInstallments: 1,
        maxInstallments: 12,
        types: {
          included: ["credit_card" as const]
        }
      },
      visual: {
        hideFormTitle: true,
        style: {
          theme: "bootstrap" as const
        }
      }
    }),
    []
  );

  const handleReady = useCallback(() => {
    setIsBrickReady(true);
    setBrickError("");
  }, []);

  const handleError = useCallback((error: unknown) => {
    console.error("[voxora/web] Mercado Pago CardPayment Brick error", error);
    setBrickError("Nao foi possivel carregar o formulario de cartao.");
  }, []);

  const handleSubmit = useCallback(
    async (
      formData: CardPaymentBrickFormData,
      additionalData?: CardPaymentAdditionalData
    ) => {
      await onSubmit({
        amount: formData.transaction_amount,
        token: formData.token,
        issuerId: formData.issuer_id || undefined,
        paymentMethodId: formData.payment_method_id,
        paymentMethodOptionId: formData.payment_method_option_id,
        processingMode: formData.processing_mode,
        installments: formData.installments,
        payer: {
          email: formData.payer.email || payerEmail || "",
          identification:
            formData.payer.identification?.type &&
            formData.payer.identification?.number
              ? {
                  type: formData.payer.identification.type,
                  number: formData.payer.identification.number
                }
              : undefined
        },
        cardholderName: additionalData?.cardholderName,
        paymentTypeId: additionalData?.paymentTypeId,
        lastFourDigits: additionalData?.lastFourDigits
      });
    },
    [onSubmit, payerEmail]
  );

  if (!mercadoPagoPublicKey) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
        A chave pública do Mercado Pago ainda não foi configurada no frontend. Adicione
        {" "}
        <code className="rounded bg-slate-900/60 px-1 py-0.5">VITE_MERCADO_PAGO_PUBLIC_KEY</code>
        {" "}
        para habilitar o cartão.
      </div>
    );
  }

  if (!amount || amount <= 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Informe um valor válido para carregar o formulário de cartão.
      </div>
    );
  }

  if (amount < minimumAmount) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-4 text-sm text-amber-200">
        O valor minimo para pagamento com cartao e {minimumAmountLabel}.
      </div>
    );
  }

  if (!payerEmail) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Carregando os dados do titular para inicializar o checkout do cartão.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/70 px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Checkout com cartao
          </p>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <span className="material-symbols-outlined text-[14px]">verified_user</span>
            Mercado Pago oficial
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Valor</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">{amountLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Titular</p>
            <p className="mt-1 truncate font-body text-sm text-slate-700 dark:text-slate-200">{payerEmail}</p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Formulario oficial do Checkout Bricks, com layout no padrao do Mercado Pago para uma experiencia mais confiavel e familiar.
        </p>

        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Em homologacao, use cartoes de teste no painel do provedor.
        </p>
      </div>

      {!isBrickReady ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Carregando formulário de cartão...
        </div>
      ) : null}

      {brickError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
          {brickError}
        </div>
      ) : null}

      <div
        aria-busy={!canRenderBrick || !isBrickReady}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-100"
      >
        <CardPayment
          id={brickContainerId}
          initialization={initialization}
          locale="pt-BR"
          customization={customization}
          onReady={handleReady}
          onError={handleError}
          onSubmit={handleSubmit}
        />
      </div>

      {isSubmitting ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-300">
          <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
          Enviando pagamento para o Mercado Pago...
        </p>
      ) : null}
    </div>
  );
}

export default memo(MercadoPagoCardTopUpForm);
