export default function OptimizationTip() {
  return (
    <section className="rounded-xl border border-primary/20 bg-primary/10 p-6">
      <h5 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
        <span className="material-symbols-outlined text-sm">info</span>
        Dica de otimização
      </h5>
      <p className="text-xs leading-relaxed text-primary/80">
        Ative a transcrição em tempo real via WebSockets para reduzir o tempo de processamento em
        arquivos menores que 5MB.
      </p>
    </section>
  );
}

