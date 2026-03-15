type MonitoringTone = "success" | "processing" | "loading" | "error" | "empty";

export type MonitoringItem = {
  tone: MonitoringTone;
  title?: string;
  description: string;
};

export const DEFAULT_MONITORING_ITEMS: MonitoringItem[] = [
  {
    tone: "success",
    title: "Concluído",
    description: "Transcrição finalizada"
  },
  {
    tone: "processing",
    title: "Processando",
    description: "IA analisando áudio..."
  },
  {
    tone: "loading",
    title: "Carregando",
    description: "Buscando dados"
  },
  {
    tone: "error",
    title: "Erro",
    description: "Formato inválido"
  },
  {
    tone: "empty",
    description: "Nenhum arquivo ativo"
  }
];

const TONE_STYLES: Record<MonitoringTone, { card: string; title: string; description: string }> = {
  success: {
    card: "border border-emerald-500/20 bg-emerald-500/10",
    title: "text-sm font-bold text-slate-100",
    description: "text-xs text-emerald-500/70"
  },
  processing: {
    card: "border border-primary/20 bg-primary/10",
    title: "text-sm font-bold text-slate-100",
    description: "text-xs text-primary/70"
  },
  loading: {
    card: "border border-slate-700/50 bg-slate-800/50",
    title: "text-sm font-bold text-slate-100",
    description: "text-xs text-slate-500"
  },
  error: {
    card: "border border-red-500/20 bg-red-500/10",
    title: "text-sm font-bold text-slate-100",
    description: "text-xs text-red-500/70"
  },
  empty: {
    card: "border border-dashed border-slate-700 bg-slate-800/20",
    title: "text-sm font-bold text-slate-200",
    description: "text-xs text-slate-500"
  }
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type MonitoringStateCardProps = {
  item: MonitoringItem;
};

export function MonitoringStateCard({ item }: MonitoringStateCardProps) {
  const style = TONE_STYLES[item.tone];

  if (item.tone === "empty") {
    return (
      <article
        className={joinClasses(
          "flex min-h-[116px] flex-col items-center justify-center rounded-lg px-4 py-6 text-center",
          style.card
        )}
      >
        <span className="material-symbols-outlined mb-2 text-slate-600">cloud_upload</span>
        <p className={style.description}>{item.description}</p>
      </article>
    );
  }

  return (
    <article className={joinClasses("flex items-center gap-3 rounded-lg px-4 py-4", style.card)}>
      {item.tone === "success" ? (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <span className="material-symbols-outlined text-sm leading-none">check</span>
        </span>
      ) : null}

      {item.tone === "processing" ? (
        <span className="text-primary">
          <span className="material-symbols-outlined animate-spin text-sm leading-none">sync</span>
        </span>
      ) : null}

      {item.tone === "loading" ? (
        <span className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-white animate-spin" />
      ) : null}

      {item.tone === "error" ? (
        <span className="text-red-500">
          <span className="material-symbols-outlined text-xl leading-none">error</span>
        </span>
      ) : null}

      <div className="grid gap-0.5">
        {item.title ? <strong className={style.title}>{item.title}</strong> : null}
        <span className={style.description}>{item.description}</span>
      </div>
    </article>
  );
}

type MonitoringPanelProps = {
  title?: string;
  items?: MonitoringItem[];
  className?: string;
};

export default function MonitoringPanel({
  title = "Monitoramento",
  items = DEFAULT_MONITORING_ITEMS,
  className
}: MonitoringPanelProps) {
  return (
    <aside className={joinClasses("space-y-4", className)}>
      <h4 className="px-2 text-sm font-bold uppercase tracking-widest text-slate-500">{title}</h4>
      <div className="grid gap-4">
        {items.map((item) => (
          <MonitoringStateCard key={`${item.tone}-${item.title ?? item.description}`} item={item} />
        ))}
      </div>
    </aside>
  );
}
