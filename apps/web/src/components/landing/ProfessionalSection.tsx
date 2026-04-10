export default function ProfessionalSection() {
  return (
    <section className="lp-professional-section mx-auto w-full max-w-7xl px-6 py-24">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
        {/* Visual card — CSS only, no external images */}
        <div className="lp-media-card relative order-2 aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xl dark:border-slate-700 md:order-1">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-slate-900/80" />

          {/* Stat cards overlay */}
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-3 p-8">
            {[
              { icon: "mic",        label: "Áudio processado",  value: "1.200h",  color: "text-primary"     },
              { icon: "translate",  label: "Idiomas suportados", value: "50+",     color: "text-emerald-400" },
              { icon: "timer",      label: "Tempo médio",        value: "< 5 min", color: "text-blue-400"    },
            ].map(({ icon, label, value, color }) => (
              <div
                key={label}
                className="flex w-full items-center gap-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 backdrop-blur-sm"
              >
                <span className={`material-symbols-outlined text-[22px] ${color}`}>{icon}</span>
                <span className="flex-1 font-body text-sm text-slate-300">{label}</span>
                <span className={`font-mono text-base font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Bottom label */}
          <div className="absolute bottom-5 left-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">verified</span>
            <span className="font-display text-xs font-bold uppercase tracking-wider text-white">
              Qualidade garantida
            </span>
          </div>
        </div>

        <div className="order-1 flex flex-col gap-6 md:order-2">
          <h2 className="lp-section-title font-display text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Feito para profissionais exigentes
          </h2>
          <p className="lp-copy font-body text-lg text-slate-600 dark:text-slate-200">
            Não perca mais tempo transcrevendo manualmente. Nossa ferramenta foi desenhada para
            jornalistas, pesquisadores e criadores de conteúdo.
          </p>

          <div className="mt-4 space-y-4">
            <div className="flex gap-4">
              <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <span className="material-symbols-outlined text-sm font-bold">check</span>
              </div>
              <div>
                <h4 className="font-display text-lg font-bold text-slate-900 dark:text-white">Diarização de Falantes</h4>
                <p className="lp-copy font-body text-sm text-slate-600 dark:text-slate-200">
                  Identifica automaticamente quem está falando (Falante A, Falante B).
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <span className="material-symbols-outlined text-sm font-bold">check</span>
              </div>
              <div>
                <h4 className="font-display text-lg font-bold text-slate-900 dark:text-white">Múltiplos Idiomas</h4>
                <p className="lp-copy font-body text-sm text-slate-600 dark:text-slate-200">
                  Suporte para mais de 50 idiomas com tradução automática opcional.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <span className="material-symbols-outlined text-sm font-bold">check</span>
              </div>
              <div>
                <h4 className="font-display text-lg font-bold text-slate-900 dark:text-white">Editor Inteligente</h4>
                <p className="lp-copy font-body text-sm text-slate-600 dark:text-slate-200">
                  Clique no texto para ouvir o áudio correspondente instantaneamente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
