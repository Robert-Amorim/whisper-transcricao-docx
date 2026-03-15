import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import DashboardStatsGrid from "../components/dashboard/DashboardStatsGrid";
import DashboardTopbar from "../components/dashboard/DashboardTopbar";
import JobsTable from "../components/dashboard/JobsTable";
import LedgerPanel from "../components/dashboard/LedgerPanel";
import OptimizationTip from "../components/dashboard/OptimizationTip";
import {
  ApiError,
  getErrorMessage,
  getMe,
  getWallet,
  listTranscriptions,
  listWalletLedger
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { PROCESSING_STATUSES } from "../lib/transcriptions";
import {
  type PublicUser,
  type TranscriptionJob,
  type WalletLedgerEntry,
  type WalletSummary
} from "../lib/types";
import { useNavigate } from "react-router-dom";

type LoadState = "loading" | "ready" | "error";

export default function DashboardPage() {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

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

  const loadDashboard = useCallback(
    async (options?: { isRefresh?: boolean }) => {
      if (!options?.isRefresh) {
        setLoadState("loading");
      }
      setLoadError("");

      try {
        const [currentUser, currentWallet, currentJobs, currentLedger] = await Promise.all([
          getMe(),
          getWallet(),
          listTranscriptions({
            limit: 50
          }),
          listWalletLedger(10)
        ]);

        setUser(currentUser);
        setWallet(currentWallet);
        setJobs(currentJobs.items);
        setLedger(currentLedger.items);
        setLoadState("ready");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }

        setLoadError(getErrorMessage(error, "Nao foi possivel carregar o dashboard."));
        setLoadState("error");
      }
    },
    [navigate]
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
            />

            <div className="grid grid-cols-12 gap-8">
              <JobsTable
                loadState={loadState}
                loadError={loadError}
                jobs={visibleJobs.slice(0, 6)}
              />

              <div className="col-span-4 space-y-4">
                <LedgerPanel ledger={ledger} />
                <OptimizationTip />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
