import { useCallback, useEffect, useMemo, useState } from "react";
import CreditManagementPanel from "../components/dashboard/CreditManagementPanel";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import DashboardStatsGrid from "../components/dashboard/DashboardStatsGrid";
import DashboardTopbar from "../components/dashboard/DashboardTopbar";
import JobsTable from "../components/dashboard/JobsTable";
import LedgerPanel from "../components/dashboard/LedgerPanel";
import OptimizationTip from "../components/dashboard/OptimizationTip";
import {
  ApiError,
  confirmPixPayment,
  createPixPayment,
  getErrorMessage,
  getMe,
  listPayments,
  reprocessTranscription,
  getWallet,
  listTranscriptions,
  listWalletLedger
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { PROCESSING_STATUSES } from "../lib/transcriptions";
import {
  type PaymentSummary,
  type PixPaymentResponse,
  type PublicUser,
  type TranscriptionJob,
  type WalletLedgerEntry,
  type WalletSummary
} from "../lib/types";
import { useNavigate } from "react-router-dom";

type LoadState = "loading" | "ready" | "error";
type FeedbackTone = "neutral" | "success" | "error";

export default function DashboardPage() {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [topUpAmountInput, setTopUpAmountInput] = useState("20");
  const [paymentFeedbackMessage, setPaymentFeedbackMessage] = useState("");
  const [paymentFeedbackTone, setPaymentFeedbackTone] = useState<FeedbackTone>("neutral");
  const [activePixPayment, setActivePixPayment] = useState<PixPaymentResponse | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isConfirmingMockPayment, setIsConfirmingMockPayment] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [jobsFeedbackMessage, setJobsFeedbackMessage] = useState("");
  const [jobsFeedbackTone, setJobsFeedbackTone] = useState<FeedbackTone>("neutral");
  const [retryingJobIds, setRetryingJobIds] = useState<string[]>([]);

  const JOBS_PAGE_SIZE = 20;
  const LEDGER_PAGE_SIZE = 8;
  const [jobsPage, setJobsPage] = useState(0);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsHasMore, setJobsHasMore] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerHasMore, setLedgerHasMore] = useState(false);

  const hasProcessingJobs = useMemo(
    () => jobs.some((job) => PROCESSING_STATUSES.includes(job.status)),
    [jobs]
  );

  const visibleJobs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return jobs;
    }

    return jobs.filter((job) => {
      const source = job.sourceObjectKey.toLowerCase();
      const id = job.id.toLowerCase();
      const language = job.language.toLowerCase();
      return (
        source.includes(normalizedSearch) ||
        id.includes(normalizedSearch) ||
        language.includes(normalizedSearch)
      );
    });
  }, [jobs, searchTerm]);

  const walletUsagePercent = useMemo(() => {
    if (!wallet) {
      return 0;
    }
    const available = Number(wallet.availableBalance);
    const held = Number(wallet.heldBalance);
    const total = available + held;
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((available / total) * 100)));
  }, [wallet]);

  const todayUsageSeconds = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    return jobs.reduce((acc, job) => {
      if (job.durationSeconds === null) {
        return acc;
      }
      const createdAt = new Date(job.createdAt);
      if (
        createdAt.getFullYear() === y &&
        createdAt.getMonth() === m &&
        createdAt.getDate() === d
      ) {
        return acc + Number(job.durationSeconds);
      }
      return acc;
    }, 0);
  }, [jobs]);

  const latestCreditEntry = useMemo(() => {
    const credits = ledger.filter((entry) => entry.type === "credit");
    if (credits.length === 0) {
      return null;
    }
    return [...credits].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, [ledger]);

  const focusCreditsPanel = useCallback(() => {
    const target = document.getElementById("creditos");
    if (!target) {
      return;
    }
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, []);

  const loadDashboard = useCallback(
    async (options?: { isRefresh?: boolean; jobsPageOverride?: number; ledgerPageOverride?: number }) => {
      if (!options?.isRefresh) {
        setLoadState("loading");
      } else {
        setIsRefreshingData(true);
      }
      setLoadError("");

      const currentJobsPage = options?.jobsPageOverride ?? jobsPage;
      const currentLedgerPage = options?.ledgerPageOverride ?? ledgerPage;

      try {
        const [currentUser, currentWallet, currentJobs, currentLedger, currentPayments] =
          await Promise.all([
          getMe(),
          getWallet(),
          listTranscriptions({ limit: JOBS_PAGE_SIZE, offset: currentJobsPage * JOBS_PAGE_SIZE }),
          listWalletLedger({ limit: LEDGER_PAGE_SIZE, offset: currentLedgerPage * LEDGER_PAGE_SIZE }),
          listPayments({ limit: 20 })
        ]);

        setUser(currentUser);
        setWallet(currentWallet);
        setJobs(currentJobs.items);
        setJobsTotal(currentJobs.total ?? 0);
        setJobsHasMore(currentJobs.hasMore ?? false);
        setLedger(currentLedger.items);
        setLedgerTotal(currentLedger.total ?? 0);
        setLedgerHasMore(currentLedger.hasMore ?? false);
        setPayments(currentPayments.items);
        setLoadState("ready");

        const welcomeCredit = window.sessionStorage.getItem("voxora_welcome_credit");
        if (welcomeCredit) {
          setPaymentFeedbackTone("success");
          setPaymentFeedbackMessage(
            `Conta criada com sucesso. Crédito inicial liberado: R$ ${Number(
              welcomeCredit
            ).toFixed(2)}.`
          );
          window.sessionStorage.removeItem("voxora_welcome_credit");
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }

        setLoadError(getErrorMessage(error, "Nao foi possivel carregar o dashboard."));
        setLoadState("error");
      } finally {
        setIsRefreshingData(false);
      }
    },
    [navigate, jobsPage, ledgerPage]
  );

  const handleJobsPageChange = useCallback((page: number) => {
    setJobsPage(page);
    void loadDashboard({ isRefresh: true, jobsPageOverride: page });
  }, [loadDashboard]);

  const handleLedgerPageChange = useCallback((page: number) => {
    setLedgerPage(page);
    void loadDashboard({ isRefresh: true, ledgerPageOverride: page });
  }, [loadDashboard]);

  const handleCreatePixPayment = useCallback(async () => {
    const parsed = Number.parseFloat(topUpAmountInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPaymentFeedbackTone("error");
      setPaymentFeedbackMessage("Informe um valor de recarga válido.");
      return;
    }

    setIsCreatingPayment(true);
    setPaymentFeedbackTone("neutral");
    setPaymentFeedbackMessage("Gerando cobrança PIX...");

    try {
      const created = await createPixPayment({
        amount: parsed
      });
      setActivePixPayment(created);
      setPaymentFeedbackTone("success");
      setPaymentFeedbackMessage(
        "PIX gerado com sucesso. Conclua o pagamento para liberar os créditos."
      );
      await loadDashboard({ isRefresh: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setPaymentFeedbackTone("error");
      setPaymentFeedbackMessage(getErrorMessage(error, "Falha ao gerar pagamento PIX."));
    } finally {
      setIsCreatingPayment(false);
    }
  }, [loadDashboard, navigate, topUpAmountInput]);

  const handleConfirmMockPayment = useCallback(async () => {
    const paymentId = activePixPayment?.payment.id;
    if (!paymentId) {
      return;
    }

    setIsConfirmingMockPayment(true);
    setPaymentFeedbackTone("neutral");
    setPaymentFeedbackMessage("Confirmando pagamento...");

    try {
      await confirmPixPayment(paymentId);
      setPaymentFeedbackTone("success");
      setPaymentFeedbackMessage("Pagamento confirmado e créditos adicionados na carteira.");
      setActivePixPayment(null);
      await loadDashboard({ isRefresh: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setPaymentFeedbackTone("error");
      setPaymentFeedbackMessage(getErrorMessage(error, "Não foi possível confirmar o pagamento."));
    } finally {
      setIsConfirmingMockPayment(false);
    }
  }, [activePixPayment?.payment.id, loadDashboard, navigate]);

  const handleRetryFailedJob = useCallback(
    async (jobId: string) => {
      let shouldProcess = false;
      setRetryingJobIds((current) => {
        if (current.includes(jobId)) {
          return current;
        }
        shouldProcess = true;
        return [...current, jobId];
      });
      if (!shouldProcess) {
        return;
      }

      setJobsFeedbackTone("neutral");
      setJobsFeedbackMessage("Reenfileirando job para novo processamento...");

      try {
        await reprocessTranscription(jobId);
        setJobsFeedbackTone("success");
        setJobsFeedbackMessage("Job reenfileirado com sucesso. Acompanhe o status em tempo real.");
        await loadDashboard({ isRefresh: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }

        setJobsFeedbackTone("error");
        setJobsFeedbackMessage(
          getErrorMessage(error, "Nao foi possivel reenfileirar o job para reprocessamento.")
        );
      } finally {
        setRetryingJobIds((current) => current.filter((id) => id !== jobId));
      }
    },
    [loadDashboard, navigate]
  );

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void loadDashboard();
  }, [loadDashboard, navigate]);

  useEffect(() => {
    if (!hasProcessingJobs) {
      return;
    }

    const timer = setInterval(() => {
      void loadDashboard({ isRefresh: true });
    }, 5000);

    return () => clearInterval(timer);
  }, [hasProcessingJobs, loadDashboard]);

  return (
    <main className="font-display text-slate-900 antialiased dark:text-slate-100">
      <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
        <DashboardSidebar user={user} activeMenu="dashboard" />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden" id="dashboard">
          <DashboardTopbar searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />

          <div className="flex-1 space-y-8 overflow-y-auto p-8">
            <DashboardStatsGrid
              wallet={wallet}
              walletUsagePercent={walletUsagePercent}
              todayUsageSeconds={todayUsageSeconds}
              latestCreditEntry={latestCreditEntry}
              onAddCreditsClick={focusCreditsPanel}
            />

            <div className="grid grid-cols-12 gap-8">
              <JobsTable
                loadState={loadState}
                loadError={loadError}
                jobs={visibleJobs}
                onRetryFailedJob={handleRetryFailedJob}
                retryingJobIds={retryingJobIds}
                feedbackMessage={jobsFeedbackMessage}
                feedbackTone={jobsFeedbackTone}
                total={jobsTotal}
                hasMore={jobsHasMore}
                currentPage={jobsPage}
                onPageChange={handleJobsPageChange}
                pageSize={JOBS_PAGE_SIZE}
              />

              <div className="col-span-4 space-y-4">
                <LedgerPanel
                  ledger={ledger}
                  total={ledgerTotal}
                  hasMore={ledgerHasMore}
                  currentPage={ledgerPage}
                  onPageChange={handleLedgerPageChange}
                  pageSize={LEDGER_PAGE_SIZE}
                />
                <CreditManagementPanel
                  amountInput={topUpAmountInput}
                  onAmountInputChange={setTopUpAmountInput}
                  onCreatePixPayment={handleCreatePixPayment}
                  isCreatingPayment={isCreatingPayment}
                  isRefreshingData={isRefreshingData}
                  activePix={activePixPayment}
                  onConfirmMockPayment={handleConfirmMockPayment}
                  isConfirmingMockPayment={isConfirmingMockPayment}
                  payments={payments}
                  feedbackMessage={paymentFeedbackMessage}
                  feedbackTone={paymentFeedbackTone}
                />
                <OptimizationTip />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
