import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getErrorMessage, resetPassword } from "../lib/api";

type ResetState = "form" | "success";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<ResetState>("form");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setError("Link de redefinição inválido.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await resetPassword({
        token,
        newPassword
      });
      setState("success");
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "Não foi possível redefinir sua senha."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-dark px-4 py-6 sm:px-6 sm:py-10">
      <section className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/30">
        <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="relative flex flex-col justify-between overflow-hidden border-b border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(43,140,238,0.35),_transparent_38%),linear-gradient(160deg,_rgba(15,23,42,0.96),_rgba(2,6,23,1))] p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 opacity-40">
              <div className="absolute left-8 top-10 h-24 w-24 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute bottom-0 right-0 h-48 w-48 translate-x-10 translate-y-10 rounded-full bg-cyan-400/10 blur-3xl" />
            </div>

            <div className="relative">
              <div className="mb-10 flex items-center gap-3">
                <div className="rounded-2xl bg-primary p-3 text-white shadow-lg shadow-primary/30">
                  <span className="material-symbols-outlined text-[28px]">graphic_eq</span>
                </div>
                <div>
                  <p className="font-display text-2xl font-black tracking-tight text-white">Voxora</p>
                  <p className="text-sm text-slate-400">Recuperação segura de acesso</p>
                </div>
              </div>

              <div className="max-w-md">
                <p className="mb-3 text-sm uppercase tracking-[0.24em] text-primary/80">Segurança de conta</p>
                <h1 className="font-display text-3xl font-black leading-tight text-white sm:text-4xl">
                  Crie uma nova senha e volte ao painel com tranquilidade.
                </h1>
                <p className="mt-5 text-sm leading-7 text-slate-300">
                  O link enviado por e-mail é temporário e foi criado para uma única redefinição. Escolha uma senha forte para proteger suas transcrições e sua carteira.
                </p>
              </div>
            </div>

            <div className="relative grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <span className="material-symbols-outlined text-primary">schedule</span>
                <p className="mt-3 text-sm font-semibold text-white">Link com expiração curta</p>
                <p className="mt-1 text-sm text-slate-400">O acesso temporário fica ativo por algumas horas.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <span className="material-symbols-outlined text-primary">verified_user</span>
                <p className="mt-3 text-sm font-semibold text-white">Troca segura</p>
                <p className="mt-1 text-sm text-slate-400">Após redefinir, o token é invalidado automaticamente.</p>
              </div>
            </div>
          </article>

          <article className="flex items-center bg-slate-950 p-6 sm:p-8">
            <div className="w-full">
              {state === "success" ? (
                <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                      <span className="material-symbols-outlined text-[34px] text-emerald-400">check_circle</span>
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white">Senha atualizada</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Sua nova senha já está ativa. Agora é só voltar ao login e entrar normalmente.
                  </p>
                  <Link
                    to="/login"
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Ir para o login
                  </Link>
                </div>
              ) : (
                <div>
                  <div className="mb-8">
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Nova senha</p>
                    <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-white">
                      Redefinir acesso
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      Use pelo menos 8 caracteres e evite reutilizar senhas antigas.
                    </p>
                  </div>

                  {!token ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
                      <p className="text-sm font-semibold text-red-200">Link inválido</p>
                      <p className="mt-2 text-sm leading-6 text-red-100/80">
                        O token de redefinição não foi encontrado. Solicite um novo e-mail de recuperação.
                      </p>
                      <Link
                        to="/login"
                        className="mt-5 inline-flex items-center justify-center rounded-xl border border-red-400/30 px-5 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/10"
                      >
                        Voltar ao login
                      </Link>
                    </div>
                  ) : (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-200">Nova senha</label>
                        <div className="relative">
                          <input
                            autoComplete="new-password"
                            type={showPassword ? "text" : "password"}
                            minLength={8}
                            required
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            placeholder="Digite sua nova senha"
                            className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 pr-12 text-white outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary"
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

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-200">Confirmar nova senha</label>
                        <div className="relative">
                          <input
                            autoComplete="new-password"
                            type={showConfirmPassword ? "text" : "password"}
                            minLength={8}
                            required
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Repita sua nova senha"
                            className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 pr-12 text-white outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary"
                          />
                          <button
                            type="button"
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                            onClick={() => setShowConfirmPassword((current) => !current)}
                            aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                          >
                            <span className="material-symbols-outlined text-xl">
                              {showConfirmPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {error ? (
                        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                          {error}
                        </p>
                      ) : null}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-70"
                      >
                        {isSubmitting ? "Salvando..." : "Salvar nova senha"}
                      </button>

                      <Link
                        to="/login"
                        className="inline-flex items-center justify-center text-sm font-medium text-slate-400 transition hover:text-slate-200"
                      >
                        Voltar ao login
                      </Link>
                    </form>
                  )}
                </div>
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
