import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import Spinner from "../components/common/Spinner";
import {
  ApiError,
  downloadTranscriptionOutput,
  getErrorMessage,
  getMe,
  getTranscription
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import {
  PROCESSING_STATUSES,
  formatDateTime,
  formatDuration,
  formatSeconds,
  formatTimestampLabel,
  getFileNameFromObjectKey,
  getStatusLabel,
  getStatusTone,
  getTranscriptionEtaInfo,
  getTranscriptStatusLabel,
  getTranscriptStatusTone,
  hasOutputFormat
} from "../lib/transcriptions";
import type {
  OutputFormat,
  PublicUser,
  TranscriptVariant,
  TranscriptionJobDetail
} from "../lib/types";

type LoadState = "loading" | "ready" | "error";

function formatDownloadLabel(format: OutputFormat) {
  switch (format) {
    case "txt":
      return "TXT";
    case "srt":
      return "SRT";
    case "pdf":
      return "PDF";
  }
}

function PipelineStatusRow(props: {
  label: string;
  value: string;
  tone: string;
  helper: string;
  icon: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/40">
      <span className="material-symbols-outlined mt-0.5 text-[18px] text-slate-400">
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-body text-sm font-semibold text-slate-700 dark:text-slate-200">
            {props.label}
          </p>
          <span className={`db-status db-status-${props.tone}`}>{props.value}</span>
        </div>
        <p className="mt-1 font-body text-xs text-slate-500 dark:text-slate-400">
          {props.helper}
        </p>
      </div>
    </div>
  );
}

export default function TranscriptionDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const jobId = useMemo(() => params.id ?? "", [params.id]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [job, setJob] = useState<TranscriptionJobDetail | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const fetchJob = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!jobId) {
        setLoadState("error");
        setError("Transcrição não encontrada.");
        return;
      }

      if (!options?.silent) {
        setLoadState("loading");
      }

      try {
        const [response, me] = await Promise.all([
          getTranscription(jobId),
          user ? Promise.resolve(user) : getMe()
        ]);
        setJob(response.job);
        if (!user) {
          setUser(me as PublicUser);
        }
        setLoadState("ready");
        setError("");
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setLoadState("error");
        setError(getErrorMessage(requestError, "Não foi possível carregar a transcrição."));
      }
    },
    [jobId, navigate, user]
  );

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void fetchJob();
  }, [fetchJob, navigate]);

  const shouldAutoRefresh = Boolean(
    job &&
      (PROCESSING_STATUSES.includes(job.status) ||
        job.originalTranscriptStatus === "processing" ||
        job.originalTranscriptStatus === "regenerating" ||
        job.translatedTranscriptStatus === "pending" ||
        job.translatedTranscriptStatus === "processing" ||
        job.translatedTranscriptStatus === "regenerating")
  );

  useEffect(() => {
    if (!shouldAutoRefresh) {
      return;
    }
    const timer = window.setInterval(() => void fetchJob({ silent: true }), 5000);
    return () => window.clearInterval(timer);
  }, [fetchJob, shouldAutoRefresh]);

  async function handleDownload(format: OutputFormat, variant: TranscriptVariant) {
    if (!jobId) {
      return;
    }
    const key = `${variant}-${format}`;
    setDownloadingKey(key);
    try {
      const result = await downloadTranscriptionOutput(jobId, format, variant);
      const objectUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(getErrorMessage(downloadError, "Falha ao baixar arquivo."));
    } finally {
      setDownloadingKey(null);
    }
  }

  const fileName = job ? getFileNameFromObjectKey(job.sourceObjectKey) : "";
  const originalSegments = job?.transcripts.original?.segments ?? [];
  const previewSegments = originalSegments.slice(0, 5);
  const hasTranslatedVariant = Boolean(job?.translationTargetLanguage);
  const etaInfo = job ? getTranscriptionEtaInfo(job) : null;
  const originalDownloadFormats: OutputFormat[] = ["txt", "srt", "pdf"];
  const translatedDownloadFormats: OutputFormat[] = ["txt", "pdf"];

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:flex-row lg:overflow-hidden">
        <DashboardSidebar user={user} activeMenu="transcriptions" />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <div className="min-w-0">
              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Visão de entrega
              </p>
              <h2 className="truncate font-display text-xl font-bold tracking-tight">
                {fileName || "Detalhes da transcrição"}
              </h2>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {job && (
                <Link
                  to={`/transcricoes/${job.id}/resultado`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_full</span>
                  Resultado
                </Link>
              )}
              <Link
                to="/transcricoes"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-body text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Transcrições
              </Link>
            </div>
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">
            {loadState === "loading" && (
              <div className="flex items-center gap-2 text-slate-500">
                <Spinner size="sm" className="text-primary" />
                <span className="font-body text-sm">Carregando detalhes...</span>
              </div>
            )}

            {loadState === "error" && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </p>
            )}

            {loadState === "ready" && job && (
              <div className="space-y-6">
                <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-white to-primary/5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-primary/10">
                  <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`db-status db-status-${getStatusTone(job.status)}`}>
                          {getStatusLabel(job.status)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                          {job.language}
                        </span>
                        {job.diarizationEnabled && (
                          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                            Diarização ativa
                          </span>
                        )}
                        {job.generatePdf && (
                          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                            PDF automático
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                          Arquivo de origem
                        </p>
                        <h3 className="mt-2 max-w-3xl font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                          {fileName}
                        </h3>
                        <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          Esta visão resume o andamento do pipeline e os artefatos publicados. O trabalho detalhado de revisão e leitura fica centralizado na tela de resultado.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      {etaInfo ? (
                        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 dark:bg-primary/10">
                          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                            Previsão de conclusão
                          </p>
                          <p className="mt-1 font-body text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {etaInfo.headline}
                          </p>
                          <p className="mt-2 font-body text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {etaInfo.helper}
                          </p>
                        </div>
                      ) : null}
                      {[
                        { label: "Duração", value: formatDuration(job.durationSeconds) },
                        { label: "Segmentos ativos", value: String(originalSegments.length) },
                        { label: "Criado em", value: formatDateTime(job.createdAt) },
                        { label: "Última atualização", value: formatDateTime(job.updatedAt) }
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70"
                        >
                          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                            {item.label}
                          </p>
                          <p className="mt-1 font-body text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-12">
                  <section className="space-y-6 xl:col-span-8">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <p className="mb-4 font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        Etapas do fluxo
                      </p>
                      <div className="space-y-3">
                        <PipelineStatusRow
                          label="Job de transcrição"
                          value={getStatusLabel(job.status)}
                          tone={getStatusTone(job.status)}
                          helper={job.errorMessage || "Upload, validação, processamento e cobrança do arquivo."}
                          icon="multimodal_hand_eye"
                        />
                        <PipelineStatusRow
                          label="Transcript original"
                          value={getTranscriptStatusLabel(job.originalTranscriptStatus)}
                          tone={getTranscriptStatusTone(job.originalTranscriptStatus)}
                          helper={`${originalSegments.length} segmentos publicados na revisão atual.`}
                          icon="article"
                        />
                        <PipelineStatusRow
                          label="Tradução derivada"
                          value={
                            hasTranslatedVariant
                              ? getTranscriptStatusLabel(job.translatedTranscriptStatus)
                              : "Nao solicitada"
                          }
                          tone={getTranscriptStatusTone(job.translatedTranscriptStatus)}
                          helper={
                            hasTranslatedVariant
                              ? `Idioma de destino: ${job.translationTargetLanguage}`
                              : "O job foi criado apenas com o idioma original."
                          }
                          icon="translate"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                            Preview do transcript
                          </p>
                          <p className="mt-1 font-body text-sm text-slate-500 dark:text-slate-400">
                            Uma amostra rápida da revisão original atual.
                          </p>
                        </div>
                        <Link
                          to={`/transcricoes/${job.id}/resultado`}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 font-body text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit_note</span>
                          Abrir editor
                        </Link>
                      </div>

                      {!job.transcripts.original && (
                        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 font-body text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                          O transcript original ainda não está disponível.
                        </p>
                      )}

                      {job.transcripts.original && previewSegments.length === 0 && (
                        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                          {(job.originalTranscriptStatus === "processing" ||
                            job.originalTranscriptStatus === "regenerating") && (
                            <Spinner size="sm" className="text-primary" />
                          )}
                          <span className="font-body text-sm">
                            Ainda não há segmentos publicados para esta revisão.
                          </span>
                        </div>
                      )}

                      {previewSegments.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {previewSegments.map((segment) => (
                            <div
                              key={`${segment.segmentIndex}-${segment.revision}`}
                              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                            >
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-primary/10 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                                  {segment.speakerLabel ?? `Segmento ${segment.segmentIndex + 1}`}
                                </span>
                                <span className="font-mono text-xs text-slate-400">
                                  {formatTimestampLabel(segment.startSec)} - {formatTimestampLabel(segment.endSec)}
                                </span>
                              </div>
                              <p className="font-body text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                                {segment.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <p className="mb-4 font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                        Pipeline técnico
                      </p>

                      {!job.chunks || job.chunks.length === 0 ? (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 font-body text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                          Nenhum chunk técnico foi persistido ainda.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {job.chunks.slice(0, 8).map((chunk) => (
                            <div
                              key={`${chunk.chunkIndex}-${chunk.updatedAt}`}
                              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-[auto_1fr_auto]"
                            >
                              <div className="font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
                                Chunk {chunk.chunkIndex + 1}
                              </div>
                              <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                {formatSeconds(chunk.startSec)} ate {formatSeconds(chunk.endSec)}
                              </div>
                              <div className="justify-self-start sm:justify-self-end">
                                <span className={`db-status db-status-${chunk.status === "completed" ? "completed" : chunk.status === "failed" ? "failed" : "processing"}`}>
                                  {chunk.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <aside className="space-y-4 xl:col-span-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <p className="mb-4 font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Downloads do original
                      </p>
                      <div className="space-y-2">
                        {originalDownloadFormats.map((format) => {
                          const available = hasOutputFormat(job, format, "original");
                          const key = `original-${format}`;
                          return (
                            <button
                              key={format}
                              type="button"
                              disabled={!available || downloadingKey !== null}
                              onClick={() => void handleDownload(format, "original")}
                              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:border-primary/30 dark:hover:bg-primary/5"
                            >
                              <div>
                                <p className="font-body text-sm font-semibold text-slate-700 dark:text-slate-200">
                                  {formatDownloadLabel(format)} original
                                </p>
                                <p className="font-body text-xs text-slate-400">
                                  {available ? "Arquivo publicado." : "Aguardando artefato."}
                                </p>
                              </div>
                              {downloadingKey === key ? (
                                <Spinner size="sm" />
                              ) : (
                                <span className="material-symbols-outlined text-[18px] text-slate-400">
                                  download
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {hasTranslatedVariant && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <p className="mb-4 font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                          Downloads da tradução
                        </p>
                        <div className="space-y-2">
                          {translatedDownloadFormats.map((format) => {
                            const available = hasOutputFormat(job, format, "translated");
                            const key = `translated-${format}`;
                            return (
                              <button
                                key={format}
                                type="button"
                                disabled={!available || downloadingKey !== null}
                                onClick={() => void handleDownload(format, "translated")}
                                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:border-emerald-600/40 dark:hover:bg-emerald-900/10"
                              >
                                <div>
                                  <p className="font-body text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {formatDownloadLabel(format)} traduzido
                                  </p>
                                  <p className="font-body text-xs text-slate-400">
                                    {available ? "Versão derivada publicada." : "Ainda em processamento."}
                                  </p>
                                </div>
                                {downloadingKey === key ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <span className="material-symbols-outlined text-[18px] text-slate-400">
                                    download
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <p className="mb-4 font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Configuração do job
                      </p>
                      <div className="space-y-3">
                        {[
                          { label: "Idioma base", value: job.language, icon: "translate" },
                          { label: "Idioma traduzido", value: job.translationTargetLanguage ?? "Nao solicitado", icon: "language" },
                          { label: "Diarização", value: job.diarizationEnabled ? "Ativa" : "Desativada", icon: "groups" },
                          { label: "PDF", value: job.generatePdf ? "Gerado automaticamente" : "Nao solicitado", icon: "picture_as_pdf" },
                          { label: "Concluído", value: formatDateTime(job.completedAt), icon: "event_available" }
                        ].map((item) => (
                          <div key={item.label} className="flex items-start gap-3">
                            <span className="material-symbols-outlined mt-0.5 text-[16px] text-slate-400">
                              {item.icon}
                            </span>
                            <div>
                              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                {item.label}
                              </p>
                              <p className="mt-1 font-body text-sm font-medium text-slate-700 dark:text-slate-300">
                                {item.value}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-body text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                        {error}
                      </p>
                    )}
                  </aside>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
