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

const MOCK_DASHBOARD_ROWS: DashboardJobRow[] = [
  {
    id: "mock-1",
    sourceObjectKey: "meeting_record_01.mp3",
    language: "PT-BR",
    createdLabel: "10:45",
    status: "processing",
    actionIcon: "more_vert"
  },
  {
    id: "mock-2",
    sourceObjectKey: "interview_final.wav",
    language: "EN-US",
    createdLabel: "09:30",
    status: "completed",
    actionIcon: "download"
  },
  {
    id: "mock-3",
    sourceObjectKey: "podcast_ep32.mp4",
    language: "PT-BR",
    createdLabel: "08:15",
    status: "failed",
    actionIcon: "refresh"
  },
  {
    id: "mock-4",
    sourceObjectKey: "aula_metodologia.m4a",
    language: "ES-ES",
    createdLabel: "Ontem",
    status: "queued",
    actionIcon: "cancel"
  },
  {
    id: "mock-5",
    sourceObjectKey: "buffer_temp_092.tmp",
    language: "--",
    createdLabel: "Agora",
    status: "uploaded",
    actionIcon: "delete"
  }
];

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

export default function JobsTable({ loadState, loadError, jobs }: JobsTableProps) {
  const tableRows: DashboardJobRow[] =
    jobs.length > 0
      ? jobs.map((job) => ({
          id: job.id,
          sourceObjectKey: getFileNameFromObjectKey(job.sourceObjectKey),
          language: job.language,
          createdLabel: formatDateTime(job.createdAt),
          status: job.status,
          actionIcon: getActionIconByStatus(job.status),
          detailsHref:
            job.status === "completed" ||
            job.status === "processing" ||
            job.status === "queued" ||
            job.status === "validating"
              ? `/transcricoes/${job.id}`
              : undefined
        }))
      : MOCK_DASHBOARD_ROWS;

  return (
    <section className="col-span-8 space-y-4" id="jobs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-lg font-bold">Jobs recentes</h4>
          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-400 dark:bg-slate-800">
            GET /v1/transcriptions
          </span>
        </div>
        <button type="button" className="min-h-0 text-sm font-medium text-primary hover:underline">
          Ver todos
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Arquivo</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Idioma</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Criado em</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Progresso
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Ações</th>
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

            {loadState === "ready"
              ? tableRows.map((row) => {
                  const status = getStatusPresentation(row.status);
                  const isWaiting = row.status === "uploaded";
                  return (
                    <tr key={row.id}>
                      <td className="px-6 py-4 text-sm font-medium">{row.sourceObjectKey}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{row.language}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{row.createdLabel}</td>
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
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
