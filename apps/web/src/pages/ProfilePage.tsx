import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import Spinner from "../components/common/Spinner";
import { ApiError, getErrorMessage, getMe, updateMe } from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { formatDateTime } from "../lib/transcriptions";
import type { PublicUser } from "../lib/types";

export default function ProfilePage() {
  const navigate = useNavigate();

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [user, setUser] = useState<PublicUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");

  const accountCreatedAt = useMemo(
    () => (user ? formatDateTime(user.createdAt) : "--"),
    [user]
  );
  const accountUpdatedAt = useMemo(
    () => (user ? formatDateTime(user.updatedAt) : "--"),
    [user]
  );

  useEffect(() => {
    async function bootstrap() {
      if (!getSessionTokens()) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const me = await getMe();
        setUser(me);
        setName(me.name);
        setEmail(me.email);
        setBootstrapError("");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setBootstrapError(getErrorMessage(error, "Não foi possível carregar o perfil."));
      }

      setIsBootstrapping(false);
    }

    void bootstrap();
  }, [navigate]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedName || !normalizedEmail) {
      setProfileError("Nome e e-mail são obrigatórios.");
      return;
    }

    const payload: {
      name?: string;
      email?: string;
    } = {};

    if (user?.name !== normalizedName) {
      payload.name = normalizedName;
    }
    if (user?.email.toLowerCase() !== normalizedEmail) {
      payload.email = normalizedEmail;
    }

    if (Object.keys(payload).length === 0) {
      setProfileSuccess("Nenhuma alteração para salvar.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const updatedUser = await updateMe(payload);
      setUser(updatedUser);
      setName(updatedUser.name);
      setEmail(updatedUser.email);
      setProfileSuccess("Perfil atualizado com sucesso.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setProfileError(getErrorMessage(error, "Não foi possível atualizar o perfil."));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Preencha todos os campos de senha.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("A confirmação da nova senha não confere.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await updateMe({
        currentPassword,
        newPassword
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Senha atualizada com sucesso.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setPasswordError(getErrorMessage(error, "Não foi possível atualizar a senha."));
    } finally {
      setIsSavingPassword(false);
    }
  }

  function handleLogout() {
    clearSessionTokens();
    navigate("/login", { replace: true });
  }

  if (isBootstrapping) {
    return (
      <main className="grid min-h-screen place-items-center bg-background-dark text-slate-100">
        <div className="flex items-center gap-3">
          <Spinner size="sm" className="text-primary" />
          <span className="font-body text-sm text-slate-400">Carregando perfil...</span>
        </div>
      </main>
    );
  }

  if (bootstrapError && !user) {
    return (
      <main className="font-display text-slate-900 antialiased dark:text-slate-100">
        <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
          <DashboardSidebar user={null} activeMenu="settings" />
          <section className="grid min-w-0 flex-1 place-items-center p-8">
            <article className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-xl font-bold">Perfil indisponível</h2>
              <p className="mt-2 text-sm text-red-400">{bootstrapError}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Sua sessão foi mantida. Assim que a API voltar, acesse novamente.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/dashboard"
                  className="inline-flex min-h-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Voltar ao dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex min-h-0 items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                >
                  Tentar novamente
                </button>
              </div>
            </article>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
        <DashboardSidebar user={user} activeMenu="settings" />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <div className="flex flex-col">
              <h2 className="font-display text-xl font-bold tracking-tight">Perfil</h2>
              <p className="font-body text-xs text-slate-500 dark:text-slate-400">
                Gerencie sua conta e credenciais de acesso.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Link
                to="/dashboard"
                className="inline-flex min-h-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Voltar ao dashboard
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-0 items-center justify-center rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
              >
                Sair
              </button>
            </div>
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">
            <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-12">
              <article className="col-span-12 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
                <div className="mb-6">
                  <h3 className="font-display text-lg font-bold">Dados da conta</h3>
                  <p className="mt-1 font-body text-sm text-slate-500 dark:text-slate-400">
                    Atualize os dados principais usados no login.
                  </p>
                </div>

                <form className="space-y-4" onSubmit={handleProfileSubmit}>
                  <label className="block space-y-2">
                    <span className="font-body text-sm font-semibold">Nome</span>
                    <input
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                      placeholder="Seu nome"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="font-body text-sm font-semibold">E-mail</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                      placeholder="seu@email.com"
                    />
                  </label>

                  {profileError ? (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      {profileError}
                    </p>
                  ) : null}
                  {profileSuccess ? (
                    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                      {profileSuccess}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="inline-flex min-h-0 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-70"
                  >
                    {isSavingProfile ? "Salvando..." : "Salvar alterações"}
                  </button>
                </form>
              </article>

              <aside className="col-span-12 space-y-6 lg:col-span-5">
                <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-6">
                    <h3 className="font-display text-lg font-bold">Segurança</h3>
                    <p className="mt-1 font-body text-sm text-slate-500 dark:text-slate-400">
                      Altere sua senha com validação da senha atual.
                    </p>
                  </div>

                  <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                    <label className="block space-y-2">
                      <span className="font-body text-sm font-semibold">Senha atual</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                        placeholder="••••••••"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="font-body text-sm font-semibold">Nova senha</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                        placeholder="Mínimo 8 caracteres"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="font-body text-sm font-semibold">Confirmar nova senha</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-[#111418]"
                        placeholder="Repita a nova senha"
                      />
                    </label>

                    {passwordError ? (
                      <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        {passwordError}
                      </p>
                    ) : null}
                    {passwordSuccess ? (
                      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                        {passwordSuccess}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={isSavingPassword}
                      className="inline-flex min-h-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-200 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      {isSavingPassword ? "Atualizando..." : "Atualizar senha"}
                    </button>
                  </form>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="space-y-1">
                    <h3 className="font-display text-lg font-bold">Sessão e informações</h3>
                    <p className="font-body text-sm text-slate-500 dark:text-slate-400">
                      Consulte os dados principais da sua conta e encerre a sessão com segurança.
                    </p>
                  </div>

                  <dl className="mt-5 space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#111418]">
                      <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                        <dt className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Conta criada em
                        </dt>
                        <dd className="font-mono text-sm font-medium text-slate-700 dark:text-slate-200 sm:text-right">
                          {accountCreatedAt}
                        </dd>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#111418]">
                      <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                        <dt className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Última atualização
                        </dt>
                        <dd className="font-mono text-sm font-medium text-slate-700 dark:text-slate-200 sm:text-right">
                          {accountUpdatedAt}
                        </dd>
                      </div>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-6 inline-flex min-h-0 w-full items-center justify-center rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
                  >
                    Fazer logout
                  </button>
                </article>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
