import type { PublicUser } from "../../lib/types";

type DashboardMobileUserBarProps = {
  user: PublicUser | null;
  jobsInProgress: number;
  onLogout: () => void;
};

export default function DashboardMobileUserBar({
  user,
  jobsInProgress,
  onLogout
}: DashboardMobileUserBarProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-clarity-border dark:bg-clarity-surface md:hidden">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {user ? `${user.name} • ${jobsInProgress} em processamento` : "Usuário"}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold dark:bg-clarity-surface"
        >
          Sair
        </button>
      </div>
    </section>
  );
}

