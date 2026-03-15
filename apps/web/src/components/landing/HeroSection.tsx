import { Link } from "react-router-dom";

export default function HeroSection() {
  return (
    <section className="lp-hero-section mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-16 text-center md:py-24 lg:py-32">
      <div className="lp-chip mb-8 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary dark:border-blue-800 dark:bg-blue-900/30">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        Nova versão 2.0 disponível
      </div>

      <h1 className="lp-hero-title mb-8 max-w-4xl text-5xl font-black leading-[1.1] tracking-tight text-slate-900 dark:text-white md:text-6xl lg:text-7xl">
        Transcrição de áudio com{" "}
        <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
          precisão humana
        </span>{" "}
        via IA.
      </h1>

      <p className="lp-copy mb-10 max-w-2xl text-lg font-normal leading-relaxed text-slate-600 dark:text-slate-200 md:text-xl">
        Converta reuniões, entrevistas e podcasts em texto com precisão inigualável usando o
        modelo Whisper. Rápido, seguro e acessível.
      </p>

      <div className="flex w-full flex-col justify-center gap-4 sm:flex-row">
        <Link
          className="lp-btn-primary flex h-14 cursor-pointer items-center justify-center rounded-lg bg-primary px-8 text-base font-bold text-white shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-blue-500/40"
          to="/login"
        >
          Transcrição Gratuita
        </Link>
        <Link
          className="lp-btn-secondary flex h-14 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-8 text-base font-bold text-slate-900 transition-all hover:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:border-primary"
          to="/login"
        >
          <span className="material-symbols-outlined mr-2 text-xl">play_circle</span>
          Ver Demo
        </Link>
      </div>

      <div className="group relative mt-20 w-full">
        <div className="lp-preview-card relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-surface-dark">
          <div
            className="lp-preview-image relative flex h-[300px] w-full items-center justify-center bg-cover bg-center md:h-[500px]"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBd8N6Y46saW_auVOpC5EIE5AAo9EYCRmwxR5GSUGYtORq482Ixu4sOY2K1WG7jqd5IllTxNNpm8QvyM5ls-m8boPOfqT0YQOItIZOlE9fsZUwR1C1t8druWGNqEeOB2JxcOMFqvY1qiahrSUzz_ib3pGc-QagGPB02SSWY8Jxgra2178QaYbY0P4KfKiV04bRHBWFlRqI7S8vqQ2DET1QpgbSYy8JX-SVJPqWvlSrTzbnS-Sp406IMiLOCZhPihDRrix4Xhkdldzc')"
            }}
          >
            <div className="lp-preview-overlay absolute inset-0 flex flex-col items-center justify-center bg-transparent">
              <div className="w-full max-w-3xl space-y-4 p-8">
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined">mic</span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                    <div className="absolute left-0 top-0 h-full w-2/3 bg-primary" />
                  </div>
                  <span className="lp-preview-time text-sm font-mono text-slate-500 dark:text-slate-300">
                    04:23 / 06:45
                  </span>
                </div>

                <div className="space-y-3 text-left">
                  <div className="flex gap-4">
                    <span className="w-16 text-sm font-bold uppercase tracking-wide text-primary">
                      Speaker 1
                    </span>
                    <p className="lp-preview-text font-medium text-slate-800 dark:text-slate-200">
                      Então, a ideia principal é utilizar o modelo Whisper para garantir que a
                      transcrição seja...
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-16 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-200">
                      Speaker 2
                    </span>
                    <p className="lp-preview-text-muted text-slate-600 dark:text-slate-200">
                      Exatamente. A precisão em múltiplos idiomas é o diferencial chave aqui.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-16 text-sm font-bold uppercase tracking-wide text-primary">
                      Speaker 1
                    </span>
                    <p className="lp-preview-text font-medium text-slate-800 dark:text-slate-200">
                      Vou preparar a demonstração para a equipe amanhã.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
