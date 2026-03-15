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

const MOCK_LEDGER_ITEMS: DashboardLedgerItem[] = [
  {
    id: "ledger-mock-1",
    title: "Crédito Adicionado",
    subtitle: "Via PIX • ID: 82394",
    dateLabel: "18 Mai 2024, 14:22",
    amountLabel: "+ R$ 500,00",
    tone: "positive",
    icon: {
      wrapClassName: "bg-emerald-100 dark:bg-emerald-900/30",
      iconClassName: "text-emerald-600",
      symbol: "add"
    }
  },
  {
    id: "ledger-mock-2",
    title: "Transcrição Completa",
    subtitle: "Arquivo: interview_final.wav",
    dateLabel: "18 Mai 2024, 09:35",
    amountLabel: "- R$ 12,50",
    tone: "negative",
    icon: {
      wrapClassName: "bg-red-100 dark:bg-red-900/30",
      iconClassName: "text-red-600",
      symbol: "remove"
    }
  },
  {
    id: "ledger-mock-3",
    title: "Consumo API",
    subtitle: "Chamada assíncrona batch v1",
    dateLabel: "17 Mai 2024, 23:10",
    amountLabel: "- R$ 4,20",
    tone: "negative",
    icon: {
      wrapClassName: "bg-red-100 dark:bg-red-900/30",
      iconClassName: "text-red-600",
      symbol: "remove"
    }
  },
  {
    id: "ledger-mock-4",
    title: "Estorno de Erro",
    subtitle: "Falha no processamento (ep32)",
    dateLabel: "17 Mai 2024, 11:05",
    amountLabel: "+ R$ 8,00",
    tone: "neutral",
    icon: {
      wrapClassName: "bg-primary/20",
      iconClassName: "text-primary",
      symbol: "history"
    }
  }
];

export default function LedgerPanel({ ledger }: LedgerPanelProps) {
  const items: DashboardLedgerItem[] =
    ledger.length > 0
      ? ledger.slice(0, 6).map((entry) => {
          const icon = getLedgerIcon(entry.type);
          const signal = getLedgerAmountSignal(entry.type);
          return {
            id: entry.id,
            title: getLedgerTypeLabel(entry.type),
            subtitle: entry.jobId ? `Job: ${entry.jobId}` : "Movimentação da carteira",
            dateLabel: formatDateTime(entry.createdAt),
            amountLabel: `${signal} ${formatCurrency(entry.amount)}`,
            tone: signal === "+" ? "positive" : "negative",
            icon
          };
        })
      : MOCK_LEDGER_ITEMS;

  return (
    <aside className="space-y-4" id="atividade">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-lg font-bold">Atividade recente</h4>
          <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-400 dark:bg-slate-800">
            /v1/wallet/ledger
          </span>
        </div>
      </div>

      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
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
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p
                    className={`text-sm font-bold ${
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
                <p className="text-xs text-slate-500">{item.subtitle}</p>
                <p className="mt-1 text-[10px] text-slate-400">{item.dateLabel}</p>
              </div>
            </div>
          ))}
        </div>

        <button className="min-h-0 w-full rounded-lg border border-dashed border-slate-300 py-3 text-xs font-semibold text-slate-500 transition-all hover:border-primary hover:text-primary dark:border-slate-700">
          Ver extrato completo
        </button>
      </div>
    </aside>
  );
}
