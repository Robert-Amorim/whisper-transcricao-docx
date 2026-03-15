import { Link } from "react-router-dom";

export default function CtaSection() {
  return (
    <section className="lp-cta-section px-6 py-20">
      <div className="lp-cta-panel relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-slate-900 p-8 text-center shadow-2xl dark:bg-primary md:p-16">
        <div className="relative z-10">
          <h2 className="mb-6 text-3xl font-black tracking-tight text-white md:text-5xl">
            Pronto para acelerar seu trabalho?
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-300 lp-copy">
            Junte-se a milhares de profissionais que economizam horas de trabalho manual com o
            Whisper Transcrição.
          </p>
          <Link
            className="inline-flex h-14 cursor-pointer items-center justify-center rounded-lg bg-white px-8 text-base font-bold text-slate-900 transition-all hover:scale-105 hover:bg-slate-100"
            to="/login"
          >
            Criar Conta Gratuita
          </Link>
          <p className="lp-copy mt-6 text-sm text-slate-500 dark:text-slate-300">
            Não requer cartão de crédito • 1 hora grátis
          </p>
        </div>
      </div>
    </section>
  );
}
