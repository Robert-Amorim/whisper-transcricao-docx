import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Spinner from "../components/common/Spinner";
import StatusStateGrid from "../components/common/StatusStateGrid";
import {
  ApiError,
  downloadTranscriptionOutput,
  getErrorMessage,
  getTranscriptionOutputText,
  getTranscription
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { formatDateTime, getStatusLabel, hasOutputFormat } from "../lib/transcriptions";
import type { OutputFormat, TranscriptionJobDetail } from "../lib/types";

type LoadState = "loading" | "ready" | "error";
type PreviewTab = "txt" | "srt";

function formatDuration(seconds: number | null) {
  if (seconds === null) return "--";
  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600).toString().padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const ss = Math.floor(total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function TranscriptionResultPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const jobId = useMemo(() => params.id ?? "", [params.id]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [job, setJob] = useState<TranscriptionJobDetail | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<OutputFormat | null>(null);

  const [previewTab, setPreviewTab] = useState<PreviewTab>("txt");
  const [txtText, setTxtText] = useState("");
  const [srtText, setSrtText] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copiar");

  const fetchJob = useCallback(async () => {
    if (!jobId) { setLoadState("error"); setError("ID da transcrição ausente."); return; }
    setLoadState("loading");
    try {
      const response = await getTranscription(jobId);
      setJob(response.job);
      setLoadState("ready");
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSessionTokens(); navigate("/login", { replace: true }); return;
      }
      setLoadState("error");
      setError(getErrorMessage(requestError, "Não foi possível carregar o resultado."));
    }
  }, [jobId, navigate]);

  useEffect(() => {
    if (!getSessionTokens()) { navigate("/login", { replace: true }); return; }
    void fetchJob();
  }, [fetchJob, navigate]);

  const txtAvailable = !!job && hasOutputFormat(job, "txt");
  const srtAvailable = !!job && hasOutputFormat(job, "srt");

  const loadPreview = useCallback(async (format: PreviewTab) => {
    const available = format === "txt" ? txtAvailable : srtAvailable;
    if (!jobId || !available) return;

    setIsLoadingPreview(true);
    setPreviewError("");
    try {
      const text = await getTranscriptionOutputText(jobId, format);
      if (format === "txt") setTxtText(text);
      else setSrtText(text);
    } catch (requestError) {
      setPreviewError(getErrorMessage(requestError, "Não foi possível carregar o preview."));
    } finally {
      setIsLoadingPreview(false);
    }
  }, [jobId, txtAvailable, srtAvailable]);

  useEffect(() => {
    if (loadState === "ready" && txtAvailable) void loadPreview("txt");
  }, [loadState, txtAvailable, loadPreview]);

  async function handleDownload(format: OutputFormat) {
    if (!jobId) return;
    setDownloadingFormat(format);
    try {
      const result = await downloadTranscriptionOutput(jobId, format);
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
      setDownloadingFormat(null);
    }
  }

  async function handleCopy() {
    const text = previewTab === "txt" ? txtText : srtText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("Copiado!");
      setTimeout(() => setCopyLabel("Copiar"), 2000);
    } catch {
      setCopyLabel("Erro");
      setTimeout(() => setCopyLabel("Copiar"), 2000);
    }
  }

  const currentPreviewText = previewTab === "txt" ? txtText : srtText;
  const currentAvailable = previewTab === "txt" ? txtAvailable : srtAvailable;

  return (
    <main className="result-page">
      <header className="result-header">
        <div>
          <p>Transcrições</p>
          <h1>Resultado concluído</h1>
        </div>
        <div className="result-header-actions">
          <Link to={`/transcricoes/${jobId}`}>Voltar ao detalhe</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>
      </header>

      {loadState === "loading" ? (
        <div className="result-inline flex items-center gap-2">
          <Spinner size="sm" className="text-primary" />
          <span>Carregando resultado...</span>
        </div>
      ) : null}
      {loadState === "error" ? <p className="result-inline result-inline-error">{error}</p> : null}

      {loadState === "ready" && job ? (
        <>
          <section className="result-status">
            <div>
              <h2>{job.sourceObjectKey.split("/").pop() || job.sourceObjectKey}</h2>
              <p>ID: {job.id}</p>
            </div>
            <span className={`db-status db-status-${job.status === "completed" ? "completed" : "processing"}`}>
              {getStatusLabel(job.status)}
            </span>
          </section>

          <section className="result-metadata-grid">
            <article><span>Duração</span><strong>{formatDuration(job.durationSeconds)}</strong></article>
            <article><span>Idioma</span><strong>{job.language}</strong></article>
            <article><span>Status</span><strong>{getStatusLabel(job.status)}</strong></article>
            <article><span>Criado</span><strong>{formatDateTime(job.createdAt)}</strong></article>
            <article><span>Concluído</span><strong>{formatDateTime(job.completedAt)}</strong></article>
            <article><span>Segmentos</span><strong>{job.chunks?.length ?? 0}</strong></article>
          </section>

          <section className="result-grid">
            <section className="result-main-card">
              <h3>Preview do resultado</h3>

              {/* Tab selector */}
              <div className="result-preview-tabs">
                <button
                  type="button"
                  className={`result-preview-tab ${previewTab === "txt" ? "result-preview-tab-active" : ""}`}
                  onClick={() => {
                    setPreviewTab("txt");
                    if (!txtText && txtAvailable) void loadPreview("txt");
                  }}
                >
                  TXT
                </button>
                <button
                  type="button"
                  className={`result-preview-tab ${previewTab === "srt" ? "result-preview-tab-active" : ""}`}
                  disabled={!srtAvailable}
                  onClick={() => {
                    setPreviewTab("srt");
                    if (!srtText && srtAvailable) void loadPreview("srt");
                  }}
                >
                  SRT {!srtAvailable ? "(indisponível)" : ""}
                </button>
              </div>

              <div className="result-preview-card">
                <div className="result-preview-head">
                  <strong>Preview — {previewTab.toUpperCase()}</strong>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!currentPreviewText}
                      className="result-copy-btn"
                    >
                      {copyLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadPreview(previewTab)}
                      disabled={!currentAvailable || isLoadingPreview}
                    >
                      {isLoadingPreview ? <Spinner size="sm" /> : "Atualizar"}
                    </button>
                  </div>
                </div>

                {isLoadingPreview ? (
                  <div className="result-inline flex items-center gap-2">
                    <Spinner size="sm" className="text-primary" />
                    <span>Carregando preview...</span>
                  </div>
                ) : null}
                {previewError ? <p className="result-inline result-inline-error">{previewError}</p> : null}
                {!isLoadingPreview && !previewError && currentAvailable ? (
                  <pre className="result-preview-text">
                    {currentPreviewText || "Nenhum conteúdo disponível."}
                  </pre>
                ) : null}
                {!currentAvailable ? (
                  <p className="result-inline">
                    O preview fica disponível quando o {previewTab.toUpperCase()} for gerado.
                  </p>
                ) : null}
              </div>

              <StatusStateGrid
                containerClassName="result-state-row"
                itemBaseClassName="result-state"
              />
            </section>

            <aside className="result-export-card">
              <h3>Exportar arquivo</h3>
              <button
                type="button"
                onClick={() => void handleDownload("txt")}
                disabled={!txtAvailable || downloadingFormat !== null}
              >
                {downloadingFormat === "txt" ? <><Spinner size="sm" /> Baixando...</> : "Baixar TXT"}
              </button>
              <code>Texto completo</code>
              <button
                type="button"
                onClick={() => void handleDownload("srt")}
                disabled={!srtAvailable || downloadingFormat !== null}
              >
                {downloadingFormat === "srt" ? <><Spinner size="sm" /> Baixando...</> : "Baixar SRT"}
              </button>
              <code>Legenda sincronizada</code>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
