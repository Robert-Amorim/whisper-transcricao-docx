import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import NotificationBadge from "../components/common/NotificationBadge";
import Spinner from "../components/common/Spinner";
import {
  ApiError,
  createSupportTicket,
  createSupportTicketMessage,
  getSupportSummary,
  getErrorMessage,
  getMe,
  getSupportTicket,
  listSupportTickets
} from "../lib/api";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { formatDateTime } from "../lib/transcriptions";
import {
  getSupportCategoryLabel,
  getSupportStatusClassName,
  getSupportStatusLabel,
  isOpenSupportThread,
  SUPPORT_CATEGORY_OPTIONS
} from "../lib/support";
import type {
  PublicUser,
  SupportSummary,
  SupportThread,
  SupportThreadCategory,
  SupportThreadDetail
} from "../lib/types";
import { useNavigate } from "react-router-dom";

type LoadState = "loading" | "ready" | "error";

const EMPTY_SUPPORT_SUMMARY: SupportSummary = {
  openTickets: 0,
  unreadReplies: 0
};

export default function SupportPage() {
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tickets, setTickets] = useState<SupportThread[]>([]);
  const [summary, setSummary] = useState<SupportSummary>(EMPTY_SUPPORT_SUMMARY);
  const [selectedId, setSelectedId] = useState("");
  const [selectedThread, setSelectedThread] = useState<SupportThreadDetail | null>(null);
  const [pageError, setPageError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [category, setCategory] = useState<SupportThreadCategory>("acesso");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyBody, setReplyBody] = useState("");

  function validateCreateTicketForm() {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (trimmedSubject.length < 4) {
      return "O assunto precisa ter pelo menos 4 caracteres.";
    }

    if (trimmedMessage.length < 10) {
      return "A mensagem precisa ter pelo menos 10 caracteres para abrir o ticket.";
    }

    return null;
  }

  async function bootstrap() {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }

    setLoadState("loading");
    setPageError("");

      try {
      const [me, ticketList, ticketSummary] = await Promise.all([
        getMe(),
        listSupportTickets({ limit: 50 }),
        getSupportSummary()
      ]);

      setUser(me);
      setTickets(ticketList.items);
      setSummary(ticketSummary);

      const nextSelectedId =
        selectedId && ticketList.items.some((item) => item.id === selectedId)
          ? selectedId
          : ticketList.items[0]?.id ?? "";

      setSelectedId(nextSelectedId);
      setLoadState("ready");

      if (nextSelectedId) {
        const detail = await getSupportTicket(nextSelectedId);
        setSelectedThread(detail.thread);
        setTickets((current) =>
          current.map((ticket) =>
            ticket.id === nextSelectedId
              ? {
                  ...ticket,
                  hasUnreadForCustomer: false
                }
              : ticket
          )
        );
        setSummary((current) => ({
          ...current,
          unreadReplies: Math.max(
            0,
            ticketList.items.filter((ticket) => ticket.hasUnreadForCustomer && ticket.id !== nextSelectedId).length
          )
        }));
      } else {
        setSelectedThread(null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
        return;
      }
      setPageError(getErrorMessage(error, "Não foi possível carregar seus tickets."));
      setLoadState("error");
    }
  }

  async function openTicket(threadId: string) {
    setSelectedId(threadId);
    setDetailError("");
    setIsRefreshing(true);
    try {
      const detail = await getSupportTicket(threadId);
      setSelectedThread(detail.thread);
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === threadId
            ? {
                ...ticket,
                hasUnreadForCustomer: false
              }
            : ticket
        )
      );
      setSummary((current) => ({
        ...current,
        unreadReplies: Math.max(
          0,
          tickets.filter((ticket) => ticket.hasUnreadForCustomer && ticket.id !== threadId).length
        )
      }));
    } catch (error) {
      setDetailError(getErrorMessage(error, "Não foi possível carregar o ticket selecionado."));
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const openTicketsCount = useMemo(
    () => tickets.filter((ticket) => isOpenSupportThread(ticket.status)).length,
    [tickets]
  );
  const unreadRepliesCount = useMemo(
    () => tickets.filter((ticket) => ticket.hasUnreadForCustomer).length,
    [tickets]
  );

  async function handleCreateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    const validationMessage = validateCreateTicketForm();
    if (validationMessage) {
      setFeedback(validationMessage);
      return;
    }

    setIsCreating(true);

    try {
      const created = await createSupportTicket({
        category,
        subject: subject.trim(),
        message: message.trim()
      });
      setSubject("");
      setMessage("");
      setSelectedId(created.thread.id);
      setSelectedThread(created.thread);
      setFeedback("Ticket criado. Nossa equipe já pode responder por aqui.");
      await bootstrap();
    } catch (error) {
      setFeedback(getErrorMessage(error, "Não foi possível criar seu ticket."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;
    setIsSending(true);
    setDetailError("");

    try {
      const updated = await createSupportTicketMessage(selectedThread.id, { body: replyBody });
      setSelectedThread(updated.thread);
      setReplyBody("");
      await bootstrap();
    } catch (error) {
      setDetailError(getErrorMessage(error, "Não foi possível enviar sua mensagem."));
    } finally {
      setIsSending(false);
    }
  }

  if (loadState === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-background-dark text-slate-100">
        <div className="flex items-center gap-3">
          <Spinner size="sm" className="text-primary" />
          <span className="text-sm text-slate-400">Carregando suporte...</span>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="font-body text-slate-900 antialiased dark:text-slate-100">
        <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
          <DashboardSidebar user={user} activeMenu="support" />
          <section className="grid min-w-0 flex-1 place-items-center p-8">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-2xl font-black">Suporte indisponível</h2>
              <p className="mt-3 text-sm text-red-400">{pageError}</p>
              <button
                type="button"
                onClick={() => void bootstrap()}
                className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Tentar novamente
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
        <DashboardSidebar user={user} activeMenu="support" />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">Suporte</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Abra chamados, acompanhe respostas e mantenha o contexto com a equipe.
              </p>
            </div>
            <div className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
              <span className="flex items-center gap-2">
                <NotificationBadge count={unreadRepliesCount || summary.unreadReplies} className="bg-primary/90" />
                <span>
                  {openTicketsCount || summary.openTickets} ticket(s) em andamento
                </span>
              </span>
            </div>
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-6">
                <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-primary/80">Novo ticket</p>
                    <h3 className="mt-2 font-display text-xl font-black">Fale com a equipe</h3>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Descreva o que aconteceu e selecione a categoria para acelerar a triagem.
                    </p>
                  </div>

                  <form className="space-y-4" onSubmit={handleCreateTicket}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Categoria</label>
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value as SupportThreadCategory)}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-slate-950"
                      >
                        {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Assunto</label>
                      <input
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        placeholder="Ex.: pagamento aprovado sem crédito"
                        minLength={4}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-slate-950"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Mensagem</label>
                      <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Conte o que aconteceu, o que você esperava e, se houver, quando isso ocorreu."
                        minLength={10}
                        className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-slate-950"
                        required
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Escreva pelo menos 10 caracteres para a equipe entender o contexto.
                      </p>
                    </div>

                    {feedback ? (
                      <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {feedback}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      disabled={isCreating}
                      className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-70"
                    >
                      {isCreating ? "Criando ticket..." : "Abrir ticket"}
                    </button>
                  </form>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Seus tickets</p>
                      <h3 className="mt-2 font-display text-xl font-black">Histórico</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => void bootstrap()}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Atualizar
                    </button>
                  </div>

                  {tickets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Você ainda não abriu nenhum ticket.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tickets.map((ticket) => (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => void openTicket(ticket.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            selectedId === ticket.id
                              ? "border-primary/40 bg-primary/5"
                              : "border-slate-200 bg-slate-50 hover:border-primary/20 dark:border-slate-800 dark:bg-slate-950"
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold">{ticket.subject}</p>
                                <NotificationBadge count={ticket.hasUnreadForCustomer ? 1 : 0} />
                              </div>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {getSupportCategoryLabel(ticket.category)} • {formatDateTime(ticket.updatedAt)}
                              </p>
                            </div>
                            <span className={`self-start rounded-full px-2.5 py-1 text-[11px] font-semibold ${getSupportStatusClassName(ticket.status)}`}>
                              {getSupportStatusLabel(ticket.status)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <article className="rounded-[28px] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                {isRefreshing ? (
                  <div className="flex h-full min-h-[480px] items-center justify-center">
                    <Spinner size="sm" className="text-primary" />
                  </div>
                ) : selectedThread ? (
                  <div className="flex h-full flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-primary/80">
                          {getSupportCategoryLabel(selectedThread.category)}
                        </p>
                        <h3 className="mt-2 font-display text-2xl font-black">{selectedThread.subject}</h3>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          Última atualização em {formatDateTime(selectedThread.updatedAt)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getSupportStatusClassName(selectedThread.status)}`}>
                        {getSupportStatusLabel(selectedThread.status)}
                      </span>
                    </div>

                    <div className="mt-6 flex-1 space-y-4 lg:overflow-y-auto">
                      {selectedThread.messages.map((item) => {
                        const isCustomer = item.authorRole === "customer";
                        return (
                          <div
                            key={item.id}
                            className={`max-w-3xl rounded-2xl border px-4 py-3 ${
                              isCustomer
                                ? "ml-auto border-primary/20 bg-primary/10"
                                : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                {isCustomer ? "Você" : item.authorName ?? "Equipe Voxora"}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDateTime(item.createdAt)}
                              </p>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                              {item.body}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {detailError ? (
                      <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {detailError}
                      </p>
                    ) : null}

                    {isOpenSupportThread(selectedThread.status) ? (
                      <form className="mt-6 space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800" onSubmit={handleSendReply}>
                        <label className="text-sm font-medium">Nova mensagem</label>
                        <textarea
                          value={replyBody}
                          onChange={(event) => setReplyBody(event.target.value)}
                          placeholder="Adicione detalhes ou responda à equipe por aqui."
                          className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:ring-2 focus:ring-primary dark:border-slate-800 dark:bg-slate-900"
                          required
                        />
                        <button
                          type="submit"
                          disabled={isSending}
                          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-70"
                        >
                          {isSending ? "Enviando..." : "Enviar mensagem"}
                        </button>
                      </form>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        Este ticket já foi encerrado. Se ainda precisar de ajuda, abra um novo chamado.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="material-symbols-outlined text-[32px]">mark_email_unread</span>
                    </div>
                    <h3 className="mt-5 font-display text-2xl font-black">Selecione um ticket</h3>
                    <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                      Escolha um ticket no histórico ou abra um novo chamado para iniciar o atendimento.
                    </p>
                  </div>
                )}
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
