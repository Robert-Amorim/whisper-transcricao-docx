import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getErrorMessage, getMe, login, register, requestPasswordReset } from "../lib/api";
import { clearSessionTokens, getSessionTokens, setSessionTokens } from "../lib/session";

type AuthMode = "login" | "register";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetDeliveryAvailable, setPasswordResetDeliveryAvailable] = useState(true);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      if (!getSessionTokens()) {
        setIsBootstrapping(false);
        return;
      }

      try {
        await getMe();
        navigate("/dashboard", { replace: true });
        return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
        }
      }

      setIsBootstrapping(false);
    }

    void bootstrap();
  }, [navigate]);

  // Render Turnstile widget when switching to register mode
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || mode !== "register") return;

    const tryRender = () => {
      if (!turnstileRef.current || !window.turnstile) return;
      if (turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        return;
      }
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
        theme: "dark",
      });
    };

    // Script may still be loading
    if (window.turnstile) {
      tryRender();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) { clearInterval(interval); tryRender(); }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
        setTurnstileToken("");
      }
    };
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isForgotPassword) {
        const response = await requestPasswordReset({ email });
        setPasswordResetEmail(email.trim());
        setPasswordResetDeliveryAvailable(response.deliveryAvailable);
        return;
      }

      const auth =
        mode === "login"
          ? await login({
              email,
              password
            })
          : await register({
              name: name.trim(),
              email,
              password,
              ...(TURNSTILE_SITE_KEY ? { turnstileToken } : {})
            });

      if (mode === "register") {
        // Show "check your email" screen if verification email was sent — don't log in yet
        if ((auth as { emailVerificationSent?: boolean }).emailVerificationSent) {
          if (auth.welcomeCredit) {
            window.sessionStorage.setItem("voxora_welcome_credit", auth.welcomeCredit);
          }
          setRegisteredEmail(email);
          return;
        }
      }

      setSessionTokens({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken
      });
      navigate("/dashboard", { replace: true });
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Nao foi possivel autenticar."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapping) {
    return (
      <main className="grid min-h-screen place-items-center bg-background-dark text-slate-100">
        <h1>Verificando sessão...</h1>
      </main>
    );
  }

  if (registeredEmail) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background-dark px-6">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-primary">graphic_eq</span>
            <span className="font-display text-xl font-bold text-white">Voxora</span>
          </div>
          <div className="mb-4 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-[32px] text-primary">mark_email_unread</span>
            </span>
          </div>
          <h1 className="mb-2 font-display text-xl font-bold text-white">Verifique seu e-mail</h1>
          <p className="mb-1 font-body text-sm text-slate-400">
            Enviamos um link de confirmação para:
          </p>
          <p className="mb-6 font-mono text-sm font-semibold text-slate-200">{registeredEmail}</p>
          <p className="font-body text-xs text-slate-500">
            Clique no link do e-mail para ativar sua conta e depois faça login. O link expira em 24 horas.
          </p>
        </div>
      </main>
    );
  }

  if (passwordResetEmail) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background-dark px-6">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-primary">graphic_eq</span>
            <span className="font-display text-xl font-bold text-white">Voxora</span>
          </div>
          <div className="mb-4 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-[32px] text-primary">key</span>
            </span>
          </div>
          <h1 className="mb-2 font-display text-xl font-bold text-white">Verifique seu e-mail</h1>
          <p className="mb-1 font-body text-sm text-slate-400">
            Se existir uma conta vinculada a:
          </p>
          <p className="mb-6 font-mono text-sm font-semibold text-slate-200">{passwordResetEmail}</p>
          <p className="font-body text-xs text-slate-500">
            {passwordResetDeliveryAvailable
              ? "Você receberá um link para criar uma nova senha. O link expira em poucas horas por segurança."
              : "O envio automático de e-mails não está disponível neste ambiente. Se precisar testar este fluxo, configure o provedor SMTP antes de continuar."}
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-6 py-2.5 font-body text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            onClick={() => {
              setPasswordResetEmail("");
              setIsForgotPassword(false);
              setError("");
            }}
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background-light font-display text-slate-900 dark:bg-background-dark dark:text-slate-100">
      <div className="flex min-h-screen items-center justify-center p-6">
        <section className="grid w-full max-w-[1180px] grid-cols-1 items-stretch gap-8 lg:grid-cols-2">
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-800/20 p-8 dark:border-slate-800 dark:bg-primary/5 lg:min-h-[690px]">
            <div>
              <div className="mb-8 flex items-center gap-3">
                <div className="rounded-lg bg-primary p-2">
                  <span className="material-symbols-outlined text-3xl text-white">graphic_eq</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Voxora</h1>
              </div>
              <h2 className="mb-6 text-4xl font-extrabold leading-tight">
                O Som da <span className="text-primary">Clareza</span>
              </h2>

              <div className="mb-12 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-primary">
                    <span className="material-symbols-outlined">verified</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Precisão</h3>
                    <p className="text-slate-500 dark:text-slate-400">
                      Transcrição fiel com inteligência artificial de ponta.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 text-primary">
                    <span className="material-symbols-outlined">bolt</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Velocidade</h3>
                    <p className="text-slate-500 dark:text-slate-400">
                      Resultados em tempo real ou processamento ultra-rápido.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 text-primary">
                    <span className="material-symbols-outlined">shield</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Segurança</h3>
                    <p className="text-slate-500 dark:text-slate-400">
                      Dados criptografados e conformidade com LGPD.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-48 w-full overflow-hidden rounded-lg border border-primary/10 bg-gradient-to-br from-primary/20 to-transparent">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute left-0 top-0 flex h-full w-full items-center justify-around px-4">
                  <div className="h-12 w-1 rounded-full bg-primary" />
                  <div className="h-24 w-1 rounded-full bg-primary" />
                  <div className="h-32 w-1 rounded-full bg-primary" />
                  <div className="h-16 w-1 rounded-full bg-primary" />
                  <div className="h-28 w-1 rounded-full bg-primary" />
                  <div className="h-20 w-1 rounded-full bg-primary" />
                  <div className="h-36 w-1 rounded-full bg-primary" />
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-white/5 bg-slate-900/40 p-4 backdrop-blur-md">
                <p className="text-xs font-mono uppercase tracking-widest text-primary">System Status</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  <span className="text-sm">Todos os sistemas operacionais</span>
                </div>
              </div>
            </div>
          </article>

          <div className="flex flex-col">
            <article className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#1c2127] lg:min-h-[690px]">
              <div className="flex border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="modo de autenticacao">
                <button
                  type="button"
                  className={`flex-1 py-4 text-sm font-bold transition-colors ${
                    mode === "login" && !isForgotPassword
                      ? "border-b-2 border-primary text-primary"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  } rounded-none`}
                  onClick={() => {
                    setMode("login");
                    setIsForgotPassword(false);
                    setError("");
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={`flex-1 py-4 text-sm font-bold transition-colors ${
                    mode === "register" && !isForgotPassword
                      ? "border-b-2 border-primary text-primary"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  } rounded-none`}
                  onClick={() => {
                    setMode("register");
                    setIsForgotPassword(false);
                    setError("");
                  }}
                >
                  Criar conta
                </button>
              </div>

              <form className="flex h-full flex-col justify-between p-8" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  {isForgotPassword ? (
                    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Recuperar acesso</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Informe o e-mail da sua conta para receber um link seguro de redefinição.
                      </p>
                    </div>
                  ) : null}

                  {mode === "register" && !isForgotPassword ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nome</label>
                      <input
                        autoComplete="name"
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Seu nome completo"
                        className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">E-mail</label>
                    <input
                      autoComplete="email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="seu@email.com"
                      className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                    />
                  </div>

                  {!isForgotPassword ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-sm font-medium">Senha</label>
                        {mode === "login" ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-primary transition hover:opacity-80"
                            onClick={() => {
                              setIsForgotPassword(true);
                              setError("");
                              setPassword("");
                              setShowPassword(false);
                            }}
                          >
                            Esqueci minha senha
                          </button>
                        ) : null}
                      </div>
                      <div className="relative">
                        <input
                          autoComplete={mode === "login" ? "current-password" : "new-password"}
                          type={showPassword ? "text" : "password"}
                          minLength={8}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="••••••••"
                          className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                        />
                        <button
                          type="button"
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          <span className="material-symbols-outlined text-xl">
                            {showPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Turnstile CAPTCHA — only in register mode when site key is configured */}
                  {TURNSTILE_SITE_KEY && mode === "register" && !isForgotPassword ? (
                    <div ref={turnstileRef} className="flex justify-center" />
                  ) : null}

                  {error ? (
                    <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      (
                        TURNSTILE_SITE_KEY !== undefined &&
                        mode === "register" &&
                        !isForgotPassword &&
                        !turnstileToken
                      )
                    }
                    className="mt-4 w-full rounded-lg bg-primary py-3 font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-70"
                  >
                    {isSubmitting
                      ? "Enviando..."
                      : isForgotPassword
                        ? "Enviar link de recuperação"
                        : mode === "login"
                          ? "Acessar Painel"
                          : "Criar conta"}
                  </button>

                  {isForgotPassword ? (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-slate-200 py-3 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                      onClick={() => {
                        setIsForgotPassword(false);
                        setError("");
                      }}
                    >
                      Voltar
                    </button>
                  ) : null}
                </div>

              </form>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
