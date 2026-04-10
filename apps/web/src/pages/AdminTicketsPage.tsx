import { ChangeEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/admin/AdminShell";
import NotificationBadge from "../components/common/NotificationBadge";
import Spinner from "../components/common/Spinner";
import { ApiError, getErrorMessage, getMe, listAdminSupportTickets } from "../lib/api";
import { clearSessionTokens } from "../lib/session";
import { formatDateTime } from "../lib/transcriptions";
import {
  getSupportCategoryLabel,
  getSupportStatusClassName,
  getSupportStatusLabel,
  SUPPORT_CATEGORY_OPTIONS
} from "../lib/support";
import type { PublicUser, SupportThread, SupportThreadCategory, SupportThreadStatus } from "../lib/types";

type LoadState = "loading" | "ready" | "error";

const STATUS_OPTIONS: Array<{ value: SupportThreadStatus | "all"; label: string }> = [
  { value: "all", label: "Todos os status" },
  { value: "new", label: "Novo" },
  { value: "open", label: "Aberto" },
  { value: "waiting_user", label: "Aguardando cliente" },
  { value: "waiting_support", label: "Aguardando suporte" },
  { value: "resolved", label: "Resolvido" },
  { value: "closed", label: "Encerrado" }
];

export default function AdminTicketsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tickets, setTickets] = useState<SupportThread[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SupportThreadStatus | "all">("all");
  const [category, setCategory] = useState<SupportThreadCategory | "all">("all");
  const [assignee, setAssignee] = useState<"all" | "me" | "unassigned">("all");

  useEffect(() => {
    async function load() {
      setLoadState("loading");
      setError("");

      try {
        const [me, response] = await Promise.all([
          getMe(),
          listAdminSupportTickets({
            limit: 50,
            q: query || undefined,
            status: status === "all" ? undefined : status,
            category: category === "all" ? undefined : category,
            assignee: assignee === "all" ? undefined : assignee
          })
        ]);

        setUser(me);
        setTickets(response.items);
        setLoadState("ready");
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          clearSessionTokens();
          window.location.href = "/login";
          return;
        }
        setError(getErrorMessage(loadError, "Não foi possível carregar a fila de tickets."));
        setLoadState("error");
      }
    }

    void load();
  }, [assignee, category, query, status]);

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  return (
    <AdminShell
      user={user}
      activeMenu="tickets"
      title="Fila de tickets"
      subtitle="Filtre chamados por status, categoria e responsável para organizar a operação."
    >
      <div className="space-y-6">
        <section className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:grid-cols-4">
          <input
            value={query}
            onChange={handleQueryChange}
            placeholder="Buscar por assunto, nome ou e-mail"
            className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary"
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as SupportThreadStatus | "all")}
            className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportThreadCategory | "all")}
            className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary"
          >
            <option value="all">Todas as categorias</option>
            {SUPPORT_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value as "all" | "me" | "unassigned")}
            className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary"
          >
            <option value="all">Qualquer responsável</option>
            <option value="me">Atribuídos a mim</option>
            <option value="unassigned">Sem responsável</option>
          </select>
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
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
              Nenhum ticket encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  to={`/admin/tickets/${ticket.id}`}
                  className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 transition hover:border-primary/30 md:grid-cols-[minmax(0,1.2fr)_180px_180px_180px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{ticket.subject}</p>
                      <NotificationBadge count={ticket.hasUnreadForStaff ? 1 : 0} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {ticket.requester.name ?? ticket.requester.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Categoria</p>
                    <p className="mt-1 text-sm text-slate-200">{getSupportCategoryLabel(ticket.category)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Responsável</p>
                    <p className="mt-1 text-sm text-slate-200">{ticket.assignee?.name ?? "Não atribuído"}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3 md:justify-end">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Atualizado</p>
                      <p className="mt-1 text-sm text-slate-200">{formatDateTime(ticket.updatedAt)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSupportStatusClassName(ticket.status)}`}>
                      {getSupportStatusLabel(ticket.status)}
                    </span>
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
