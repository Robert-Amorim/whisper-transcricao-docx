import { Link } from "react-router-dom";

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-10 dark:border-slate-800 dark:bg-surface-dark">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[24px] text-primary">graphic_eq</span>
          <span className="font-display font-bold text-slate-900 dark:text-white">Voxora</span>
        </div>

        <nav className="flex items-center gap-6">
          <a
            href="#como-funciona"
            className="font-body text-sm text-slate-500 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
          >
            Como funciona
          </a>
          <Link
            to="/login"
            className="font-body text-sm text-slate-500 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
          >
            Entrar
          </Link>
          <Link
            to="/login"
            className="font-body text-sm text-slate-500 transition-colors hover:text-primary dark:text-slate-400 dark:hover:text-primary"
          >
            Criar conta
          </Link>
        </nav>

        <p className="font-body text-xs text-slate-400 dark:text-slate-500">
          © {year} Voxora. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
