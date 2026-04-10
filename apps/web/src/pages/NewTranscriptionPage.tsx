import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import Spinner from "../components/common/Spinner";
import {
  ApiError,
  createTranscription,
  createUploadPresign,
  getErrorMessage,
  getMe
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import type { PublicUser } from "../lib/types";

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

const TRANSLATION_OPTIONS = [
  { code: "", label: "Sem tradução adicional" },
  ...LANGUAGES
];

type UploadState = "idle" | "uploading" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validateFile(file: File): string {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Formato não suportado: ${ext}. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `Arquivo muito grande: ${formatBytes(file.size)}. O limite é 500 MB.`;
  }
  return "";
}

export default function NewTranscriptionPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
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
        setUser(me);
      } catch {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setIsBootstrapping(false);
    }
    void bootstrap();
  }, [navigate]);

  const handleFileChange = useCallback((file: File | null) => {
    setSelectedFile(file);
    setUploadState("idle");
    setStatusMessage("");
    setUploadProgress(0);
    setFileError(file ? validateFile(file) : "");
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0] ?? null;
      handleFileChange(file);
    },
    [handleFileChange]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setUploadState("error");
      setStatusMessage("Selecione um arquivo antes de iniciar.");
      return;
    }
    const err = validateFile(selectedFile);
    if (err) {
      setFileError(err);
      return;
    }

    setUploadState("uploading");
    setStatusMessage("Solicitando URL de upload...");
    setUploadProgress(5);
    setIsSubmitting(true);

    try {
      const presign = await createUploadPresign({
        fileName: selectedFile.name,
        contentType: selectedFile.type || undefined,
        sizeBytes: selectedFile.size
      });

      setStatusMessage("Enviando arquivo...");
      setUploadProgress(20);

      await uploadWithProgress(presign, selectedFile, (pct) => {
        setUploadProgress(20 + Math.round(pct * 0.65));
      });

      setUploadProgress(90);
      setStatusMessage("Criando transcrição...");
      const created = await createTranscription({
        sourceObjectKey: presign.objectKey,
        language,
        features: {
          diarization: true,
          generatePdf: true,
          translationTargetLanguage: translationTargetLanguage || undefined
        }
      });

      setUploadProgress(100);
      setUploadState("success");
      setStatusMessage("Transcrição iniciada com sucesso!");
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
      setStatusMessage(getErrorMessage(error, "Falha ao iniciar a transcrição."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <Spinner size="lg" className="text-primary" />
      </div>
    );
  }

  const canSubmit = !!selectedFile && !fileError && !isSubmitting;

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
        <DashboardSidebar user={user} activeMenu="new-transcription" />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          {/* Header */}
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <h2 className="font-display text-xl font-bold tracking-tight">Nova transcrição</h2>
            <Link
              to="/transcricoes"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-body text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 sm:w-auto"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Voltar
            </Link>
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">

              {/* Upload form */}
              <form
                className="space-y-6 xl:col-span-7"
                onSubmit={handleSubmit}
              >
                {/* Drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all ${
                    isDragging
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : selectedFile && !fileError
                        ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/10"
                        : fileError
                          ? "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-900/10"
                          : "border-slate-300 bg-slate-50 hover:border-primary/50 hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.m4a,.wav,.mp4,.webm,.ogg,.mpeg,audio/*,video/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />

                  {selectedFile && !fileError ? (
                    <>
                      <span className="material-symbols-outlined text-5xl text-emerald-500">
                        audio_file
                      </span>
                      <div className="text-center">
                        <p className="font-body font-semibold text-slate-800 dark:text-slate-100">
                          {selectedFile.name}
                        </p>
                        <p className="font-mono text-sm text-slate-500">
                          {formatBytes(selectedFile.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleFileChange(null); }}
                        className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </>
                  ) : fileError ? (
                    <>
                      <span className="material-symbols-outlined text-5xl text-red-400">
                        error_outline
                      </span>
                      <p className="text-center font-body text-sm text-red-600 dark:text-red-400">
                        {fileError}
                      </p>
                      <p className="font-body text-xs text-slate-400">Clique para escolher outro arquivo</p>
                    </>
                  ) : (
                    <>
                      <span className={`material-symbols-outlined text-5xl transition-colors ${isDragging ? "text-primary" : "text-slate-300 dark:text-slate-600"}`}>
                        upload_file
                      </span>
                      <div className="text-center">
                        <p className="font-body font-semibold text-slate-600 dark:text-slate-300">
                          {isDragging ? "Solte o arquivo aqui" : "Arraste ou clique para selecionar"}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-400">
                          MP3 · M4A · WAV · MP4 · WEBM · OGG · MPEG — até 500 MB
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Language selector */}
                <div className="space-y-2">
                  <label className="font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Idioma do áudio
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-body text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Tradução opcional
                    </label>
                    <select
                      value={translationTargetLanguage}
                      onChange={(e) => setTranslationTargetLanguage(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-body text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {TRANSLATION_OPTIONS.map((lang) => (
                        <option key={lang.code || "none"} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Recursos incluídos
                    </p>
                    <div className="mt-3 space-y-2">
                      {[
                        "Diarização automática habilitada",
                        "PDF gerado automaticamente",
                        translationTargetLanguage
                          ? `Tradução para ${TRANSLATION_OPTIONS.find((item) => item.code === translationTargetLanguage)?.label ?? translationTargetLanguage}`
                          : "Resultado original sem tradução extra"
                      ].map((item) => (
                        <div key={item} className="flex items-start gap-2">
                          <span className="material-symbols-outlined mt-0.5 text-[16px] text-primary">
                            auto_awesome
                          </span>
                          <span className="font-body text-sm text-slate-600 dark:text-slate-300">
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {uploadState === "uploading" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-slate-500">{statusMessage}</span>
                      <span className="font-mono text-xs font-bold text-primary">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error message */}
                {uploadState === "error" && statusMessage && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-body text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {statusMessage}
                  </p>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-display text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size="sm" />
                      <span>{statusMessage || "Processando..."}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                      Iniciar transcrição
                    </>
                  )}
                </button>
              </form>

              {/* Side panel */}
              <aside className="space-y-4 xl:col-span-5">
                {/* Status card */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Status do envio
                  </p>
                  <div className="space-y-3">
                    {(
                      [
                        {
                          step: "Arquivo selecionado",
                          done: !!selectedFile && !fileError,
                          active: false,
                          icon: "attach_file"
                        },
                        {
                          step: "Enviando para o servidor",
                          done: uploadState === "success",
                          active: uploadState === "uploading" && uploadProgress < 90,
                          icon: "cloud_upload"
                        },
                        {
                          step: "Criando transcrição",
                          done: uploadState === "success",
                          active: uploadState === "uploading" && uploadProgress >= 90,
                          icon: "record_voice_over"
                        }
                      ] as const
                    ).map(({ step, done, active, icon }) => (
                      <div key={step} className="flex items-center gap-3">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                            done
                              ? "bg-emerald-100 dark:bg-emerald-900/30"
                              : active
                                ? "bg-primary/10"
                                : "bg-slate-100 dark:bg-slate-800"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              done
                                ? "text-emerald-600"
                                : active
                                  ? "text-primary"
                                  : "text-slate-400"
                            }`}
                          >
                            {done ? "check_circle" : icon}
                          </span>
                        </div>
                        <span
                          className={`font-body text-sm ${
                            done
                              ? "text-emerald-600 dark:text-emerald-400"
                              : active
                                ? "font-medium text-slate-800 dark:text-slate-100"
                                : "text-slate-400"
                          }`}
                        >
                          {step}
                        </span>
                        {active && <Spinner size="sm" className="ml-auto text-primary" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tips card */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Dicas de qualidade
                  </p>
                  <ul className="space-y-2">
                    {[
                      "Áudio limpo garante maior precisão",
                      "Reduza ruído de fundo quando possível",
                      "Confirme o idioma antes de enviar",
                      "A tradução é gerada depois do transcript original",
                      "Depois que o job entrar na fila, você pode fechar o site e voltar mais tarde",
                      "Áudios longos exibem uma previsão inicial de conclusão na tela da transcrição"
                    ].map((tip) => (
                      <li key={tip} className="flex items-start gap-2">
                        <span className="material-symbols-outlined mt-0.5 text-[14px] text-primary">
                          tips_and_updates
                        </span>
                        <span className="font-body text-sm text-slate-500 dark:text-slate-400">
                          {tip}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>

            </div>
          </div>
        </section>
      </div>
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
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(`Falha no upload (status ${xhr.status}).`, xhr.status));
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
