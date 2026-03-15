import { formatCurrency, formatDateTime } from "../../lib/transcriptions";
import type { WalletLedgerEntry, WalletSummary } from "../../lib/types";

type DashboardStatsGridProps = {
  wallet: WalletSummary | null;
  walletUsagePercent: number;
  todayUsageSeconds: number;
  latestCreditEntry: WalletLedgerEntry | null;
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
  latestCreditEntry
}: DashboardStatsGridProps) {
  const hasWalletData = wallet && Number(wallet.availableBalance) > 0;
  const walletValue = hasWalletData ? formatCurrency(wallet.availableBalance) : "R$ 1.450,00";
  const walletProgress = hasWalletData ? walletUsagePercent : 75;
  const usageValue = todayUsageSeconds > 0 ? formatDurationCompact(todayUsageSeconds) : "12h 45min";
  const lastRechargeDate = latestCreditEntry ? formatDateTime(latestCreditEntry.createdAt) : "18/05/2024";

  return (
    <section className="grid grid-cols-3 gap-6">
      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Saldo da carteira</p>
          <span className="font-mono text-[10px] text-slate-400">GET /v1/wallet</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{walletValue}</h3>
          <span className="text-xs font-semibold text-emerald-500">+12%</span>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-primary" style={{ width: `${walletProgress}%` }} />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Consumo hoje</p>
          <span className="font-mono text-[10px] text-slate-400">/v1/usage</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{usageValue}</h3>
          <span className="text-xs font-semibold text-emerald-500">+5%</span>
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
          <span className="font-mono text-[10px] text-slate-400">GET /v1/billing</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold">{lastRechargeDate}</h3>
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-400">Há 2 dias</span>
        </div>
        <button className="mt-4 min-h-0 w-full rounded-lg bg-slate-100 py-2 text-xs font-bold uppercase tracking-wider transition-all hover:bg-primary hover:text-white dark:bg-slate-800">
          Adicionar Créditos
        </button>
      </article>
    </section>
  );
}
