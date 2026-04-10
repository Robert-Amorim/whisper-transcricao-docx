import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/admin/AdminShell";
import NotificationBadge from "../components/common/NotificationBadge";
import Spinner from "../components/common/Spinner";
import {
  ApiError,
  getAdminSupportSummary,
  getErrorMessage,
  getMe,
  listAdminSupportTickets
} from "../lib/api";
import { clearSessionTokens } from "../lib/session";
import { formatDateTime } from "../lib/transcriptions";
import { getSupportStatusClassName, getSupportStatusLabel } from "../lib/support";
import type { AdminSupportSummary, PublicUser, SupportThread } from "../lib/types";

type LoadState = "loading" | "ready" | "error";

const EMPTY_SUMMARY: AdminSupportSummary = {
  openTickets: 0,
  waitingSupport: 0,
  unreadForStaff: 0,
  failedJobsLast24Hours: 0,
  attentionPaymentsLast24Hours: 0
};

export default function AdminDashboardPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [summary, setSummary] = useState<AdminSupportSummary>(EMPTY_SUMMARY);
  const [recentTickets, setRecentTickets] = useState<SupportThread[]>([]);

  useEffect(() => {
    async function load() {
      setLoadState("loading");
      setError("");

      try {
        const [me, currentSummary, tickets] = await Promise.all([
          getMe(),
          getAdminSupportSummary(),
          listAdminSupportTickets({ limit: 8 })
        ]);

        setUser(me);
        setSummary(currentSummary);
        setRecentTickets(tickets.items);
        setLoadState("ready");
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          clearSessionTokens();
          window.location.href = "/login";
          return;
        }
        setError(getErrorMessage(loadError, "Não foi possível carregar o painel interno."));
        setLoadState("error");
      }
    }

    void load();
  }, []);

  if (loadState === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3">
          <Spinner size="sm" className="text-primary" />
          <span className="text-sm text-slate-400">Carregando painel interno...</span>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="font-display text-3xl font-black">Painel indisponível</h1>
          <p className="mt-3 text-sm text-red-300">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <AdminShell
      user={user}
      activeMenu="overview"
      title="Visão operacional"
      subtitle="Acompanhe filas de atendimento, pagamentos sensíveis e incidentes de processamento."
      actions={
        <Link
          to="/admin/tickets"
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Abrir fila de tickets
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Tickets abertos", value: summary.openTickets, icon: "mark_email_unread" },
              { label: "Aguardando suporte", value: summary.waitingSupport, icon: "support_agent" },
              { label: "Nao lidos", value: summary.unreadForStaff, icon: "notifications_active" },
              { label: "Jobs falhos (24h)", value: summary.failedJobsLast24Hours, icon: "error" },
              { label: "Pagamentos sensíveis", value: summary.attentionPaymentsLast24Hours, icon: "payments" }
            ].map((card) => (
              <article
                key={card.label}
                className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/20"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{card.label}</p>
                  <span className="material-symbols-outlined text-primary">{card.icon}</span>
                </div>
                <p className="mt-5 font-display text-4xl font-black tracking-tight text-white">{card.value}</p>
              </article>
            ))}
          </div>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary/70">Fila viva</p>
                <h2 className="mt-2 font-display text-2xl font-black text-white">Tickets recentes</h2>
              </div>
              <Link to="/admin/tickets" className="text-sm font-semibold text-primary hover:opacity-80">
                Ver todos
              </Link>
            </div>

            {recentTickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
                Nenhum ticket recente.
              </div>
            ) : (
              <div className="space-y-3">
                {recentTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to={`/admin/tickets/${ticket.id}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 transition hover:border-primary/30"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{ticket.subject}</p>
                        <NotificationBadge count={ticket.hasUnreadForStaff ? 1 : 0} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {ticket.requester.name ?? ticket.requester.email} • {formatDateTime(ticket.updatedAt)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSupportStatusClassName(ticket.status)}`}>
                      {getSupportStatusLabel(ticket.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </article>
        </section>

        <aside className="space-y-6">
          <article className="rounded-3xl border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,1))] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-primary/70">Playbook MVP</p>
            <h3 className="mt-2 font-display text-2xl font-black text-white">Rotina da equipe</h3>
            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Priorize tickets em <strong className="text-white">novo</strong> e <strong className="text-white">aguardando suporte</strong>.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Use notas internas para contexto antes de responder ao cliente.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Em tickets públicos, responda por e-mail direto do detalhe do ticket.
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Cobertura mínima</p>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>Resposta inicial para pagamento e acesso em prioridade operacional.</p>
              <p>Falhas de job nas últimas 24 horas merecem revisão proativa.</p>
              <p>Tickets resolvidos devem ser encerrados apenas quando o cliente estiver confirmado ou inativo.</p>
            </div>
          </article>
        </aside>
      </div>
    </AdminShell>
  );
}
