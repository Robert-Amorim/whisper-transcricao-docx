import { Link } from "react-router-dom";

export default function MarketingHeader() {
  return (
    <header className="lp-header sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-solid border-slate-200 bg-background-light px-4 py-4 dark:border-slate-800 dark:bg-background-dark sm:px-6">
      <div className="lp-header-brand flex items-center gap-3">
        <div className="size-8 text-primary">
          <span className="material-symbols-outlined text-[32px]">graphic_eq</span>
        </div>
        <h2 className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          Voxora
        </h2>
      </div>

      <div className="hidden flex-1 items-center justify-end gap-8 md:flex">
        <nav className="flex items-center gap-8">
          <a
            className="lp-header-link text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-100 dark:hover:text-white"
            href="#como-funciona"
          >
            Como funciona
          </a>
          <Link
            className="lp-header-link text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-100 dark:hover:text-white"
            to="/login"
          >
            Entrar
          </Link>
        </nav>
        <Link
          className="lp-header-cta flex h-10 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary px-6 text-sm font-bold leading-normal tracking-wide text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600"
          to="/login"
        >
          <span className="truncate">Começar Agora</span>
        </Link>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <a
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-100"
          href="#como-funciona"
        >
          Fluxo
        </a>
        <Link
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600"
          to="/login"
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}
