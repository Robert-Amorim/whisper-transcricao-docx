import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getErrorMessage, getMe, login, register } from "../lib/api";
import { clearSessionTokens, getSessionTokens, setSessionTokens } from "../lib/session";

type AuthMode = "login" | "register";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const auth =
        mode === "login"
          ? await login({
              email,
              password
            })
          : await register({
              name: name.trim(),
              email,
              password
            });

      setSessionTokens({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken
      });
      if (mode === "register" && auth.welcomeCredit) {
        window.sessionStorage.setItem("voxora_welcome_credit", auth.welcomeCredit);
      }
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
                    mode === "login"
                      ? "border-b-2 border-primary text-primary"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  } rounded-none`}
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={`flex-1 py-4 text-sm font-bold transition-colors ${
                    mode === "register"
                      ? "border-b-2 border-primary text-primary"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  } rounded-none`}
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                >
                  Criar conta
                </button>
              </div>

              <form className="flex h-full flex-col justify-between p-8" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  {mode === "register" ? (
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

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-medium">Senha</label>
                      {mode === "login" ? (
                        <a className="text-xs text-primary hover:underline" href="#">
                          Esqueci a senha
                        </a>
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

                  {error ? (
                    <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-4 w-full rounded-lg bg-primary py-3 font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-70"
                  >
                    {isSubmitting ? "Enviando..." : mode === "login" ? "Acessar Painel" : "Criar conta"}
                  </button>
                </div>

                <div className="mt-8 border-t border-slate-200 pt-8 dark:border-slate-800">
                  <p className="mb-4 text-center text-xs text-slate-500">Ou continue com</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <img
                        alt="Google Logo"
                        className="h-4 w-4"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAYZ8eX1DdNPujOFfLTRv0bYP3bAlIYtTmLZldKIabIL-q60KmvsAlpwsLvxKBokU2woW5h5DKannmunU8ZDVvkcCfihu2CegpBcZRrxqgnAOCCN0O8Kro3oHJmtlTfrjQcowgGldLXqxrZyVy_hPVwaoqZ-KmfLu780Fk0x4ePma0YF-YMoz4B6X_s5f9ars82IManVQAQD4makVzAJF9MA9iJh5qkNg2JweuUMftETq_CxQ10AeRuKb6M-7DCvHf5MlOwh5BtZW0"
                      />
                      <span className="text-sm">Google</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <img
                        alt="LinkedIn Logo"
                        className="h-4 w-4"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuCR1jkfoAN4IqD-iYJ2pN7kFZRdIlhfpH05rOaiD92hCNSCXnuhzQo51HP2-3tdUfb39Mj-5EOMBoj0kJpwBc_wSyH5MWWUHXRPzgESuql1EMy8tzPBjnTBnCTWvWRJXILpBo2u2rd7XoKedRKbPb6hU5JTzDkO1Q-QPTeL7f4arGTAmBMyN_gz9d2olA1FDaIVrik7-HiNg1MEYdYZDa2DQIiQpDoNHhN_1BeMxnCPuWDfKOc16OnAyEn1eBAvrt84yALGGZjaBBM"
                      />
                      <span className="text-sm">LinkedIn</span>
                    </button>
                  </div>
                </div>
              </form>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
