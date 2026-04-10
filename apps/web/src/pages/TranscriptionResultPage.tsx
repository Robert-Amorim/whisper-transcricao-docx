import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import Spinner from "../components/common/Spinner";
import {
  ApiError,
  downloadTranscriptionOutput,
  getErrorMessage,
  getMe,
  getTranscription,
  getTranscriptionOutputText,
  regenerateTranslation,
  updateOriginalTranscript
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import {
  PROCESSING_STATUSES,
  formatDateTime,
  formatDuration,
  formatTimestampLabel,
  getFileNameFromObjectKey,
  getStatusLabel,
  getTranscriptStatusLabel,
  getTranscriptStatusTone,
  hasOutputFormat
} from "../lib/transcriptions";
import type {
  OutputFormat,
  PublicUser,
  TranscriptSegment,
  TranscriptVariant,
  TranscriptionJobDetail
} from "../lib/types";

type LoadState = "loading" | "ready" | "error";
type ResultTab = "original" | "translated" | "subtitles";

function buildTranscriptCopyText(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => {
      const speaker = segment.speakerLabel ? `${segment.speakerLabel}: ` : "";
      const stamp = `${formatTimestampLabel(segment.startSec)} - ${formatTimestampLabel(segment.endSec)}`;
      return `[${stamp}] ${speaker}${segment.text}`;
    })
    .join("\n");
}

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

