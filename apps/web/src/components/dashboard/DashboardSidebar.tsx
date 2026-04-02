import { Link } from "react-router-dom";
import type { PublicUser } from "../../lib/types";

type DashboardSidebarProps = {
  user: PublicUser | null;
  activeMenu?: "dashboard" | "new-transcription" | "transcriptions" | "wallet" | "settings";
};

function getNavClass(isActive: boolean) {
  if (isActive) {
    return "flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 font-medium text-primary font-body";
  }
  return "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 font-body";
}

function getUserInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default function DashboardSidebar({ user, activeMenu = "dashboard" }: DashboardSidebarProps) {
  const displayName = user?.name?.trim() || "Usuário";
  const displayEmail = user?.email?.trim() || "";
  const initials = getUserInitials(displayName);

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-background-dark">
      <div className="flex items-center gap-3 p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white">
          <span className="material-symbols-outlined text-2xl">graphic_eq</span>
        </div>
        <h1 className="font-display text-base font-bold leading-tight tracking-tight">Voxora</h1>
      </div>

      <nav className="mt-4 flex-1 space-y-1 px-4">
        <Link to="/dashboard" className={getNavClass(activeMenu === "dashboard")}>
          <span className="material-symbols-outlined text-[20px]">dashboard</span>
          <span>Dashboard</span>
        </Link>
        <Link
          to="/transcricoes/nova"
          className={getNavClass(activeMenu === "new-transcription")}
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          <span>Nova transcrição</span>
        </Link>
        <Link to="/transcricoes" className={getNavClass(activeMenu === "transcriptions")}>
          <span className="material-symbols-outlined text-[20px]">description</span>
          <span>Transcrições</span>
        </Link>
        <Link to="/carteira" className={getNavClass(activeMenu === "wallet")}>
          <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
          <span>Carteira</span>
        </Link>
        <Link to="/perfil" className={getNavClass(activeMenu === "settings")}>
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span>Configurações</span>
        </Link>
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <Link
          to="/perfil"
          className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary"
          >
            {initials}
          </div>
          <div className="flex min-w-0 flex-col overflow-hidden">
            <p className="truncate font-body text-sm font-medium">{displayName}</p>
            {displayEmail && (
              <p className="truncate font-body text-xs text-slate-500 dark:text-slate-400">
                {displayEmail}
              </p>
            )}
          </div>
        </Link>
      </div>
    </aside>
  );
}
