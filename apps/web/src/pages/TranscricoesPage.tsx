import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import JobsTable from "../components/dashboard/JobsTable";
import {
  ApiError,
  getErrorMessage,
  getMe,
  listTranscriptions,
  reprocessTranscription
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { PROCESSING_STATUSES, getFileNameFromObjectKey } from "../lib/transcriptions";
import type { PublicUser, TranscriptionJob } from "../lib/types";

type LoadState = "loading" | "ready" | "error";
type FeedbackTone = "neutral" | "success" | "error";

const PAGE_SIZE = 20;

export default function TranscricoesPage() {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [retryingJobIds, setRetryingJobIds] = useState<string[]>([]);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasProcessingJobs = useMemo(
    () => jobs.some((job) => PROCESSING_STATUSES.includes(job.status)),
    [jobs]
  );

  const visibleJobs = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) => {
      const name = getFileNameFromObjectKey(job.sourceObjectKey).toLowerCase();
      return name.includes(normalized) || job.language.toLowerCase().includes(normalized);
    });
  }, [jobs, searchTerm]);

  const setFeedback = useCallback((tone: FeedbackTone, message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedbackTone(tone);
    setFeedbackMessage(message);
    if (tone !== "neutral") {
      feedbackTimer.current = setTimeout(() => setFeedbackMessage(""), 6000);
    }
  }, []);

  const loadPage = useCallback(
    async (options?: { isRefresh?: boolean; pageOverride?: number }) => {
      if (!options?.isRefresh) setLoadState("loading");
      setLoadError("");

      const page = options?.pageOverride ?? currentPage;

      try {
        const [currentUser, result] = await Promise.all([
          getMe(),
          listTranscriptions({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        ]);
        setUser(currentUser);
        setJobs(result.items);
        setTotal(result.total ?? 0);
        setHasMore(result.hasMore ?? false);
        setLoadState("ready");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setLoadError(getErrorMessage(error, "Não foi possível carregar as transcrições."));
        setLoadState("error");
      }
    },
    [navigate, currentPage]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      void loadPage({ isRefresh: true, pageOverride: page });
    },
    [loadPage]
  );

  const handleRetryFailedJob = useCallback(
    async (jobId: string) => {
      let shouldProcess = false;
      setRetryingJobIds((prev) => {
        if (prev.includes(jobId)) return prev;
        shouldProcess = true;
        return [...prev, jobId];
      });
      if (!shouldProcess) return;

      // Safety timeout: always clear retrying state after 30s regardless of outcome
      const safetyTimer = setTimeout(
        () => setRetryingJobIds((prev) => prev.filter((id) => id !== jobId)),
        30000
      );

      setFeedback("neutral", "Reenfileirando para novo processamento...");

      try {
        await reprocessTranscription(jobId);
        setFeedback("success", "Job reenfileirado com sucesso.");
        await loadPage({ isRefresh: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setFeedback("error", getErrorMessage(error, "Não foi possível reenfileirar o job."));
      } finally {
        clearTimeout(safetyTimer);
        setRetryingJobIds((prev) => prev.filter((id) => id !== jobId));
      }
    },
    [loadPage, navigate, setFeedback]
  );

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void loadPage();
  }, [loadPage, navigate]);

  useEffect(() => {
    if (!hasProcessingJobs) return;
    const timer = setInterval(() => void loadPage({ isRefresh: true }), 5000);
    return () => clearInterval(timer);
  }, [hasProcessingJobs, loadPage]);

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
        <DashboardSidebar user={user} activeMenu="transcriptions" />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <h2 className="font-display text-xl font-bold tracking-tight">Transcrições</h2>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar arquivos..."
                  className="min-h-0 w-full rounded-lg border-none bg-slate-100 py-2 pl-9 pr-4 font-body text-sm transition-all focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:placeholder:text-slate-500"
                />
              </div>
              <a
                href="/transcricoes/nova"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-display text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Nova transcrição
              </a>
            </div>
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">
            <JobsTable
              loadState={loadState}
              loadError={loadError}
              jobs={visibleJobs}
              onRetryFailedJob={handleRetryFailedJob}
              retryingJobIds={retryingJobIds}
              feedbackMessage={feedbackMessage}
              feedbackTone={feedbackTone}
              total={total}
              hasMore={hasMore}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              pageSize={PAGE_SIZE}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
