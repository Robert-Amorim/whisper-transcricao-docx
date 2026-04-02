import { Link } from "react-router-dom";

export default function HeroSection() {
  return (
    <section className="lp-hero-section mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-16 text-center md:py-24 lg:py-32">
      <h1 className="lp-hero-title mb-8 max-w-4xl text-5xl font-black leading-[1.1] tracking-tight text-slate-900 dark:text-white md:text-6xl lg:text-7xl">
        Transcrição de áudio com{" "}
        <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
          precisão humana
        </span>{" "}
        via IA.
      </h1>

      <p className="lp-copy mb-10 max-w-2xl text-lg font-normal leading-relaxed text-slate-600 dark:text-slate-200 md:text-xl">
        Converta reuniões, entrevistas e podcasts em texto com precisão inigualável.
        Rápido, seguro e acessível.
      </p>

      <div className="flex w-full flex-col justify-center gap-4 sm:flex-row">
        <Link
          className="lp-btn-primary flex h-14 cursor-pointer items-center justify-center rounded-lg bg-primary px-8 text-base font-bold text-white shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-blue-500/40"
          to="/login"
        >
          Começar agora
        </Link>
      </div>

      {/* Preview card — CSS only, no external images */}
      <div className="relative mt-20 w-full">
        <div className="lp-preview-card relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-2xl dark:border-slate-700">
          {/* Simulated audio bar */}
          <div className="flex items-center gap-4 border-b border-slate-700/60 px-6 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary">
              <span className="material-symbols-outlined text-[18px] text-white">mic</span>
            </div>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
              <div className="absolute left-0 top-0 h-full w-2/3 rounded-full bg-primary" />
            </div>
            <span className="font-mono text-sm text-slate-400">04:23 / 06:45</span>
          </div>

          {/* Waveform bars */}
          <div className="flex items-end justify-center gap-[3px] px-6 py-5">
            {[3,6,10,7,14,9,5,12,8,16,11,4,9,7,13,6,10,8,15,5,11,9,7,14,6,10,12,8,5,9,7,13,11,4,8,6,12,10,7,14].map((h, i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-primary/60"
                style={{ height: `${h * 2.5}px`, opacity: i < 26 ? 1 : 0.35 }}
              />
            ))}
          </div>

          {/* Transcription preview */}
          <div className="space-y-3 px-6 pb-6 text-left">
            <div className="flex gap-4">
              <span className="w-20 shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                Falante A
              </span>
              <p className="text-sm font-medium leading-relaxed text-slate-200">
                Então, a ideia principal é garantir que a transcrição seja precisa e entregue no prazo...
              </p>
            </div>
            <div className="flex gap-4">
              <span className="w-20 shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
                Falante B
              </span>
              <p className="text-sm leading-relaxed text-slate-400">
                Exatamente. A precisão em múltiplos idiomas é o diferencial chave aqui.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="w-20 shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                Falante A
              </span>
              <p className="text-sm font-medium leading-relaxed text-slate-200">
                Vou preparar a demonstração para a equipe amanhã.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
