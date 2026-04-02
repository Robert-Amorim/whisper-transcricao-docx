import { Link } from "react-router-dom";
import { formatDateTime, getFileNameFromObjectKey, getStatusTone } from "../../lib/transcriptions";
import type { JobStatus, TranscriptionJob } from "../../lib/types";

type DashboardStatusInfo = {
  label: string;
  badgeClassName: string;
  progressBarClassName: string;
  progressLabelClassName: string;
  progressPercent: number;
  progressLabel: string;
};

function getStatusPresentation(status: JobStatus): DashboardStatusInfo {
  switch (status) {
    case "completed":
      return {
        label: "concluído",
        badgeClassName: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        progressBarClassName: "bg-emerald-500",
        progressLabelClassName: "text-emerald-500",
        progressPercent: 100,
        progressLabel: "100%"
      };
    case "failed":
      return {
        label: "erro",
        badgeClassName: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        progressBarClassName: "bg-red-500",
        progressLabelClassName: "text-red-500",
        progressPercent: 15,
        progressLabel: "Falha"
      };
    case "processing":
      return {
        label: "processando",
        badgeClassName: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        progressBarClassName: "bg-primary",
        progressLabelClassName: "text-slate-700 dark:text-slate-300",
        progressPercent: 65,
        progressLabel: "65%"
      };
    case "queued":
      return {
        label: "carregando",
        badgeClassName: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
        progressBarClassName: "bg-slate-400",
        progressLabelClassName: "text-slate-700 dark:text-slate-300",
        progressPercent: 25,
        progressLabel: "25%"
      };
    case "validating":
      return {
        label: "carregando",
        badgeClassName: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
        progressBarClassName: "bg-slate-400",
        progressLabelClassName: "text-slate-700 dark:text-slate-300",
        progressPercent: 12,
        progressLabel: "12%"
      };
    case "uploaded":
    default:
      return {
        label: "vazio",
        badgeClassName:
          "border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
        progressBarClassName: "bg-slate-400",
        progressLabelClassName: "text-slate-500",
        progressPercent: 0,
        progressLabel: "0%"
      };
  }
}

type JobsTableProps = {
  loadState: "loading" | "ready" | "error";
  loadError: string;
  jobs: TranscriptionJob[];
  onRetryFailedJob: (jobId: string) => void;
  retryingJobIds: string[];
  feedbackMessage: string;
  feedbackTone: "neutral" | "success" | "error";
  total?: number;
  hasMore?: boolean;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
};

type DashboardJobRow = {
  id: string;
  sourceObjectKey: string;
  language: string;
  createdLabel: string;
  status: JobStatus;
  actionIcon: string;
  detailsHref?: string;
};

function getActionIconByStatus(status: JobStatus) {
  switch (status) {
    case "completed":
      return "download";
    case "failed":
      return "refresh";
    case "queued":
    case "validating":
      return "cancel";
    case "uploaded":
      return "delete";
    case "processing":
    default:
      return "more_vert";
  }
}

function getFeedbackClassName(tone: JobsTableProps["feedbackTone"]) {
  if (tone === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (tone === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300";
}

export default function JobsTable({
  loadState,
  loadError,
  jobs,
  onRetryFailedJob,
  retryingJobIds,
  feedbackMessage,
  feedbackTone,
  total = 0,
  hasMore = false,
  currentPage = 0,
  onPageChange,
  pageSize = 20
}: JobsTableProps) {
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const tableRows: DashboardJobRow[] = jobs.map((job) => ({
    id: job.id,
    sourceObjectKey: getFileNameFromObjectKey(job.sourceObjectKey),
    language: job.language,
    createdLabel: formatDateTime(job.createdAt),
    status: job.status,
    actionIcon: getActionIconByStatus(job.status),
    detailsHref: `/transcricoes/${job.id}`
  }));

  return (
    <section className="col-span-8 space-y-4" id="jobs">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-lg font-bold tracking-tight">Transcrições recentes</h4>
        {total > 0 && (
          <span className="font-mono text-xs text-slate-500">{total} job{total !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {feedbackMessage ? (
          <p className={`m-4 rounded-lg border px-3 py-2 text-xs ${getFeedbackClassName(feedbackTone)}`}>
            {feedbackMessage}
          </p>
        ) : null}
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="px-6 py-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500">Arquivo</th>
              <th className="px-6 py-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500">Idioma</th>
              <th className="px-6 py-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500">Criado em</th>
              <th className="px-6 py-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500">Status</th>
              <th className="px-6 py-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500">Progresso</th>
              <th className="px-6 py-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {loadState === "loading" ? (
              <tr>
                <td className="px-6 py-6 text-sm text-slate-500" colSpan={6}>
                  Carregando transcrições...
                </td>
              </tr>
            ) : null}

            {loadState === "error" ? (
              <tr>
                <td className="px-6 py-6 text-sm text-red-500" colSpan={6}>
                  {loadError}
                </td>
              </tr>
            ) : null}

            {loadState === "ready" && tableRows.length === 0 ? (
              <tr>
                <td className="px-6 py-6 text-sm text-slate-500" colSpan={6}>
                  Nenhuma transcrição encontrada. Crie a primeira em "Nova transcrição".
                </td>
              </tr>
            ) : null}

            {loadState === "ready"
              ? tableRows.map((row) => {
                  const status = getStatusPresentation(row.status);
                  const isWaiting = row.status === "uploaded";
                  const isRetrying = retryingJobIds.includes(row.id);
                  return (
                    <tr key={row.id}>
                      <td className="px-6 py-4 font-body text-sm font-medium">{row.sourceObjectKey}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{row.language}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{row.createdLabel}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.badgeClassName}`}
                        >
                          {getStatusTone(row.status) === "processing" ? (
                            <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
                          ) : null}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isWaiting ? (
                          <span className="text-xs italic text-slate-400">Aguardando...</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className={`h-full ${status.progressBarClassName}`}
                                style={{ width: `${status.progressPercent}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${status.progressLabelClassName}`}>
                              {status.progressLabel}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {row.status === "failed" ? (
                            <button
                              type="button"
                              onClick={() => onRetryFailedJob(row.id)}
                              disabled={isRetrying}
                              className="inline-flex min-h-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span className="material-symbols-outlined text-base leading-none">refresh</span>
                              {isRetrying ? "Reenfileirando..." : "Tentar novamente"}
                            </button>
                          ) : null}

                          {row.detailsHref ? (
                            <Link
                              to={row.detailsHref}
                              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800"
                            >
                              <span className="material-symbols-outlined">{row.actionIcon}</span>
                            </Link>
                          ) : (
                            <button type="button" className="rounded p-1 text-slate-400 transition hover:text-primary">
                              <span className="material-symbols-outlined">{row.actionIcon}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      {onPageChange && totalPages > 1 ? (
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="font-mono text-xs text-slate-500">
            Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => onPageChange(currentPage - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => onPageChange(currentPage + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
