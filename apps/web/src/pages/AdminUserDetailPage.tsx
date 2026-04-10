import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminShell from "../components/admin/AdminShell";
import Spinner from "../components/common/Spinner";
import { ApiError, getAdminUser, getErrorMessage, getMe } from "../lib/api";
import { clearSessionTokens } from "../lib/session";
import { formatCurrency, formatDateTime, formatDuration, getStatusLabel } from "../lib/transcriptions";
import { getSupportCategoryLabel, getSupportRoleLabel, getSupportStatusClassName, getSupportStatusLabel } from "../lib/support";
import type { AdminUserDetail, PublicUser } from "../lib/types";

type LoadState = "loading" | "ready" | "error";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id ?? "";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [operator, setOperator] = useState<PublicUser | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  useEffect(() => {
    async function load() {
      if (!userId) {
        setLoadState("error");
        setError("Usuário inválido.");
        return;
      }

      setLoadState("loading");
      setError("");

      try {
        const [me, currentDetail] = await Promise.all([getMe(), getAdminUser(userId)]);
        setOperator(me);
        setDetail(currentDetail);
        setLoadState("ready");
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          clearSessionTokens();
          window.location.href = "/login";
          return;
        }
        setError(getErrorMessage(loadError, "Não foi possível carregar o usuário."));
        setLoadState("error");
      }
    }

    void load();
  }, [userId]);

  if (loadState === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3">
          <Spinner size="sm" className="text-primary" />
          <span className="text-sm text-slate-400">Carregando usuário...</span>
        </div>
      </main>
    );
  }

  if (loadState === "error" || !detail) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="font-display text-3xl font-black">Usuário indisponível</h1>
          <p className="mt-3 text-sm text-red-300">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <AdminShell
      user={operator}
      activeMenu="users"
      title="Perfil operacional"
      subtitle="Use esta visão para entender histórico, carteira, pagamentos, jobs e atendimentos do usuário."
      actions={
        <Link
          to="/admin/users"
          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Voltar para usuários
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-primary/70">Usuário</p>
            <h2 className="mt-2 font-display text-3xl font-black text-white">{detail.user.name}</h2>
            <p className="mt-2 text-sm text-slate-400">{detail.user.email}</p>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Perfil</p>
                <p className="mt-2 font-semibold text-white">{getSupportRoleLabel(detail.user.role)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Criado em</p>
                <p className="mt-2 font-semibold text-white">{formatDateTime(detail.user.createdAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Carteira</p>
                {detail.wallet ? (
                  <>
                    <p className="mt-2 font-semibold text-white">Disponível: {formatCurrency(detail.wallet.availableBalance)}</p>
                    <p className="mt-1 text-slate-400">Retido: {formatCurrency(detail.wallet.heldBalance)}</p>
                  </>
                ) : (
                  <p className="mt-2 text-slate-400">Sem carteira vinculada.</p>
                )}
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h3 className="font-display text-2xl font-black text-white">Extrato recente</h3>
            <div className="mt-4 space-y-3">
              {detail.ledger.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                  <p className="text-sm font-semibold text-white">{entry.type}</p>
                  <p className="mt-1 text-sm text-slate-400">{formatCurrency(entry.amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                </div>
              ))}
              {detail.ledger.length === 0 ? (
                <p className="text-sm text-slate-500">Sem movimentações recentes.</p>
              ) : null}
            </div>
          </article>
        </aside>

        <section className="space-y-6">
          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-2xl font-black text-white">Pagamentos recentes</h3>
              <span className="text-xs text-slate-500">{detail.payments.length} item(ns)</span>
            </div>
            <div className="space-y-3">
              {detail.payments.map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{formatCurrency(payment.amount)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {payment.method === "credit_card" ? "Cartão" : "PIX"} • {formatDateTime(payment.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))}
              {detail.payments.length === 0 ? (
                <p className="text-sm text-slate-500">Sem pagamentos recentes.</p>
              ) : null}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-2xl font-black text-white">Jobs recentes</h3>
              <span className="text-xs text-slate-500">{detail.jobs.length} item(ns)</span>
            </div>
            <div className="space-y-3">
              {detail.jobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{job.sourceObjectKey}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {getStatusLabel(job.status)} • {formatDuration(job.durationSeconds)} • {formatDateTime(job.createdAt)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">{job.language}</span>
                  </div>
                </div>
              ))}
              {detail.jobs.length === 0 ? (
                <p className="text-sm text-slate-500">Sem jobs recentes.</p>
              ) : null}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-2xl font-black text-white">Tickets vinculados</h3>
              <span className="text-xs text-slate-500">{detail.tickets.length} item(ns)</span>
            </div>
            <div className="space-y-3">
              {detail.tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/admin/tickets/${ticket.id}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 transition hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{ticket.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {getSupportCategoryLabel(ticket.category)} • {formatDateTime(ticket.updatedAt)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSupportStatusClassName(ticket.status)}`}>
                      {getSupportStatusLabel(ticket.status)}
                    </span>
                  </div>
                  {ticket.notes[0] ? (
                    <p className="mt-3 text-sm text-slate-400">
                      Última nota: {ticket.notes[0].body}
                    </p>
                  ) : null}
                </Link>
              ))}
              {detail.tickets.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum ticket associado ao usuário.</p>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </AdminShell>
  );
}
