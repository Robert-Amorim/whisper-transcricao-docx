import { useEffect, useMemo, useState } from "react";
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

let mercadoPagoInitialized = false;

function ensureMercadoPagoInitialized() {
  if (!mercadoPagoPublicKey || mercadoPagoInitialized) {
    return;
  }

  initMercadoPago(mercadoPagoPublicKey, {
    locale: "pt-BR"
  });
  mercadoPagoInitialized = true;
}

export default function MercadoPagoCardTopUpForm({
  amount,
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

  const canRenderBrick = useMemo(() => {
    return Boolean(mercadoPagoPublicKey && amount && amount > 0 && payerEmail);
  }, [amount, payerEmail]);

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

  if (!payerEmail) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Carregando os dados do titular para inicializar o checkout do cartão.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-3 text-xs text-sky-100">
        O formulário abaixo é renderizado pelo Checkout Bricks oficial do Mercado Pago.
        Em homologação, use cartões de teste do painel do provedor.
      </div>

      {brickError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
          {brickError}
        </div>
      ) : null}

      {!isBrickReady ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Carregando formulário de cartão...
        </div>
      ) : null}

      <div aria-busy={!isBrickReady}>
        <CardPayment
          initialization={{
            amount,
            payer: {
              email: payerEmail
            }
          }}
          locale="pt-BR"
          customization={{
            paymentMethods: {
              minInstallments: 1,
              maxInstallments: 12,
              types: {
                included: ["credit_card"]
              }
            },
            visual: {
              hideFormTitle: true
            }
          }}
          onReady={() => {
            setIsBrickReady(true);
            setBrickError("");
          }}
          onError={(error) => {
            console.error("[voxora/web] Mercado Pago CardPayment Brick error", error);
            setBrickError("Nao foi possivel carregar o formulario de cartao.");
          }}
          onSubmit={async (
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
                email: formData.payer.email || payerEmail,
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
          }}
        />
      </div>

      {isSubmitting ? (
        <p className="text-xs text-slate-400">Enviando pagamento para o Mercado Pago...</p>
      ) : null}
    </div>
  );
}
