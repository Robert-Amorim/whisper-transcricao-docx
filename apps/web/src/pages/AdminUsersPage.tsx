import { ChangeEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/admin/AdminShell";
import Spinner from "../components/common/Spinner";
import { ApiError, getErrorMessage, getMe, listAdminUsers } from "../lib/api";
import { clearSessionTokens } from "../lib/session";
import { formatCurrency, formatDateTime } from "../lib/transcriptions";
import { getSupportRoleLabel } from "../lib/support";
import type { AdminUserListItem, PublicUser } from "../lib/types";

type LoadState = "loading" | "ready" | "error";

export default function AdminUsersPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      setLoadState("loading");
      setError("");

      try {
        const [me, response] = await Promise.all([
          getMe(),
          listAdminUsers({ limit: 50, q: query || undefined })
        ]);

        setUser(me);
        setUsers(response.items);
        setLoadState("ready");
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          clearSessionTokens();
          window.location.href = "/login";
          return;
        }
        setError(getErrorMessage(loadError, "Não foi possível carregar os usuários."));
        setLoadState("error");
      }
    }

    void load();
  }, [query]);

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  return (
    <AdminShell
      user={user}
      activeMenu="users"
      title="Usuários"
      subtitle="Busque clientes e membros da equipe para abrir o contexto operacional completo."
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
          <input
            value={query}
            onChange={handleQueryChange}
            placeholder="Buscar por nome ou e-mail"
            className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary"
          />
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          {loadState === "loading" ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Spinner size="sm" className="text-primary" />
            </div>
          ) : loadState === "error" ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-10 text-center text-sm text-red-300">
              {error}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((item) => (
                <Link
                  key={item.id}
                  to={`/admin/users/${item.id}`}
                  className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 transition hover:border-primary/30 md:grid-cols-[minmax(0,1fr)_140px_180px_180px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Perfil</p>
                    <p className="mt-1 text-sm text-slate-200">{getSupportRoleLabel(item.role)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Saldo</p>
                    <p className="mt-1 text-sm text-slate-200">
                      {item.wallet ? formatCurrency(item.wallet.availableBalance) : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Criado em</p>
                    <p className="mt-1 text-sm text-slate-200">{formatDateTime(item.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
