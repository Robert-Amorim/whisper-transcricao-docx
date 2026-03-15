import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

type UploadState = "idle" | "uploading" | "success" | "error";

export default function NewTranscriptionPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [userName, setUserName] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("pt-BR");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setUploadState("error");
      setMessage("Selecione um arquivo antes de iniciar.");
      return;
    }

    setUploadState("uploading");
    setMessage("Solicitando URL de upload...");
    setIsSubmitting(true);

    try {
      const presign = await createUploadPresign({
        fileName: selectedFile.name,
        contentType: selectedFile.type || undefined,
        sizeBytes: selectedFile.size
      });

      setMessage("Enviando arquivo para storage...");
      await uploadToPresignedUrl(presign, selectedFile);

      setMessage("Criando job de transcricao...");
      const created = await createTranscription({
        sourceObjectKey: presign.objectKey,
        language
      });

      setUploadState("success");
      setMessage(`Job criado com sucesso: ${created.job.id}`);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      navigate(`/transcricoes/${created.job.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setUploadState("error");
      setMessage(getErrorMessage(error, "Falha ao iniciar a transcricao."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapping) {
    return (
      <main className="newtx-loading">
        <h1>Carregando...</h1>
      </main>
    );
  }

  return (
    <main className="newtx-page">
      <header className="newtx-topbar">
        <div>
          <p>Whisper SaaS</p>
          <h1>Nova Transcricao</h1>
        </div>
        <div className="newtx-topbar-actions">
          <span>{userName || "Usuario"}</span>
          <Link to="/dashboard">Voltar ao dashboard</Link>
        </div>
      </header>

      <section className="newtx-grid">
        <section className="newtx-main">
          <form className="newtx-upload-card" onSubmit={handleSubmit}>
            <h2>Upload do arquivo</h2>
            <p>Formatos aceitos: MP3, M4A, WAV, MP4, WEBM, OGG, MPEG (ate 500MB).</p>

            <label className="newtx-file-picker">
              <span>Selecionar arquivo</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.mp4,.webm,.ogg,.mpeg,audio/*,video/*"
                required
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setUploadState("idle");
                  setMessage("");
                }}
              />
            </label>

            <label className="newtx-field">
              Idioma
              <input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="pt-BR"
                maxLength={16}
              />
            </label>

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Processando..." : "Confirmar e iniciar transcricao"}
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
              <li>Reduza ruido de fundo quando possivel.</li>
              <li>Garanta que o audio principal esteja nitido.</li>
              <li>Confira extensao e tamanho do arquivo.</li>
              <li>Use idioma correto para melhor precisao.</li>
            </ul>
          </section>

          <section className="newtx-panel">
            <h3>Passo a passo</h3>
            <code>Selecao do arquivo</code>
            <code>Envio seguro</code>
            <code>Inicio da transcricao</code>
            <p>Voce envia o arquivo, acompanha o andamento e recebe o resultado pronto.</p>
          </section>

          <section className="newtx-panel">
            <h3>Ultimo estado</h3>
            <p>{message || "Nenhum upload recente nesta sessao."}</p>
          </section>
        </aside>
      </section>
    </main>
  );
}