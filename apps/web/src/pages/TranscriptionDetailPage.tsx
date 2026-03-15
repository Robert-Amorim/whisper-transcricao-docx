import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StatusStateGrid from "../components/common/StatusStateGrid";
import {
  ApiError,
  downloadTranscriptionOutput,
  getErrorMessage,
  getTranscription
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import {
  formatDateTime,
  formatSeconds,
  getStatusLabel,
  getStatusTone,
  hasOutputFormat,
  PROCESSING_STATUSES
} from "../lib/transcriptions";
import type { OutputFormat, TranscriptionJobDetail } from "../lib/types";

type LoadState = "loading" | "ready" | "error";

export default function TranscriptionDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const jobId = useMemo(() => params.id ?? "", [params.id]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [job, setJob] = useState<TranscriptionJobDetail | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<OutputFormat | null>(null);

  const fetchJob = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!jobId) {
        setLoadState("error");
        setError("ID da transcricao ausente.");
        return;
      }

      if (!options?.silent) {
        setLoadState("loading");
      }

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
        setError(getErrorMessage(requestError, "Nao foi possivel carregar a transcricao."));
      }
    },
    [jobId, navigate]
  );

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void fetchJob();
  }, [fetchJob, navigate]);

  useEffect(() => {
    if (!job || !PROCESSING_STATUSES.includes(job.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchJob({ silent: true });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [fetchJob, job]);

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

  const hasProcessingState = !!job && PROCESSING_STATUSES.includes(job.status);
  const canDownloadTxt = !!job && hasOutputFormat(job, "txt");
  const canDownloadSrt = !!job && hasOutputFormat(job, "srt");

  return (
    <main className="tx-page">
      <header className="tx-header">
        <div>
          <p>Transcricoes</p>
          <h1>Detalhe</h1>
        </div>
        <div className="tx-header-actions">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/transcricoes/nova">Nova transcricao</Link>
        </div>
      </header>

      {loadState === "loading" ? <p className="tx-inline">Carregando transcricao...</p> : null}
      {loadState === "error" ? <p className="tx-inline tx-inline-error">{error}</p> : null}

      {loadState === "ready" && job ? (
        <>
          <section className="tx-summary">
            <div>
              <h2>{job.sourceObjectKey.split("/").pop() || job.sourceObjectKey}</h2>
              <p>ID: {job.id}</p>
              <p>Idioma: {job.language}</p>
            </div>
            <div>
              <span className={`db-status db-status-${getStatusTone(job.status)}`}>
                {getStatusLabel(job.status)}
              </span>
            </div>
          </section>

          <section className="tx-grid">
            <section className="tx-main">
              <article className="tx-card">
                <div className="tx-card-head">
                  <h3>Status do processamento</h3>
                  <strong>{PROCESSING_STATUSES.includes(job.status) ? "Em andamento" : "Finalizado"}</strong>
                </div>
                <div className="tx-progress-track">
                  <div
                    className="tx-progress-fill"
                    style={{
                      width:
                        job.status === "completed"
                          ? "100%"
                          : job.status === "processing"
                            ? "68%"
                            : job.status === "queued"
                              ? "30%"
                              : job.status === "validating"
                                ? "15%"
                                : "5%"
                    }}
                  />
                </div>
                <ul className="tx-meta-list">
                  <li>Criado: {formatDateTime(job.createdAt)}</li>
                  <li>Atualizado: {formatDateTime(job.updatedAt)}</li>
                  <li>Concluido: {formatDateTime(job.completedAt)}</li>
                  <li>Duracao: {job.durationSeconds ?? "--"}s</li>
                </ul>
                {hasProcessingState ? (
                  <p className="tx-inline">Atualizacao automatica a cada 5 segundos.</p>
                ) : null}
                {job.status === "failed" && job.errorMessage ? (
                  <p className="tx-inline tx-inline-error">{job.errorMessage}</p>
                ) : null}
              </article>

              <article className="tx-card">
                <div className="tx-card-head">
                  <h3>Segmentos</h3>
                  <code>Detalhes completos do andamento</code>
                </div>
                {!job.chunks || job.chunks.length === 0 ? (
                  <p className="tx-inline">Nenhum chunk registrado ainda.</p>
                ) : (
                  <div className="tx-table-wrap">
                    <table className="tx-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Inicio</th>
                          <th>Fim</th>
                          <th>Status</th>
                          <th>Atualizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.chunks.map((chunk) => (
                          <tr key={`${chunk.chunkIndex}-${chunk.createdAt}`}>
                            <td>{chunk.chunkIndex + 1}</td>
                            <td>{formatSeconds(chunk.startSec)}</td>
                            <td>{formatSeconds(chunk.endSec)}</td>
                            <td>{getStatusLabel(chunk.status)}</td>
                            <td>{formatDateTime(chunk.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </section>

            <aside className="tx-side">
              <article className="tx-card">
                <h3>Painel de acoes</h3>
                <button type="button" onClick={() => void fetchJob()}>
                  Atualizar status
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload("txt")}
                  disabled={!canDownloadTxt || downloadingFormat !== null}
                >
                  {downloadingFormat === "txt" ? "Baixando TXT..." : "Baixar TXT"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload("srt")}
                  disabled={!canDownloadSrt || downloadingFormat !== null}
                >
                  {downloadingFormat === "srt" ? "Baixando SRT..." : "Baixar SRT"}
                </button>
                {job.status === "completed" ? (
                  <Link to={`/transcricoes/${job.id}/resultado`} className="tx-link-button">
                    Ver resultado concluido
                  </Link>
                ) : null}
              </article>

              <article className="tx-card">
                <h3>Preview de estados</h3>
                <StatusStateGrid containerClassName="tx-state-grid" itemBaseClassName="tx-state" />
              </article>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}