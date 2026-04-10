import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminShell from "../components/admin/AdminShell";
import Spinner from "../components/common/Spinner";
import {
  ApiError,
  createAdminSupportMessage,
  createAdminSupportNote,
  getAdminSupportTicket,
  getErrorMessage,
  getMe,
  linkAdminSupportTicketUser,
  listAdminUsers,
  updateAdminSupportTicket
} from "../lib/api";
import { clearSessionTokens } from "../lib/session";
import { formatCurrency, formatDateTime, formatDuration, getStatusLabel } from "../lib/transcriptions";
import {
  getSupportCategoryLabel,
  getSupportRoleLabel,
  getSupportStatusClassName,
  getSupportStatusLabel
} from "../lib/support";
import type {
  AdminSupportThreadDetail,
  AdminUserListItem,
  PublicUser,
  SupportMessageDeliveryChannel,
  SupportThreadStatus
} from "../lib/types";

type LoadState = "loading" | "ready" | "error";

const STATUS_OPTIONS: SupportThreadStatus[] = [
  "new",
  "open",
  "waiting_user",
  "waiting_support",
  "resolved",
  "closed"
];

export default function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const threadId = params.id ?? "";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [thread, setThread] = useState<AdminSupportThreadDetail | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [messageChannel, setMessageChannel] = useState<SupportMessageDeliveryChannel>("in_app");
  const [noteBody, setNoteBody] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<SupportThreadStatus>("open");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [linkUserId, setLinkUserId] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSendingNote, setIsSendingNote] = useState(false);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [feedback, setFeedback] = useState("");

  const staffCandidates = useMemo(
    () => users.filter((candidate) => candidate.role === "support" || candidate.role === "admin"),
    [users]
  );

  async function load() {
    if (!threadId) {
      setLoadState("error");
      setError("Ticket inválido.");
      return;
    }

    setLoadState("loading");
    setError("");

    try {
      const [me, detail, userList] = await Promise.all([
        getMe(),
        getAdminSupportTicket(threadId),
        listAdminUsers({ limit: 100 })
      ]);

      setUser(me);
      setThread(detail.thread);
      setUsers(userList.items);
      setSelectedStatus(detail.thread.status);
      setSelectedAssignee(detail.thread.assignee?.userId ?? "");
      setLinkUserId(detail.thread.requester.userId ?? "");
      setLoadState("ready");
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        clearSessionTokens();
        window.location.href = "/login";
        return;
      }
      setError(getErrorMessage(loadError, "Não foi possível carregar o ticket."));
      setLoadState("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) return;
    setIsSendingMessage(true);
    setFeedback("");
    try {
      const response = await createAdminSupportMessage(thread.id, {
        body: messageBody,
        deliveryChannel: messageChannel,
        isPublic: true
      });
      setThread(response.thread);
      setMessageBody("");
      setSelectedStatus(response.thread.status);
      setFeedback(
        messageChannel === "email"
          ? "Resposta enviada por e-mail e registrada no ticket."
          : "Resposta adicionada ao ticket."
      );
    } catch (sendError) {
      setFeedback(getErrorMessage(sendError, "Não foi possível responder ao ticket."));
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) return;
    setIsSendingNote(true);
    setFeedback("");
    try {
      const response = await createAdminSupportNote(thread.id, { body: noteBody });
      setThread(response.thread);
      setNoteBody("");
      setFeedback("Nota interna adicionada.");
    } catch (noteError) {
      setFeedback(getErrorMessage(noteError, "Não foi possível salvar a nota interna."));
    } finally {
      setIsSendingNote(false);
    }
  }

  async function handleUpdateMeta() {
    if (!thread) return;
    setIsSavingMeta(true);
    setFeedback("");
    try {
      const response = await updateAdminSupportTicket(thread.id, {
        status: selectedStatus,
        assigneeUserId: selectedAssignee || null
      });
      setThread(response.thread);
      setFeedback("Ticket atualizado.");
    } catch (metaError) {
      setFeedback(getErrorMessage(metaError, "Não foi possível atualizar o ticket."));
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleLinkUser() {
    if (!thread || !linkUserId) return;
    setIsLinking(true);
    setFeedback("");
    try {
      const response = await linkAdminSupportTicketUser(thread.id, {
        userId: linkUserId
      });
      setThread(response.thread);
      setFeedback("Usuário vinculado ao ticket.");
    } catch (linkError) {
      setFeedback(getErrorMessage(linkError, "Não foi possível vincular o usuário."));
    } finally {
      setIsLinking(false);
    }
  }

  if (loadState === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3">
          <Spinner size="sm" className="text-primary" />
          <span className="text-sm text-slate-400">Carregando ticket...</span>
        </div>
      </main>
    );
  }

  if (loadState === "error" || !thread) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="font-display text-3xl font-black">Ticket indisponível</h1>
          <p className="mt-3 text-sm text-red-300">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <AdminShell
      user={user}
      activeMenu="tickets"
      title="Detalhe do ticket"
      subtitle="Converse com o cliente, registre contexto interno e acompanhe os sinais operacionais."
      actions={
        <Link
          to="/admin/tickets"
          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Voltar para a fila
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <section className="space-y-6">
          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary/70">
                  {getSupportCategoryLabel(thread.category)}
                </p>
                <h2 className="mt-2 font-display text-3xl font-black text-white">{thread.subject}</h2>
                <p className="mt-3 text-sm text-slate-400">
                  {thread.requester.name ?? thread.requester.email} • {thread.channel === "public_form" ? "Contato público" : "Ticket in-app"}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getSupportStatusClassName(thread.status)}`}>
                {getSupportStatusLabel(thread.status)}
              </span>
            </div>

            {feedback ? (
              <p className="mt-5 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-slate-200">
                {feedback}
              </p>
            ) : null}
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-2xl font-black text-white">Conversa</h3>
              <p className="text-xs text-slate-500">Atualizado em {formatDateTime(thread.updatedAt)}</p>
            </div>

            <div className="space-y-4">
              {thread.messages.map((message) => {
                const isInternal = !message.isPublic;
                const tone =
                  message.authorRole === "customer"
                    ? "border-primary/20 bg-primary/10"
                    : isInternal
                      ? "border-amber-500/20 bg-amber-500/10"
                      : "border-slate-800 bg-slate-950/70";

                return (
                  <div key={message.id} className={`rounded-2xl border px-4 py-4 ${tone}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {message.authorName ?? getSupportRoleLabel(message.authorRole === "customer" ? "customer" : message.authorRole)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {message.deliveryChannel === "email" ? "Email" : "Plataforma"} • {formatDateTime(message.createdAt)}
                      </p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{message.body}</p>
                  </div>
                );
              })}
            </div>

            <form className="mt-6 space-y-4 border-t border-slate-800 pt-6" onSubmit={handleSendMessage}>
              <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Canal</label>
                  <select
                    value={messageChannel}
                    onChange={(event) => setMessageChannel(event.target.value as SupportMessageDeliveryChannel)}
                    className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                  >
                    <option value="in_app">Resposta in-app</option>
                    <option value="email">Resposta por e-mail</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Mensagem</label>
                  <textarea
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    className="min-h-[140px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none transition focus:ring-2 focus:ring-primary"
                    placeholder="Escreva a próxima resposta para o cliente."
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSendingMessage}
                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-70"
              >
                {isSendingMessage ? "Enviando..." : "Enviar resposta"}
              </button>
            </form>
          </article>
        </section>

        <aside className="space-y-6">
          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h3 className="font-display text-2xl font-black text-white">Controle do ticket</h3>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Status</label>
                <select
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.target.value as SupportThreadStatus)}
                  className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getSupportStatusLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Responsável</label>
                <select
                  value={selectedAssignee}
                  onChange={(event) => setSelectedAssignee(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sem responsável</option>
                  {staffCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} • {getSupportRoleLabel(candidate.role)}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={isSavingMeta}
                onClick={() => void handleUpdateMeta()}
                className="w-full rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-70"
              >
                {isSavingMeta ? "Salvando..." : "Salvar status e responsável"}
              </button>
            </div>

            {user?.role === "admin" ? (
              <div className="mt-6 border-t border-slate-800 pt-6">
                <h4 className="text-sm font-semibold text-white">Vincular a um usuário</h4>
                <select
                  value={linkUserId}
                  onChange={(event) => setLinkUserId(event.target.value)}
                  className="mt-3 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                >
                  <option value="">Selecionar usuário</option>
                  {users
                    .filter((candidate) => candidate.role === "customer")
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} • {candidate.email}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!linkUserId || isLinking}
                  onClick={() => void handleLinkUser()}
                  className="mt-3 w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {isLinking ? "Vinculando..." : "Vincular usuário"}
                </button>
              </div>
            ) : null}
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h3 className="font-display text-2xl font-black text-white">Notas internas</h3>
            <div className="mt-4 space-y-3">
              {thread.notes.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-sm text-slate-500">
                  Nenhuma nota interna registrada.
                </p>
              ) : (
                thread.notes.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{note.authorName}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{note.body}</p>
                  </div>
                ))
              )}
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleAddNote}>
              <textarea
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                className="min-h-[120px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none transition focus:ring-2 focus:ring-primary"
                placeholder="Registre contexto interno, hipótese ou ação futura."
                required
              />
              <button
                type="submit"
                disabled={isSendingNote}
                className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-70"
              >
                {isSendingNote ? "Salvando..." : "Adicionar nota"}
              </button>
            </form>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h3 className="font-display text-2xl font-black text-white">Contexto operacional</h3>

            <div className="mt-5 space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cliente</p>
                <p className="mt-2 font-semibold text-white">{thread.requester.name ?? "Contato sem conta"}</p>
                <p className="mt-1 text-slate-400">{thread.requester.email}</p>
                {thread.requester.userId ? (
                  <Link to={`/admin/users/${thread.requester.userId}`} className="mt-3 inline-flex text-xs font-semibold text-primary">
                    Abrir perfil do usuário
                  </Link>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Carteira</p>
                {thread.operationalContext.wallet ? (
                  <>
                    <p className="mt-2 font-semibold text-white">
                      Disponível: {formatCurrency(thread.operationalContext.wallet.availableBalance)}
                    </p>
                    <p className="mt-1 text-slate-400">
                      Retido: {formatCurrency(thread.operationalContext.wallet.heldBalance)}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-slate-400">Sem carteira vinculada.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Jobs recentes</p>
                <div className="mt-3 space-y-2">
                  {thread.operationalContext.jobs.slice(0, 4).map((job) => (
                    <div key={job.id} className="rounded-xl border border-slate-800 px-3 py-3">
                      <p className="truncate font-medium text-white">{job.sourceObjectKey}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {getStatusLabel(job.status)} • {formatDuration(job.durationSeconds)}
                      </p>
                    </div>
                  ))}
                  {thread.operationalContext.jobs.length === 0 ? (
                    <p className="text-slate-500">Nenhum job recente.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        </aside>
      </div>
    </AdminShell>
  );
}
