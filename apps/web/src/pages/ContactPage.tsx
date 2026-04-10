import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { createPublicSupportRequest, getErrorMessage } from "../lib/api";
import { SUPPORT_CATEGORY_OPTIONS } from "../lib/support";
import type { SupportThreadCategory } from "../lib/types";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<SupportThreadCategory>("acesso");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | "neutral">("neutral");

  function validateForm() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < 2) {
      return "Seu nome precisa ter pelo menos 2 caracteres.";
    }

    if (!trimmedEmail) {
      return "Informe um e-mail válido para receber o retorno.";
    }

    if (trimmedSubject.length < 4) {
      return "O assunto precisa ter pelo menos 4 caracteres.";
    }

    if (trimmedMessage.length < 10) {
      return "A mensagem precisa ter pelo menos 10 caracteres para abrir a solicitação.";
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setFeedbackTone("neutral");
    const validationMessage = validateForm();
    if (validationMessage) {
      setFeedbackTone("error");
      setFeedback(validationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createPublicSupportRequest({
        name: name.trim(),
        email: email.trim(),
        category,
        subject: subject.trim(),
        message: message.trim()
      });

      setName("");
      setEmail("");
      setCategory("acesso");
      setSubject("");
      setMessage("");
      setFeedbackTone("success");
      setFeedback(response.message);
    } catch (error) {
      setFeedbackTone("error");
      setFeedback(getErrorMessage(error, "Não foi possível enviar sua mensagem agora."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background-dark px-4 py-6 font-body text-slate-100 sm:px-6 sm:py-10">
      <section className="mx-auto grid max-w-6xl overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/30 sm:rounded-[32px] lg:grid-cols-[1.05fr_0.95fr]">
        <article className="relative overflow-hidden border-b border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(43,140,238,0.32),_transparent_36%),linear-gradient(165deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-12">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute left-10 top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-48 w-48 translate-x-8 translate-y-10 rounded-full bg-cyan-400/10 blur-3xl" />
          </div>

          <div className="relative">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Voltar para a Voxora
            </Link>

            <div className="mt-12 max-w-lg">
              <p className="text-xs uppercase tracking-[0.24em] text-primary/75">Contato e pré-triagem</p>
              <h1 className="mt-4 font-display text-3xl font-black leading-tight text-white sm:text-4xl">
                Fale com a equipe antes mesmo de criar sua conta.
              </h1>
              <p className="mt-5 text-sm leading-7 text-slate-300">
                Use este canal para dúvidas comerciais, onboarding, problemas de acesso e qualquer situação que ainda não esteja vinculada à sua área logada.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="material-symbols-outlined text-primary">mail</span>
                <p className="mt-3 text-sm font-semibold text-white">Retorno por e-mail</p>
                <p className="mt-1 text-sm text-slate-400">Sua solicitação entra direto na fila da equipe.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="material-symbols-outlined text-primary">manage_search</span>
                <p className="mt-3 text-sm font-semibold text-white">Triagem contextual</p>
                <p className="mt-1 text-sm text-slate-400">Classificamos o assunto para acelerar o primeiro retorno.</p>
              </div>
            </div>
          </div>
        </article>

        <article className="bg-slate-950 p-6 sm:p-8 lg:p-10">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Abrir solicitação</p>
            <h2 className="mt-3 font-display text-3xl font-black text-white">Pré-ticket público</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Se você já possui conta, prefira abrir o ticket pela área logada para manter o histórico centralizado.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Nome</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                  placeholder="Seu nome"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">E-mail</label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                  placeholder="voce@empresa.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">Categoria</label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as SupportThreadCategory)}
                className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
              >
                {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">Assunto</label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  minLength={4}
                  className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-white outline-none transition focus:ring-2 focus:ring-primary"
                  placeholder="Ex.: quero entender como funciona a plataforma"
                  required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">Mensagem</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                minLength={10}
                className="min-h-[180px] w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none transition focus:ring-2 focus:ring-primary"
                placeholder="Explique o cenário com o máximo de contexto útil."
                required
              />
              <p className="text-xs text-slate-500">
                Escreva pelo menos 10 caracteres para ajudar a equipe na triagem.
              </p>
            </div>

            {feedback ? (
              <p
                className={`rounded-xl border px-4 py-3 text-sm ${
                  feedbackTone === "success"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : feedbackTone === "error"
                      ? "border-red-500/20 bg-red-500/10 text-red-300"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
              >
                {feedback}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-70"
            >
              {isSubmitting ? "Enviando..." : "Enviar para a equipe"}
            </button>

            <p className="text-xs leading-6 text-slate-500">
              Ao enviar, você autoriza a equipe a responder para o e-mail informado com contexto sobre sua solicitação.
            </p>
          </form>
        </article>
      </section>
    </main>
  );
}
