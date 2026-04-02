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
      <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark">
        <DashboardSidebar user={user} activeMenu="transcriptions" />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 dark:border-slate-800 dark:bg-background-dark/50">
            <h2 className="font-display text-xl font-bold tracking-tight">Transcrições</h2>

            <div className="flex items-center gap-4">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar arquivos..."
                  className="min-h-0 w-64 rounded-lg border-none bg-slate-100 py-2 pl-9 pr-4 font-body text-sm transition-all focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:placeholder:text-slate-500"
                />
              </div>
              <a
                href="/transcricoes/nova"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-display text-sm font-semibold text-white transition hover:opacity-90"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Nova transcrição
              </a>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
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
