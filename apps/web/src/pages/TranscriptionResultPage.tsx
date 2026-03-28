import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "--";
  }

  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
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
  const [previewText, setPreviewText] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setLoadState("error");
      setError("ID da transcricao ausente.");
      return;
    }

    setLoadState("loading");
    try {
      const response = await getTranscription(jobId);
      setJob(response.job);
      setLoadState("ready");
      setError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setLoadState("error");
      setError(getErrorMessage(requestError, "Nao foi possivel carregar o resultado."));
    }
  }, [jobId, navigate]);

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void fetchJob();
  }, [fetchJob, navigate]);

  async function handleDownload(format: OutputFormat) {
    if (!jobId) {
      return;
    }

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

  const txtAvailable = !!job && hasOutputFormat(job, "txt");
  const srtAvailable = !!job && hasOutputFormat(job, "srt");

  const loadTxtPreview = useCallback(async () => {
    if (!jobId || !txtAvailable) {
      setPreviewText("");
      setPreviewError("");
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError("");
    try {
      const text = await getTranscriptionOutputText(jobId, "txt");
      setPreviewText(text);
    } catch (requestError) {
      setPreviewError(
        getErrorMessage(requestError, "Nao foi possivel carregar o preview do texto.")
      );
      setPreviewText("");
    } finally {
      setIsLoadingPreview(false);
    }
  }, [jobId, txtAvailable]);

  useEffect(() => {
    if (loadState === "ready" && txtAvailable) {
      void loadTxtPreview();
    }
  }, [loadState, txtAvailable, loadTxtPreview]);

  return (
    <main className="result-page">
      <header className="result-header">
        <div>
          <p>Transcricoes</p>
          <h1>Resultado concluido</h1>
        </div>
        <div className="result-header-actions">
          <Link to={`/transcricoes/${jobId}`}>Voltar ao detalhe</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>
      </header>

      {loadState === "loading" ? <p className="result-inline">Carregando resultado...</p> : null}
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
            <article>
              <span>Duracao</span>
              <strong>{formatDuration(job.durationSeconds)}</strong>
            </article>
            <article>
              <span>Idioma</span>
              <strong>{job.language}</strong>
            </article>
            <article>
              <span>Status</span>
              <strong>{getStatusLabel(job.status)}</strong>
            </article>
            <article>
              <span>Criado</span>
              <strong>{formatDateTime(job.createdAt)}</strong>
            </article>
            <article>
              <span>Concluido</span>
              <strong>{formatDateTime(job.completedAt)}</strong>
            </article>
            <article>
              <span>Segmentos</span>
              <strong>{job.chunks?.length ?? 0}</strong>
            </article>
          </section>

          <section className="result-grid">
            <section className="result-main-card">
              <h3>Resumo</h3>
              <p>
                O texto completo pode ser baixado em TXT ou SRT. Esta tela consolida os metadados e
                os formatos de exportacao do job concluido.
              </p>
              <div className="result-preview-card">
                <div className="result-preview-head">
                  <strong>Preview do texto (TXT)</strong>
                  <button
                    type="button"
                    onClick={() => void loadTxtPreview()}
                    disabled={!txtAvailable || isLoadingPreview}
                  >
                    {isLoadingPreview ? "Carregando..." : "Atualizar preview"}
                  </button>
                </div>
                {isLoadingPreview ? (
                  <p className="result-inline">Carregando preview...</p>
                ) : null}
                {previewError ? (
                  <p className="result-inline result-inline-error">{previewError}</p>
                ) : null}
                {!isLoadingPreview && !previewError && txtAvailable ? (
                  <pre className="result-preview-text">
                    {previewText || "Nenhum conteúdo disponível no TXT."}
                  </pre>
                ) : null}
                {!txtAvailable ? (
                  <p className="result-inline">O preview fica disponível quando o TXT for gerado.</p>
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
                {downloadingFormat === "txt" ? "Baixando TXT..." : "Baixar TXT"}
              </button>
              <code>Texto completo</code>
              <button
                type="button"
                onClick={() => void handleDownload("srt")}
                disabled={!srtAvailable || downloadingFormat !== null}
              >
                {downloadingFormat === "srt" ? "Baixando SRT..." : "Baixar SRT"}
              </button>
              <code>Legenda sincronizada</code>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
