import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreditManagementPanel from "../components/dashboard/CreditManagementPanel";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import LedgerPanel from "../components/dashboard/LedgerPanel";
import {
  ApiError,
  confirmPixPayment,
  createCardPayment,
  createPixPayment,
  getErrorMessage,
  getMe,
  getWallet,
  listPayments,
  listWalletLedger
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { formatCurrency } from "../lib/transcriptions";
import type {
  PaymentSummary,
  PixPaymentResponse,
  PublicUser,
  WalletLedgerEntry,
  WalletSummary
} from "../lib/types";

type LoadState = "loading" | "ready" | "error";
type FeedbackTone = "neutral" | "success" | "error";
type TopUpMethod = "pix" | "credit_card";

const LEDGER_PAGE_SIZE = 10;

export default function CarteiraPage() {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerHasMore, setLedgerHasMore] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [activePixPayment, setActivePixPayment] = useState<PixPaymentResponse | null>(null);
  const [topUpAmountInput, setTopUpAmountInput] = useState("20");
  const [selectedTopUpMethod, setSelectedTopUpMethod] = useState<TopUpMethod>("pix");
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isCreatingCardPayment, setIsCreatingCardPayment] = useState(false);
  const [isConfirmingMockPayment, setIsConfirmingMockPayment] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPendingPayments = useMemo(
    () => payments.some((p) => p.status === "pending"),
    [payments]
  );

  const syncPaymentsState = useCallback((items: PaymentSummary[]) => {
    setPayments(items);
    const latestPix = items.find(
      (p) => p.method === "pix" && p.status === "pending" && p.pix
    );
    setActivePixPayment(
      latestPix
        ? {
            payment: latestPix,
            pix: {
              providerMode: latestPix.providerMode ?? "mercado_pago",
              copyPasteCode: latestPix.pix?.copyPasteCode ?? "",
              expiresAt: latestPix.expiresAt ?? latestPix.createdAt,
              qrCodeBase64: latestPix.pix?.qrCodeBase64 ?? null,
              ticketUrl: latestPix.pix?.ticketUrl ?? null
            }
          }
        : null
    );
  }, []);

  const setFeedback = useCallback((tone: FeedbackTone, message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedbackTone(tone);
    setFeedbackMessage(message);
    if (tone !== "neutral") {
      feedbackTimer.current = setTimeout(() => setFeedbackMessage(""), 6000);
    }
  }, []);

  const loadPage = useCallback(
    async (options?: { isRefresh?: boolean; ledgerPageOverride?: number }) => {
      if (!options?.isRefresh) setLoadState("loading");
      else setIsRefreshingData(true);
      setLoadError("");

      const ledgerPageNum = options?.ledgerPageOverride ?? ledgerPage;

      try {
        const [currentUser, currentWallet, currentLedger, currentPayments] = await Promise.all([
          getMe(),
          getWallet(),
          listWalletLedger({ limit: LEDGER_PAGE_SIZE, offset: ledgerPageNum * LEDGER_PAGE_SIZE }),
          listPayments({ limit: 6 })
        ]);

        setUser(currentUser);
        setWallet(currentWallet);
        setLedger(currentLedger.items);
        setLedgerTotal(currentLedger.total ?? 0);
        setLedgerHasMore(currentLedger.hasMore ?? false);
        syncPaymentsState(currentPayments.items);
        setLoadState("ready");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setLoadError(getErrorMessage(error, "Não foi possível carregar a carteira."));
        setLoadState("error");
      } finally {
        setIsRefreshingData(false);
      }
    },
    [navigate, ledgerPage, syncPaymentsState]
  );

  const refreshPaymentStatus = useCallback(async () => {
    try {
      const currentPayments = await listPayments({ limit: 6 });
      const previousPendingIds = new Set(
        payments.filter((p) => p.status === "pending").map((p) => p.id)
      );
      syncPaymentsState(currentPayments.items);

      const resolved = currentPayments.items.filter(
        (p) => previousPendingIds.has(p.id) && p.status !== "pending"
      );
      if (!resolved.some((p) => p.status === "approved")) return;

      const [currentWallet, currentLedger] = await Promise.all([
        getWallet(),
        listWalletLedger({ limit: LEDGER_PAGE_SIZE, offset: ledgerPage * LEDGER_PAGE_SIZE })
      ]);
      setWallet(currentWallet);
      setLedger(currentLedger.items);
      setLedgerTotal(currentLedger.total ?? 0);
      setLedgerHasMore(currentLedger.hasMore ?? false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
      }
    }
  }, [ledgerPage, navigate, payments, syncPaymentsState]);

  const handleLedgerPageChange = useCallback(
    (page: number) => {
      setLedgerPage(page);
      void loadPage({ isRefresh: true, ledgerPageOverride: page });
    },
    [loadPage]
  );

  const handleCreatePixPayment = useCallback(async () => {
    const parsed = Number.parseFloat(topUpAmountInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFeedback("error", "Informe um valor de recarga válido.");
      return;
    }
    setIsCreatingPayment(true);
    setFeedback("neutral", "Gerando cobrança PIX...");
    try {
      const created = await createPixPayment({ amount: parsed });
      setActivePixPayment(created);
      setFeedback("success", "PIX gerado com sucesso. Conclua o pagamento para liberar os créditos.");
      await loadPage({ isRefresh: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setFeedback("error", getErrorMessage(error, "Falha ao gerar pagamento PIX."));
    } finally {
      setIsCreatingPayment(false);
    }
  }, [loadPage, navigate, setFeedback, topUpAmountInput]);

  const handleCreateCardPayment = useCallback(
    async (payload: {
      amount: number;
      token: string;
      issuerId?: string;
      paymentMethodId: string;
      paymentMethodOptionId?: string;
      processingMode?: string;
      installments: number;
      payer: { email: string; identification?: { type: string; number: string } };
      cardholderName?: string;
      paymentTypeId?: string;
      lastFourDigits?: string;
    }) => {
      setIsCreatingCardPayment(true);
      setFeedback("neutral", "Processando pagamento com cartão...");
      try {
        const created = await createCardPayment(payload);
        const status = created.payment.status;
        if (status === "approved") {
          setFeedback("success", "Pagamento aprovado. Os créditos já foram adicionados na sua carteira.");
        } else if (status === "pending") {
          setFeedback("neutral", "Pagamento enviado. Vamos acompanhar a confirmação automaticamente.");
        } else if (status === "rejected") {
          setFeedback("error", created.payment.statusDetail || "O pagamento com cartão foi recusado. Revise os dados e tente novamente.");
        } else {
          setFeedback("error", "O pagamento com cartão expirou antes da confirmação. Tente novamente.");
        }
        await loadPage({ isRefresh: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setFeedback("error", getErrorMessage(error, "Falha ao processar pagamento com cartão."));
      } finally {
        setIsCreatingCardPayment(false);
      }
    },
    [loadPage, navigate, setFeedback]
  );

  const handleConfirmMockPayment = useCallback(async () => {
    const paymentId = activePixPayment?.payment.id;
    if (!paymentId) return;
    setIsConfirmingMockPayment(true);
    setFeedback("neutral", "Confirmando pagamento...");
    try {
      await confirmPixPayment(paymentId);
      setFeedback("success", "Pagamento confirmado e créditos adicionados na carteira.");
      setActivePixPayment(null);
      await loadPage({ isRefresh: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setFeedback("error", getErrorMessage(error, "Não foi possível confirmar o pagamento."));
    } finally {
      setIsConfirmingMockPayment(false);
    }
  }, [activePixPayment?.payment.id, loadPage, navigate, setFeedback]);

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void loadPage();
  }, [loadPage, navigate]);

  useEffect(() => {
    if (!hasPendingPayments || selectedTopUpMethod === "credit_card") return;
    const timer = setInterval(() => void refreshPaymentStatus(), 5000);
    return () => clearInterval(timer);
  }, [hasPendingPayments, refreshPaymentStatus, selectedTopUpMethod]);

  const availableBalance = wallet ? formatCurrency(wallet.availableBalance) : "--";

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
        <DashboardSidebar user={user} activeMenu="wallet" />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 dark:border-slate-800 dark:bg-background-dark/50">
            <h2 className="font-display text-xl font-bold tracking-tight">Carteira</h2>
            {loadState === "ready" && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-1.5 dark:border-slate-700">
                <span className="material-symbols-outlined text-[16px] text-primary">account_balance_wallet</span>
                <span className="font-mono text-sm font-bold">{availableBalance}</span>
                <span className="font-body text-xs text-slate-500">disponível</span>
              </div>
            )}
          </header>

          {loadState === "loading" && (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-body text-sm text-slate-500">Carregando...</p>
            </div>
          )}

          {loadState === "error" && (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-body text-sm text-red-500">{loadError}</p>
            </div>
          )}

          {loadState === "ready" && (
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-7">
                  <LedgerPanel
                    ledger={ledger}
                    total={ledgerTotal}
                    hasMore={ledgerHasMore}
                    currentPage={ledgerPage}
                    onPageChange={handleLedgerPageChange}
                    pageSize={LEDGER_PAGE_SIZE}
                  />
                </div>
                <div className="col-span-5" id="creditos">
                  <CreditManagementPanel
                    amountInput={topUpAmountInput}
                    onAmountInputChange={setTopUpAmountInput}
                    onCreatePixPayment={handleCreatePixPayment}
                    onCreateCardPayment={handleCreateCardPayment}
                    payerEmail={user?.email ?? null}
                    isCreatingPayment={isCreatingPayment}
                    isCreatingCardPayment={isCreatingCardPayment}
                    isRefreshingData={isRefreshingData}
                    activePix={activePixPayment}
                    onConfirmMockPayment={handleConfirmMockPayment}
                    isConfirmingMockPayment={isConfirmingMockPayment}
                    payments={payments}
                    feedbackMessage={feedbackMessage}
                    feedbackTone={feedbackTone}
                    onSelectedMethodChange={setSelectedTopUpMethod}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
