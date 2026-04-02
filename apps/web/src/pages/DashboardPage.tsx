import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import DashboardStatsGrid from "../components/dashboard/DashboardStatsGrid";
import DashboardTopbar from "../components/dashboard/DashboardTopbar";
import JobsTable from "../components/dashboard/JobsTable";
import LedgerPanel from "../components/dashboard/LedgerPanel";
import {
  ApiError,
  getErrorMessage,
  getMe,
  getWallet,
  listTranscriptions,
  listWalletLedger,
  reprocessTranscription
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { PROCESSING_STATUSES } from "../lib/transcriptions";
import type {
  PublicUser,
  TranscriptionJob,
  WalletLedgerEntry,
  WalletSummary
} from "../lib/types";

type LoadState = "loading" | "ready" | "error";
type FeedbackTone = "neutral" | "success" | "error";

const JOBS_PAGE_SIZE = 20;
const LEDGER_PAGE_SIZE = 8;

export default function DashboardPage() {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [jobsFeedbackMessage, setJobsFeedbackMessage] = useState("");
  const [jobsFeedbackTone, setJobsFeedbackTone] = useState<FeedbackTone>("neutral");
  const [retryingJobIds, setRetryingJobIds] = useState<string[]>([]);
  const jobsFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) => {
      const source = job.sourceObjectKey.toLowerCase();
      const language = job.language.toLowerCase();
      return source.includes(normalized) || language.includes(normalized);
    });
  }, [jobs, searchTerm]);

  const walletUsagePercent = useMemo(() => {
    if (!wallet) return 0;
    const available = Number(wallet.availableBalance);
    const held = Number(wallet.heldBalance);
    const total = available + held;
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((available / total) * 100)));
  }, [wallet]);

  const todayUsageSeconds = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    return jobs.reduce((acc, job) => {
      if (job.durationSeconds === null) return acc;
      const createdAt = new Date(job.createdAt);
      if (createdAt.getFullYear() === y && createdAt.getMonth() === m && createdAt.getDate() === d) {
        return acc + Number(job.durationSeconds);
      }
      return acc;
    }, 0);
  }, [jobs]);

  const latestCreditEntry = useMemo(() => {
    const credits = ledger.filter((entry) => entry.type === "credit");
    if (credits.length === 0) return null;
    return [...credits].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, [ledger]);

  const setJobsFeedback = useCallback((tone: FeedbackTone, message: string) => {
    if (jobsFeedbackTimer.current) clearTimeout(jobsFeedbackTimer.current);
    setJobsFeedbackTone(tone);
    setJobsFeedbackMessage(message);
    if (tone !== "neutral") {
      jobsFeedbackTimer.current = setTimeout(() => setJobsFeedbackMessage(""), 6000);
    }
  }, []);

  const loadDashboard = useCallback(
    async (options?: { isRefresh?: boolean; jobsPageOverride?: number; ledgerPageOverride?: number }) => {
      if (!options?.isRefresh) setLoadState("loading");
      setLoadError("");

      const currentJobsPage = options?.jobsPageOverride ?? jobsPage;
      const currentLedgerPage = options?.ledgerPageOverride ?? ledgerPage;

      try {
        const [currentUser, currentWallet, currentJobs, currentLedger] = await Promise.all([
          getMe(),
          getWallet(),
          listTranscriptions({ limit: JOBS_PAGE_SIZE, offset: currentJobsPage * JOBS_PAGE_SIZE }),
          listWalletLedger({ limit: LEDGER_PAGE_SIZE, offset: currentLedgerPage * LEDGER_PAGE_SIZE })
        ]);

        setUser(currentUser);
        setWallet(currentWallet);
        setJobs(currentJobs.items);
        setJobsTotal(currentJobs.total ?? 0);
        setJobsHasMore(currentJobs.hasMore ?? false);
        setLedger(currentLedger.items);
        setLedgerTotal(currentLedger.total ?? 0);
        setLedgerHasMore(currentLedger.hasMore ?? false);
        setLoadState("ready");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setLoadError(getErrorMessage(error, "Não foi possível carregar o dashboard."));
        setLoadState("error");
      }
    },
    [navigate, jobsPage, ledgerPage]
  );

  const handleJobsPageChange = useCallback(
    (page: number) => {
      setJobsPage(page);
      void loadDashboard({ isRefresh: true, jobsPageOverride: page });
    },
    [loadDashboard]
  );

  const handleLedgerPageChange = useCallback(
    (page: number) => {
      setLedgerPage(page);
      void loadDashboard({ isRefresh: true, ledgerPageOverride: page });
    },
    [loadDashboard]
  );

  const handleRetryFailedJob = useCallback(
    async (jobId: string) => {
      let shouldProcess = false;
      setRetryingJobIds((current) => {
        if (current.includes(jobId)) return current;
        shouldProcess = true;
        return [...current, jobId];
      });
      if (!shouldProcess) return;

      setJobsFeedback("neutral", "Reenfileirando job para novo processamento...");

      try {
        await reprocessTranscription(jobId);
        setJobsFeedback("success", "Job reenfileirado com sucesso. Acompanhe o status em tempo real.");
        await loadDashboard({ isRefresh: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setJobsFeedback("error", getErrorMessage(error, "Não foi possível reenfileirar o job."));
      } finally {
        setRetryingJobIds((current) => current.filter((id) => id !== jobId));
      }
    },
    [loadDashboard, navigate, setJobsFeedback]
  );

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void loadDashboard();
  }, [loadDashboard, navigate]);

  useEffect(() => {
    if (!hasProcessingJobs) return;
    const timer = setInterval(() => void loadDashboard({ isRefresh: true }), 5000);
    return () => clearInterval(timer);
  }, [hasProcessingJobs, loadDashboard]);

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
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

              <div className="col-span-4">
                <LedgerPanel
                  ledger={ledger}
                  total={ledgerTotal}
                  hasMore={ledgerHasMore}
                  currentPage={ledgerPage}
                  onPageChange={handleLedgerPageChange}
                  pageSize={LEDGER_PAGE_SIZE}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
