export default function ProfessionalSection() {
  return (
    <section className="lp-professional-section mx-auto w-full max-w-7xl px-6 py-24">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
        <div className="lp-media-card relative order-2 aspect-video overflow-hidden rounded-2xl border border-slate-200 shadow-2xl dark:border-slate-700 md:order-1">
          <div className="absolute inset-0 z-10 bg-gradient-to-tr from-slate-900/80 to-transparent" />
          <img
            alt="Professional woman working on laptop in a modern office analyzing data"
            className="h-full w-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAbLPpvEXx67QbgtUsYXaJ4k2XoVvZohaiV5SynGAhLUs8f2RTMP5jUmB47ZR02BD1AhfxYQNc_-TK9Vpat4CGVTFmcPSHqpxykxd0GDCYa_RD50HIlxXoe-dWCGhe6yLAneMSzvOPBRv6B8f_Y9PzQH2eBVt2KpacsvE50dkIFx9x7iSwfX025XKvLbDfUSdIDnhkgLgcB9HeyD_BPGeWivMG-KXZ01FHkC4jhTTnkfXaV6J2p5PMNIeCj3RvE1ycbHaLYPdgy0ac"
          />
          <div className="absolute bottom-6 left-6 z-20 text-white">
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">verified</span>
              <span className="text-sm font-bold uppercase tracking-wider">Qualidade Garantida</span>
            </div>
            <p className="text-2xl font-bold">99% de Precisão em Português</p>
          </div>
        </div>

        <div className="order-1 flex flex-col gap-6 md:order-2">
          <h2 className="lp-section-title text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Feito para profissionais exigentes
          </h2>
          <p className="lp-copy text-lg text-slate-600 dark:text-slate-200">
            Não perca mais tempo transcrevendo manualmente. Nossa ferramenta foi desenhada para
            jornalistas, pesquisadores e criadores de conteúdo.
          </p>

          <div className="mt-4 space-y-4">
            <div className="flex gap-4">
              <div className="mt-1 flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <span className="material-symbols-outlined text-sm font-bold">check</span>
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">Diarização de Falantes</h4>
                <p className="lp-copy text-sm text-slate-600 dark:text-slate-200">
                  Identifica automaticamente quem está falando (Falante A, Falante B).
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <span className="material-symbols-outlined text-sm font-bold">check</span>
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">Múltiplos Idiomas</h4>
                <p className="lp-copy text-sm text-slate-600 dark:text-slate-200">
                  Suporte para mais de 50 idiomas com tradução automática opcional.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <span className="material-symbols-outlined text-sm font-bold">check</span>
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">Editor Inteligente</h4>
                <p className="lp-copy text-sm text-slate-600 dark:text-slate-200">
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
