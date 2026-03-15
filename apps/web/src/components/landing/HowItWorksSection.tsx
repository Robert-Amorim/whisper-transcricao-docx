export default function HowItWorksSection() {
  return (
    <section
      className="lp-workflow-section border-t border-slate-100 bg-white py-24 dark:border-slate-800 dark:bg-surface-dark"
      id="como-funciona"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 flex flex-col gap-4 md:items-center md:text-center">
          <h2 className="lp-section-title text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Fluxo de trabalho simplificado
          </h2>
          <p className="lp-copy max-w-2xl text-lg text-slate-600 dark:text-slate-200">
            Três passos simples separam seu áudio bruto de um texto perfeitamente formatado.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="lp-surface-card group flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-8 transition-all hover:border-primary/50 hover:shadow-lg dark:border-slate-800 dark:bg-background-dark dark:hover:border-primary/50">
            <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-blue-100 text-primary transition-transform group-hover:scale-110 dark:bg-blue-900/20">
              <span className="material-symbols-outlined text-3xl">upload_file</span>
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">1. Upload do Arquivo</h3>
            <p className="lp-copy leading-relaxed text-slate-600 dark:text-slate-200">
              Arraste e solte seus arquivos de áudio ou vídeo. Suportamos MP3, MP4, WAV, M4A e
              muito mais.
            </p>
          </div>

          <div className="lp-surface-card group flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-8 transition-all hover:border-primary/50 hover:shadow-lg dark:border-slate-800 dark:bg-background-dark dark:hover:border-primary/50">
            <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-blue-100 text-primary transition-transform group-hover:scale-110 dark:bg-blue-900/20">
              <span className="material-symbols-outlined text-3xl">memory</span>
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">2. Processamento IA</h3>
            <p className="lp-copy leading-relaxed text-slate-600 dark:text-slate-200">
              O motor Whisper analisa o áudio, identifica falantes e converte fala em texto em
              minutos.
            </p>
          </div>

          <div className="lp-surface-card group flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-8 transition-all hover:border-primary/50 hover:shadow-lg dark:border-slate-800 dark:bg-background-dark dark:hover:border-primary/50">
            <div className="mb-6 flex size-14 items-center justify-center rounded-xl bg-blue-100 text-primary transition-transform group-hover:scale-110 dark:bg-blue-900/20">
              <span className="material-symbols-outlined text-3xl">download</span>
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">3. Exportação</h3>
            <p className="lp-copy leading-relaxed text-slate-600 dark:text-slate-200">
              Edite no navegador se necessário e exporte para TXT, SRT (legendas) ou PDF formatado.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
