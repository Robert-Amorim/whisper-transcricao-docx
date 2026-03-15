export default function MarketingFooter() {
  return (
    <footer className="lp-footer-section border-t border-slate-200 bg-white px-6 py-12 dark:border-slate-800 dark:bg-surface-dark">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-4">
        <div className="col-span-1 md:col-span-1">
          <div className="mb-4 flex items-center gap-2">
            <div className="size-6 text-primary">
              <span className="material-symbols-outlined text-2xl">graphic_eq</span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Voxora</h3>
          </div>
          <p className="lp-copy text-sm leading-relaxed text-slate-500 dark:text-slate-300">
            Transformando áudio em conhecimento com o poder da inteligência artificial.
          </p>
        </div>

        <div>
          <h4 className="mb-4 font-bold text-slate-900 dark:text-white">Produto</h4>
          <ul className="lp-copy flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-200">
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Funcionalidades
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#precos">
                Preços
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                API
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Integrações
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 font-bold text-slate-900 dark:text-white">Recursos</h4>
          <ul className="lp-copy flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-200">
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Blog
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Comunidade
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Ajuda
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Privacidade
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 font-bold text-slate-900 dark:text-white">Empresa</h4>
          <ul className="lp-copy flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-200">
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Sobre
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Carreiras
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-primary" href="#">
                Contato
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="lp-copy mx-auto mt-12 flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 text-sm text-slate-500 md:flex-row dark:border-slate-800 dark:text-slate-300">
        <p>© 2023 Voxora. Todos os direitos reservados.</p>
        <div className="flex gap-4">
          <a className="hover:text-primary" href="#">
            <span className="material-symbols-outlined">language</span>
          </a>
          <a className="hover:text-primary" href="#">
            <span className="material-symbols-outlined">alternate_email</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
