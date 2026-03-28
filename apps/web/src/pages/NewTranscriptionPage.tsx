import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Spinner from "../components/common/Spinner";
import UploadStateGrid from "../components/transcriptions/UploadStateGrid";
import {
  ApiError,
  createTranscription,
  createUploadPresign,
  getErrorMessage,
  getMe,
  uploadToPresignedUrl
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

const ACCEPTED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".mp4", ".webm", ".ogg", ".mpeg"];

const LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "en-US", label: "English (US)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文 (简体)" }
];

type UploadState = "idle" | "uploading" | "success" | "error";

export default function NewTranscriptionPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [userName, setUserName] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      if (!getSessionTokens()) {
        navigate("/login", { replace: true });
        return;
      }
      try {
        const me = await getMe();
        setUserName(me.name);
      } catch {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setIsBootstrapping(false);
    }
    void bootstrap();
  }, [navigate]);

  function validateFile(file: File): string {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Formato não suportado: ${ext}. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`;
    }
    if (file.size > MAX_FILE_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return `Arquivo muito grande: ${mb} MB. O limite é 500 MB.`;
    }
    return "";
  }

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setUploadState("idle");
    setMessage("");
    setUploadProgress(0);
    if (file) {
      setFileError(validateFile(file));
    } else {
      setFileError("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setUploadState("error");
      setMessage("Selecione um arquivo antes de iniciar.");
      return;
    }
    const err = validateFile(selectedFile);
    if (err) {
      setFileError(err);
      return;
    }

    setUploadState("uploading");
    setMessage("Solicitando URL de upload...");
    setUploadProgress(5);
    setIsSubmitting(true);

    try {
      const presign = await createUploadPresign({
        fileName: selectedFile.name,
        contentType: selectedFile.type || undefined,
        sizeBytes: selectedFile.size
      });

      setMessage("Enviando arquivo...");
      setUploadProgress(20);

      await uploadWithProgress(presign, selectedFile, (pct) => {
        setUploadProgress(20 + Math.round(pct * 0.65));
      });

      setUploadProgress(90);
      setMessage("Criando job de transcrição...");
      const created = await createTranscription({
        sourceObjectKey: presign.objectKey,
        language
      });

      setUploadProgress(100);
      setUploadState("success");
      setMessage(`Job criado: ${created.job.id}`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      navigate(`/transcricoes/${created.job.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setUploadState("error");
      setUploadProgress(0);
      setMessage(getErrorMessage(error, "Falha ao iniciar a transcrição."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapping) {
    return (
      <main className="newtx-loading">
        <Spinner size="lg" className="text-primary" />
      </main>
    );
  }

  const fileSizeMb = selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(1) : null;

  return (
    <main className="newtx-page">
      <header className="newtx-topbar">
        <div>
          <p>Voxora</p>
          <h1>Nova Transcrição</h1>
        </div>
        <div className="newtx-topbar-actions">
          <span>{userName || "Usuário"}</span>
          <Link to="/dashboard">Voltar ao dashboard</Link>
        </div>
      </header>

      <section className="newtx-grid">
        <section className="newtx-main">
          <form className="newtx-upload-card" onSubmit={handleSubmit}>
            <h2>Upload do arquivo</h2>
            <p>Formatos aceitos: MP3, M4A, WAV, MP4, WEBM, OGG, MPEG (até 500 MB).</p>

            <label className="newtx-file-picker">
              <span>Selecionar arquivo</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.mp4,.webm,.ogg,.mpeg,audio/*,video/*"
                required
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </label>

            {selectedFile && (
              <p className="text-sm text-slate-500">
                {selectedFile.name} — {fileSizeMb} MB
              </p>
            )}

            {fileError && (
              <p className="text-sm text-red-500">{fileError}</p>
            )}

            <label className="newtx-field">
              Idioma
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="newtx-select"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            {uploadState === "uploading" && (
              <div className="newtx-progress">
                <div className="newtx-progress-bar">
                  <div
                    className="newtx-progress-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="newtx-progress-label">{uploadProgress}%</span>
              </div>
            )}

            <button type="submit" disabled={isSubmitting || !!fileError}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" /> {message || "Processando..."}
                </span>
              ) : (
                "Confirmar e iniciar transcrição"
              )}
            </button>
          </form>

          <UploadStateGrid
            state={uploadState}
            message={message}
            selectedFileName={selectedFile?.name}
          />
        </section>

        <aside className="newtx-side">
          <section className="newtx-panel">
            <h3>Antes de enviar</h3>
            <ul>
              <li>Reduza ruído de fundo quando possível.</li>
              <li>Garanta que o áudio principal esteja nítido.</li>
              <li>Confira extensão e tamanho do arquivo.</li>
              <li>Use o idioma correto para melhor precisão.</li>
            </ul>
          </section>

          <section className="newtx-panel">
            <h3>Passo a passo</h3>
            <code>Seleção do arquivo</code>
            <code>Envio seguro</code>
            <code>Início da transcrição</code>
            <p>Você envia o arquivo, acompanha o andamento e recebe o resultado pronto.</p>
          </section>

          <section className="newtx-panel">
            <h3>Último estado</h3>
            <p>{message || "Nenhum upload recente nesta sessão."}</p>
          </section>
        </aside>
      </section>
    </main>
  );
}

async function uploadWithProgress(
  presign: Awaited<ReturnType<typeof createUploadPresign>>,
  file: File,
  onProgress: (pct: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new ApiError(`Falha no upload (status ${xhr.status}).`, xhr.status));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new ApiError("Erro de rede durante o upload.", 0));
    });

    xhr.open(presign.method ?? "PUT", presign.uploadUrl);

    if (presign.requiredHeaders) {
      for (const [key, value] of Object.entries(presign.requiredHeaders)) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.send(file);
  });
}
