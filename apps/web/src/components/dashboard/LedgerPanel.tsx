import { formatCurrency, formatDateTime } from "../../lib/transcriptions";
import type { WalletLedgerEntry } from "../../lib/types";

function getLedgerTypeLabel(type: WalletLedgerEntry["type"]) {
  switch (type) {
    case "credit":
      return "Crédito Adicionado";
    case "hold":
      return "Reserva";
    case "capture":
      return "Transcrição Completa";
    case "refund":
      return "Estorno";
    case "adjustment":
      return "Ajuste";
    default:
      return type;
  }
}

function getLedgerAmountSignal(type: WalletLedgerEntry["type"]) {
  switch (type) {
    case "credit":
    case "refund":
    case "adjustment":
      return "+";
    case "hold":
    case "capture":
      return "-";
    default:
      return "";
  }
}

function getLedgerIcon(type: WalletLedgerEntry["type"]) {
  switch (type) {
    case "credit":
    case "refund":
      return {
        wrapClassName: "bg-emerald-100 dark:bg-emerald-900/30",
        iconClassName: "text-emerald-600",
        symbol: "add"
      };
    case "hold":
    case "capture":
      return {
        wrapClassName: "bg-red-100 dark:bg-red-900/30",
        iconClassName: "text-red-600",
        symbol: "remove"
      };
    default:
      return {
        wrapClassName: "bg-primary/20",
        iconClassName: "text-primary",
        symbol: "history"
      };
  }
}

type LedgerPanelProps = {
  ledger: WalletLedgerEntry[];
  total?: number;
  hasMore?: boolean;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
};

type DashboardLedgerItem = {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  amountLabel: string;
  tone: "positive" | "negative" | "neutral";
  icon: {
    wrapClassName: string;
    iconClassName: string;
    symbol: string;
  };
};

export default function LedgerPanel({
  ledger,
  total = 0,
  hasMore = false,
  currentPage = 0,
  onPageChange,
  pageSize = 8
}: LedgerPanelProps) {
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const items: DashboardLedgerItem[] = ledger.map((entry) => {
    const icon = getLedgerIcon(entry.type);
    const signal = getLedgerAmountSignal(entry.type);
    return {
      id: entry.id,
      title: getLedgerTypeLabel(entry.type),
      subtitle: entry.jobId ? "Transcrição processada" : "Movimentação da carteira",
      dateLabel: formatDateTime(entry.createdAt),
      amountLabel: `${signal} ${formatCurrency(entry.amount)}`,
      tone: signal === "+" ? "positive" : "negative",
      icon
    };
  });

  return (
    <aside className="space-y-4" id="atividade">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-display text-lg font-bold tracking-tight">Atividade recente</h4>
      </div>

      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700">
            Ainda não há movimentações na carteira.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div
                  className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full ${item.icon.wrapClassName}`}
                >
                  <span className={`material-symbols-outlined text-sm ${item.icon.iconClassName}`}>
                    {item.icon.symbol}
                  </span>
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p className="truncate font-body text-sm font-semibold">{item.title}</p>
                    <p
                      className={`font-mono text-sm font-bold ${
                        item.tone === "positive"
                          ? "text-emerald-500"
                          : item.tone === "neutral"
                            ? "text-primary"
                            : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {item.amountLabel}
                    </p>
                  </div>
                  <p className="font-body text-xs text-slate-500">{item.subtitle}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{item.dateLabel}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {onPageChange && totalPages > 1 ? (
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-xs text-slate-500">
              Página {currentPage + 1} de {totalPages}
              {total > 0 ? ` · ${total} movimentações` : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => onPageChange(currentPage - 1)}
                className="min-h-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:text-primary dark:border-slate-700 dark:text-slate-400"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => onPageChange(currentPage + 1)}
                className="min-h-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:text-primary dark:border-slate-700 dark:text-slate-400"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : (
          total > pageSize ? (
            <p className="text-center text-xs text-slate-500">{total} movimentações no total</p>
          ) : null
        )}
      </div>
    </aside>
  );
}
