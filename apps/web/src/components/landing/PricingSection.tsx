export default function PricingSection() {
  return (
    <section className="lp-pricing-section border-y border-slate-200 bg-slate-50 py-24 dark:border-slate-800 dark:bg-slate-900" id="precos">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h2 className="lp-section-title mb-4 text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Preços Simples e Transparentes
          </h2>
          <p className="lp-copy text-lg text-slate-600 dark:text-slate-200">
            Sem contratos de fidelidade. Cancele quando quiser.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          <div className="lp-plan-card flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-surface-dark">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Básico</h3>
              <p className="lp-copy text-sm text-slate-500 dark:text-slate-200">Para uso ocasional</p>
            </div>
            <div className="mb-6 flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900 dark:text-white">R$29</span>
              <span className="lp-copy font-medium text-slate-500 dark:text-slate-200">/mês</span>
            </div>
            <button className="mb-8 w-full rounded-lg bg-slate-100 px-4 py-3 font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">
              Escolher Básico
            </button>
            <ul className="lp-copy flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-200">
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                5 horas de áudio/mês
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                Exportação TXT
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                Suporte por email
              </li>
            </ul>
          </div>

          <div className="lp-plan-card lp-plan-card-featured relative z-10 flex scale-105 flex-col rounded-2xl border-2 border-primary bg-white p-8 shadow-xl dark:bg-surface-dark">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              Mais Popular
            </div>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Profissional</h3>
              <p className="lp-copy text-sm text-slate-500 dark:text-slate-200">Para criadores e jornalistas</p>
            </div>
            <div className="mb-6 flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900 dark:text-white">R$79</span>
              <span className="lp-copy font-medium text-slate-500 dark:text-slate-200">/mês</span>
            </div>
            <button className="mb-8 w-full rounded-lg bg-primary px-4 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600">
              Começar Trial Gratuito
            </button>
            <ul className="lp-copy flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-200">
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-primary">check</span>
                <strong>20 horas</strong> de áudio/mês
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-primary">check</span>
                Identificação de oradores
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-primary">check</span>
                Exportação TXT, SRT, PDF
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-primary">check</span>
                Prioridade no processamento
              </li>
            </ul>
          </div>

          <div className="lp-plan-card flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-surface-dark">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Empresarial</h3>
              <p className="lp-copy text-sm text-slate-500 dark:text-slate-200">Para grandes volumes</p>
            </div>
            <div className="mb-6 flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900 dark:text-white">Custom</span>
            </div>
            <button className="mb-8 w-full rounded-lg bg-slate-100 px-4 py-3 font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">
              Falar com Vendas
            </button>
            <ul className="lp-copy flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-200">
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                Volume ilimitado
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                API dedicada
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                SLA garantido
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-green-500">check</span>
                Gerente de conta
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
