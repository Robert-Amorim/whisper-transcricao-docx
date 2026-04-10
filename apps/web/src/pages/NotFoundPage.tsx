import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background-dark px-6 text-slate-100">
      <div className="text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          Erro 404
        </p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-slate-100 sm:text-6xl">
          Página não encontrada
        </h1>
        <p className="mt-4 font-body text-base text-slate-400">
          O endereço que você acessou não existe ou foi removido.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-body text-sm font-semibold text-white transition hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">home</span>
            Ir ao painel
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-5 py-2.5 font-body text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          >
            Página inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