export default function TranscriptionResultPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const jobId = useMemo(() => params.id ?? "", [params.id]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [job, setJob] = useState<TranscriptionJobDetail | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ResultTab>("original");
  const [subtitleVariant, setSubtitleVariant] = useState<TranscriptVariant>("original");
  const [subtitleText, setSubtitleText] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const [isLoadingSubtitle, setIsLoadingSubtitle] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copiar");

  const [editableSegments, setEditableSegments] = useState<TranscriptSegment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isRetryingTranslation, setIsRetryingTranslation] = useState(false);
  const [hasRevisionConflict, setHasRevisionConflict] = useState(false);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);

  const subtitleRequestRef = useRef(0);
  const hasLocalEditsRef = useRef(false);
  const localBaseRevisionRef = useRef<number | null>(null);

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
        const incomingOriginal = response.job.transcripts.original;
        const incomingRevision = incomingOriginal?.revision ?? null;

        setJob(response.job);
        if (!options?.silent || !hasLocalEditsRef.current) {
          setEditableSegments(incomingOriginal?.segments ?? []);
          localBaseRevisionRef.current = incomingRevision;
          setHasRevisionConflict(false);
          setConflictRevision(null);
        } else if (incomingRevision !== null) {
          const localBaseRevision = localBaseRevisionRef.current;
          if (localBaseRevision !== null && incomingRevision > localBaseRevision) {
            setHasRevisionConflict(true);
            setConflictRevision(incomingRevision);
            setSaveMessage("");
          }
        }
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
        setError(getErrorMessage(requestError, "Não foi possível carregar o resultado."));
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

  const originalTranscript = job?.transcripts.original ?? null;
  const translatedTranscript = job?.transcripts.translated ?? null;
  const fileName = job ? getFileNameFromObjectKey(job.sourceObjectKey) : "";
  const hasTranslatedVariant = Boolean(job?.translationTargetLanguage);
  const translationStatus = job?.translatedTranscriptStatus ?? null;
  const originalStatus = job?.originalTranscriptStatus ?? null;

  const shouldAutoRefresh = Boolean(
    job &&
      (PROCESSING_STATUSES.includes(job.status) ||
        originalStatus === "processing" ||
        originalStatus === "regenerating" ||
        translationStatus === "pending" ||
        translationStatus === "processing" ||
        translationStatus === "regenerating")
  );

  useEffect(() => {
    if (!shouldAutoRefresh) {
      return;
    }
    const timer = window.setInterval(() => void fetchJob({ silent: true }), 5000);
    return () => window.clearInterval(timer);
  }, [fetchJob, shouldAutoRefresh]);

  useEffect(() => {
    if (!hasTranslatedVariant && activeTab === "translated") {
      setActiveTab("original");
    }
  }, [activeTab, hasTranslatedVariant]);

  const isDirty = useMemo(() => {
    if (!originalTranscript) {
      return false;
    }
    const current = JSON.stringify(
      editableSegments.map((segment) => ({
        index: segment.segmentIndex,
        text: segment.text
      }))
    );
    const baseline = JSON.stringify(
      originalTranscript.segments.map((segment) => ({
        index: segment.segmentIndex,
        text: segment.text
      }))
    );
    return current !== baseline;
  }, [editableSegments, originalTranscript]);

  useEffect(() => {
    hasLocalEditsRef.current = isDirty;
  }, [isDirty]);

  const loadSubtitlePreview = useCallback(
    async (variant: TranscriptVariant) => {
      if (!jobId || !hasOutputFormat(job ?? { outputs: [] }, "srt", variant)) {
        setSubtitleText("");
        return;
      }

      subtitleRequestRef.current += 1;
      const requestId = subtitleRequestRef.current;
      setIsLoadingSubtitle(true);
      setSubtitleError("");

      try {
        const text = await getTranscriptionOutputText(jobId, "srt", variant);
        if (requestId !== subtitleRequestRef.current) {
          return;
        }
        setSubtitleText(text);
      } catch (requestError) {
        if (requestId !== subtitleRequestRef.current) {
          return;
        }
        setSubtitleError(getErrorMessage(requestError, "Não foi possível carregar as legendas."));
      } finally {
        if (requestId === subtitleRequestRef.current) {
          setIsLoadingSubtitle(false);
        }
      }
    },
    [job, jobId]
  );

  useEffect(() => {
    if (activeTab === "subtitles") {
      void loadSubtitlePreview(subtitleVariant);
    }
  }, [activeTab, loadSubtitlePreview, subtitleVariant]);

  async function handleDownload(format: OutputFormat, variant: TranscriptVariant) {
    if (!jobId) {
      return;
    }
    const downloadKey = `${variant}-${format}`;
    setDownloadingKey(downloadKey);
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

  async function handleCopy() {
    const value =
      activeTab === "original"
        ? buildTranscriptCopyText(editableSegments)
        : activeTab === "translated"
          ? buildTranscriptCopyText(translatedTranscript?.segments ?? [])
          : subtitleText;

    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyLabel("Copiado!");
      setTimeout(() => setCopyLabel("Copiar"), 2000);
    } catch {
      setCopyLabel("Erro");
      setTimeout(() => setCopyLabel("Copiar"), 2000);
    }
  }

  async function handleSaveTranscript() {
    if (!jobId || !originalTranscript || !isDirty || hasRevisionConflict) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");
    try {
      const response = await updateOriginalTranscript(jobId, {
        segments: editableSegments.map((segment) => ({
          segmentIndex: segment.segmentIndex,
          startSec: segment.startSec,
          endSec: segment.endSec,
          text: segment.text,
          speakerLabel: segment.speakerLabel,
          language: segment.language
        }))
      });
      setJob(response.job);
      const nextOriginalTranscript = response.job.transcripts.original;
      setEditableSegments(nextOriginalTranscript?.segments ?? []);
      localBaseRevisionRef.current = nextOriginalTranscript?.revision ?? null;
      setHasRevisionConflict(false);
      setConflictRevision(null);
      setSaveMessage("Revisão salva. Artefatos em regeneração.");
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Não foi possível salvar a revisão."));
    } finally {
      setIsSaving(false);
    }
  }

  function handleReloadLatestRevision() {
    const latestOriginal = job?.transcripts.original;
    setEditableSegments(latestOriginal?.segments ?? []);
    localBaseRevisionRef.current = latestOriginal?.revision ?? null;
    setHasRevisionConflict(false);
    setConflictRevision(null);
    setSaveMessage("");
  }

  async function handleRetryTranslation() {
    if (!jobId) {
      return;
    }
    setIsRetryingTranslation(true);
    try {
      const response = await regenerateTranslation(jobId);
      setJob(response.job);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Não foi possível reagendar a tradução."));
    } finally {
      setIsRetryingTranslation(false);
    }
  }

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
                Centro de transcript
              </p>
              <h2 className="truncate font-display text-xl font-bold tracking-tight">
                {fileName || "Resultado"}
              </h2>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {job && (
                <Link
                  to={`/transcricoes/${job.id}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-body text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  Detalhes
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
                <span className="font-body text-sm">Carregando resultado...</span>
              </div>
            )}

            {loadState === "error" && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </p>
            )}

            {loadState === "ready" && job && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      label: "Transcrição",
                      value: getStatusLabel(job.status),
                      tone: job.status === "failed" ? "failed" : job.status === "completed" ? "completed" : "processing",
                      helper: formatDateTime(job.completedAt)
                    },
                    {
                      label: "Transcript original",
                      value: getTranscriptStatusLabel(job.originalTranscriptStatus),
                      tone: getTranscriptStatusTone(job.originalTranscriptStatus),
                      helper: `${editableSegments.length} segmentos`
                    },
                    {
                      label: "Tradução",
                      value: hasTranslatedVariant ? getTranscriptStatusLabel(job.translatedTranscriptStatus) : "Não solicitada",
                      tone: getTranscriptStatusTone(job.translatedTranscriptStatus),
                      helper: job.translationTargetLanguage ?? "Sem idioma adicional"
                    }
                  ].map((card) => (
                    <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                        {card.label}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                          {card.value}
                        </p>
                        <span className={`db-status db-status-${card.tone}`}>
                          {card.tone === "completed" ? "ok" : card.tone}
                        </span>
                      </div>
                      <p className="mt-2 font-body text-sm text-slate-500 dark:text-slate-400">
                        {card.helper}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-6 xl:grid-cols-12">
                  <section className="space-y-4 xl:col-span-8">
                    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/80">
                            {[
                              { key: "original", label: "Original" },
                              { key: "translated", label: "Traduzido", disabled: !hasTranslatedVariant },
                              { key: "subtitles", label: "Legendas" }
                            ].map((tab) => (
                              <button
                                key={tab.key}
                                type="button"
                                disabled={tab.disabled}
                                onClick={() => setActiveTab(tab.key as ResultTab)}
                                className={`rounded-lg px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.22em] transition ${
                                  activeTab === tab.key
                                    ? "bg-primary text-white"
                                    : "text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700"
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {activeTab === "subtitles" && hasTranslatedVariant && (
                              <div className="flex flex-wrap rounded-lg border border-slate-200 p-1 dark:border-slate-700">
                                {(["original", "translated"] as TranscriptVariant[]).map((variant) => (
                                  <button
                                    key={variant}
                                    type="button"
                                    disabled={!hasOutputFormat(job, "srt", variant)}
                                    onClick={() => setSubtitleVariant(variant)}
                                    className={`rounded-md px-2.5 py-1.5 font-body text-xs font-medium transition ${
                                      subtitleVariant === variant
                                        ? "bg-primary text-white"
                                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                    } disabled:cursor-not-allowed disabled:opacity-40`}
                                  >
                                    {variant === "original" ? "SRT original" : "SRT traduzido"}
                                  </button>
                                ))}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleCopy()}
                              disabled={
                                activeTab === "original"
                                  ? editableSegments.length === 0
                                  : activeTab === "translated"
                                    ? (translatedTranscript?.segments.length ?? 0) === 0
                                    : !subtitleText
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-body text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {copyLabel === "Copiado!" ? "check" : "content_copy"}
                              </span>
                              {copyLabel}
                            </button>
                          </div>
                        </div>

                        {activeTab === "original" && (
                          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-body text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Editor por segmentos
                              </p>
                              <p className="font-body text-xs text-slate-500 dark:text-slate-400">
                                O texto original é editável. Speakers aparecem como referência e os downloads serão regenerados após salvar.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleSaveTranscript()}
                              disabled={!isDirty || isSaving || hasRevisionConflict}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-display text-xs font-bold uppercase tracking-[0.24em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSaving ? <Spinner size="sm" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
                              {isSaving ? "Salvando" : "Salvar revisão"}
                            </button>
                          </div>
                        )}

                        {saveMessage && activeTab === "original" && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-body text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300">
                            {saveMessage}
                          </p>
                        )}

                        {hasRevisionConflict && activeTab === "original" && (
                          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900/50 dark:bg-amber-900/10 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-body text-sm font-semibold text-amber-800 dark:text-amber-200">
                                Existe uma revisão mais nova no servidor.
                              </p>
                              <p className="font-body text-xs text-amber-700 dark:text-amber-300">
                                Carregue a revisão {conflictRevision ?? "mais recente"} antes de salvar para evitar sobrescrever o trabalho de outra aba ou sessão.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleReloadLatestRevision}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 font-display text-xs font-bold uppercase tracking-[0.2em] text-amber-800 transition hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                            >
                              <span className="material-symbols-outlined text-[16px]">refresh</span>
                              Carregar versão atual
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-4 sm:p-6">
                        {activeTab === "original" && (
                          <>
                            {!originalTranscript && (
                              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 font-body text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                O transcript original ainda não está pronto.
                              </p>
                            )}

                            {originalTranscript && editableSegments.length === 0 && (
                              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 font-body text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                Nenhum segmento disponível para edição.
                              </p>
                            )}

                            {originalTranscript && editableSegments.length > 0 && (
                              <div className="space-y-4">
                                {editableSegments.map((segment, index) => (
                                  <div
                                    key={`${segment.segmentIndex}-${segment.revision}`}
                                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition focus-within:border-primary/40 focus-within:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:focus-within:bg-slate-900"
                                  >
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                                        {segment.speakerLabel ?? `Segmento ${segment.segmentIndex + 1}`}
                                      </span>
                                      <span className="font-mono text-xs text-slate-400">
                                        {formatTimestampLabel(segment.startSec)} - {formatTimestampLabel(segment.endSec)}
                                      </span>
                                    </div>
                                    <textarea
                                      value={segment.text}
                                      onChange={(event) => {
                                        const next = [...editableSegments];
                                        next[index] = { ...segment, text: event.target.value };
                                        setEditableSegments(next);
                                      }}
                                      rows={Math.max(3, Math.min(8, Math.ceil(segment.text.length / 90)))}
                                      className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 font-body text-sm leading-relaxed text-slate-800 shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        {activeTab === "translated" && (
                          <>
                            {translatedTranscript?.status === "failed" && (
                              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                                <p className="font-body text-sm text-red-700 dark:text-red-300">
                                  {translatedTranscript.errorMessage || "A tradução falhou."}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void handleRetryTranslation()}
                                  disabled={isRetryingTranslation}
                                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 font-body text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                                >
                                  {isRetryingTranslation ? <Spinner size="sm" /> : <span className="material-symbols-outlined text-[16px]">refresh</span>}
                                  Tentar novamente
                                </button>
                              </div>
                            )}

                            {!translatedTranscript && (
                              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 font-body text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                Nenhuma tradução foi solicitada para esta transcrição.
                              </p>
                            )}

                            {translatedTranscript && translatedTranscript.status !== "failed" && translatedTranscript.segments.length === 0 && (
                              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                {(translatedTranscript.status === "processing" || translatedTranscript.status === "regenerating" || translatedTranscript.status === "pending") && (
                                  <Spinner size="sm" className="text-primary" />
                                )}
                                <span className="font-body text-sm">
                                  {translatedTranscript.status === "ready"
                                    ? "A tradução não retornou segmentos."
                                    : "A tradução está sendo processada em paralelo ao transcript original."}
                                </span>
                              </div>
                            )}

                            {translatedTranscript && translatedTranscript.segments.length > 0 && (
                              <div className="space-y-4">
                                {translatedTranscript.segments.map((segment) => (
                                  <div
                                    key={`${segment.segmentIndex}-${segment.revision}`}
                                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                                  >
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
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
                          </>
                        )}

                        {activeTab === "subtitles" && (
                          <div className="min-h-[360px] rounded-2xl border border-slate-200 bg-slate-950 p-4 dark:border-slate-800">
                            {isLoadingSubtitle && (
                              <div className="flex items-center gap-2 text-slate-300">
                                <Spinner size="sm" className="text-primary" />
                                <span className="font-body text-sm">Carregando preview SRT...</span>
                              </div>
                            )}

                            {!isLoadingSubtitle && subtitleError && (
                              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 font-body text-sm text-red-200">
                                {subtitleError}
                              </p>
                            )}

                            {!isLoadingSubtitle && !subtitleError && !subtitleText && (
                              <p className="font-body text-sm text-slate-400">
                                Nenhum arquivo SRT disponível para esta variante.
                              </p>
                            )}

                            {!isLoadingSubtitle && !subtitleError && subtitleText && (
                              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-100">
                                {subtitleText}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <aside className="space-y-4 xl:col-span-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <p className="mb-4 font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Informações
                      </p>
                      <div className="space-y-3">
                        {[
                          { label: "Arquivo", value: fileName, icon: "audio_file" },
                          { label: "Idioma base", value: job.language, icon: "translate" },
                          { label: "Tradução", value: job.translationTargetLanguage ?? "Não solicitada", icon: "language" },
                          { label: "Duração", value: formatDuration(job.durationSeconds), icon: "schedule" },
                          { label: "Segmentos", value: String(editableSegments.length), icon: "segment" },
                          { label: "Concluído", value: formatDateTime(job.completedAt), icon: "event_available" }
                        ].map((item) => (
                          <div key={item.label} className="flex items-start gap-3">
                            <span className="material-symbols-outlined mt-0.5 text-[16px] text-slate-400">
                              {item.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                {item.label}
                              </p>
                              <p className="mt-1 truncate font-body text-sm font-medium text-slate-700 dark:text-slate-300">
                                {item.value}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

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
                                  {available ? "Arquivo pronto para exportação" : "Aguardando regeneração"}
                                </p>
                              </div>
                              {downloadingKey === key ? <Spinner size="sm" /> : <span className="material-symbols-outlined text-[18px] text-slate-400">download</span>}
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
                                    {available ? "Versão derivada pronta" : "Processamento em andamento"}
                                  </p>
                                </div>
                                {downloadingKey === key ? <Spinner size="sm" /> : <span className="material-symbols-outlined text-[18px] text-slate-400">download</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

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
