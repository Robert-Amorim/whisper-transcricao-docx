import { Link } from "react-router-dom";
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
  const hasWalletData = wallet !== null;
  const walletValue = hasWalletData ? formatCurrency(wallet.availableBalance) : "--";
  const walletProgress = hasWalletData ? walletUsagePercent : 0;
  const usageValue = todayUsageSeconds > 0 ? formatDurationCompact(todayUsageSeconds) : "--";
  const lastRechargeDate = latestCreditEntry ? formatDateTime(latestCreditEntry.createdAt) : "--";

  return (
    <section className="grid grid-cols-3 gap-6">
      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Saldo disponível
        </p>
        <h3 className="font-mono text-3xl font-bold tracking-tight">{walletValue}</h3>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${walletProgress}%` }} />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Consumo hoje
        </p>
        <h3 className="font-mono text-3xl font-bold tracking-tight">{usageValue}</h3>
        <div className="mt-4 flex gap-1">
          <div className="h-1 flex-1 rounded-full bg-primary/20" />
          <div className="h-1 flex-1 rounded-full bg-primary" />
          <div className="h-1 flex-1 rounded-full bg-primary" />
          <div className="h-1 flex-1 rounded-full bg-primary/20" />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Última recarga
        </p>
        <h3 className="font-mono text-3xl font-bold tracking-tight">{lastRechargeDate}</h3>
        <Link
          to="/carteira"
          className="mt-4 flex min-h-0 w-full items-center justify-center rounded-lg bg-slate-100 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all hover:bg-primary hover:text-white dark:bg-slate-800 dark:hover:text-white"
        >
          Gerenciar carteira
        </Link>
      </article>
    </section>
  );
}
