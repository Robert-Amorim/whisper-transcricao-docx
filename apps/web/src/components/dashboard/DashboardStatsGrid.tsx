import { Link } from "react-router-dom";
import {
  formatCurrency,
  formatDateTime,
  formatEstimatedMinutes,
  formatPricePerMinuteLabel
} from "../../lib/transcriptions";
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
  const walletEstimate = hasWalletData ? formatEstimatedMinutes(wallet.availableBalance) : "--";
  const walletProgress = hasWalletData ? walletUsagePercent : 0;
  const usageValue = todayUsageSeconds > 0 ? formatDurationCompact(todayUsageSeconds) : "--";
  const lastRechargeDate = latestCreditEntry ? formatDateTime(latestCreditEntry.createdAt) : "--";
  const [lastRechargeDateLabel, lastRechargeTimeLabel] = lastRechargeDate.includes(", ")
    ? lastRechargeDate.split(", ", 2)
    : [lastRechargeDate, ""];

  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Saldo disponível
        </p>
        <h3 className="break-words font-mono text-2xl font-bold tracking-tight sm:text-3xl">{walletValue}</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Cerca de {walletEstimate} de transcrição no preço atual de{" "}
          {formatPricePerMinuteLabel()}/min.
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${walletProgress}%` }} />
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Consumo hoje
        </p>
        <h3 className="break-words font-mono text-2xl font-bold tracking-tight sm:text-3xl">{usageValue}</h3>
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
        <div className="space-y-1">
          <h3 className="break-words font-mono text-xl font-bold tracking-tight sm:text-2xl">
            {lastRechargeDateLabel}
          </h3>
          {lastRechargeTimeLabel ? (
            <p className="font-mono text-sm text-slate-500 dark:text-slate-400 sm:text-base">
              {lastRechargeTimeLabel}
            </p>
          ) : null}
        </div>
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
