import { formatCurrency, formatDateTime } from "../../lib/transcriptions";
import type { WalletLedgerEntry, WalletSummary } from "../../lib/types";

type DashboardStatsGridProps = {
  wallet: WalletSummary | null;
  walletUsagePercent: number;
  todayUsageSeconds: number;
  latestCreditEntry: WalletLedgerEntry | null;
  onAddCreditsClick?: () => void;
};

function formatDurationCompact(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

export default function DashboardStatsGrid({
  wallet,
  walletUsagePercent,
  todayUsageSeconds,
  latestCreditEntry,
  onAddCreditsClick
}: DashboardStatsGridProps) {
  const hasWalletData = wallet !== null;
  const walletValue = hasWalletData ? formatCurrency(wallet.availableBalance) : "--";
  const walletProgress = hasWalletData ? walletUsagePercent : 0;
  const usageValue = todayUsageSeconds > 0 ? formatDurationCompact(todayUsageSeconds) : "--";
  const lastRechargeDate = latestCreditEntry ? formatDateTime(latestCreditEntry.createdAt) : "--";

  return (
    <section className="grid grid-cols-3 gap-6">
      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Saldo da carteira</p>
          <span className="font-mono text-[10px] text-slate-400">GET /v1/wallet</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{walletValue}</h3>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-primary" style={{ width: `${walletProgress}%` }} />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Consumo hoje</p>
          <span className="font-mono text-[10px] text-slate-400">GET /v1/transcriptions</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{usageValue}</h3>
        </div>
        <div className="mt-4 flex gap-1">
          <div className="h-1 flex-1 rounded-full bg-primary/20" />
          <div className="h-1 flex-1 rounded-full bg-primary" />
          <div className="h-1 flex-1 rounded-full bg-primary" />
          <div className="h-1 flex-1 rounded-full bg-primary/20" />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Última recarga</p>
          <span className="font-mono text-[10px] text-slate-400">GET /v1/wallet/ledger</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{lastRechargeDate}</h3>
        </div>
        <button
          type="button"
          onClick={onAddCreditsClick}
          className="mt-4 min-h-0 w-full rounded-lg bg-slate-100 py-2 text-xs font-bold uppercase tracking-wider transition-all hover:bg-primary hover:text-white dark:bg-slate-800"
        >
          Adicionar Créditos
        </button>
      </article>
    </section>
  );
}
