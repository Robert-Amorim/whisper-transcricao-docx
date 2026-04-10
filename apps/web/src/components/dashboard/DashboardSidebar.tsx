import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NotificationBadge from "../common/NotificationBadge";
import { getSupportSummary } from "../../lib/api";
import type { PublicUser } from "../../lib/types";

type DashboardSidebarProps = {
  user: PublicUser | null;
  activeMenu?: "dashboard" | "new-transcription" | "transcriptions" | "wallet" | "support" | "settings";
};

function getNavClass(isActive: boolean) {
  if (isActive) {
    return "flex min-w-0 items-center gap-3 rounded-lg bg-primary/10 px-3 py-3 font-medium text-primary font-body lg:whitespace-nowrap";
  }
  return "flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 font-body lg:whitespace-nowrap";
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
  const [unreadReplies, setUnreadReplies] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      if (!user) {
        if (isMounted) setUnreadReplies(0);
        return;
      }

      try {
        const summary = await getSupportSummary();
        if (isMounted) {
          setUnreadReplies(summary.unreadReplies);
        }
      } catch {
        if (isMounted) {
          setUnreadReplies(0);
        }
      }
    }

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return (
    <aside className="shrink-0 overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-background-dark lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 lg:block lg:p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white">
            <span className="material-symbols-outlined text-2xl">graphic_eq</span>
          </div>
          <div>
            <h1 className="font-display text-base font-bold leading-tight tracking-tight">Voxora</h1>
            <p className="font-body text-xs text-slate-500 dark:text-slate-400 lg:hidden">
              Navegação do painel
            </p>
          </div>
        </div>

        <Link
          to="/perfil"
          className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 lg:hidden"
        >
          <div
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary"
          >
            {initials}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate font-body text-sm font-medium">{displayName}</p>
            {displayEmail ? (
              <p className="truncate font-body text-xs text-slate-500 dark:text-slate-400">
                {displayEmail}
              </p>
            ) : null}
          </div>
        </Link>
      </div>

      <nav className="mt-4 grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3 lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:pb-0">
        <Link to="/dashboard" className={getNavClass(activeMenu === "dashboard")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">dashboard</span>
          <span className="min-w-0 text-sm leading-tight">Dashboard</span>
        </Link>
        <Link
          to="/transcricoes/nova"
          className={getNavClass(activeMenu === "new-transcription")}
        >
          <span className="material-symbols-outlined shrink-0 text-[20px]">add_circle</span>
          <span className="min-w-0 text-sm leading-tight">Nova transcrição</span>
        </Link>
        <Link to="/transcricoes" className={getNavClass(activeMenu === "transcriptions")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">description</span>
          <span className="min-w-0 text-sm leading-tight">Transcrições</span>
        </Link>
        <Link to="/carteira" className={getNavClass(activeMenu === "wallet")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">account_balance_wallet</span>
          <span className="min-w-0 text-sm leading-tight">Carteira</span>
        </Link>
        <Link to="/suporte" className={getNavClass(activeMenu === "support")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">support_agent</span>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm leading-tight">Suporte</span>
            <NotificationBadge count={unreadReplies} />
          </span>
        </Link>
        <Link to="/perfil" className={getNavClass(activeMenu === "settings")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">settings</span>
          <span className="min-w-0 text-sm leading-tight">Configurações</span>
        </Link>
        {user && user.role !== "customer" ? (
          <Link to="/admin" className={getNavClass(false)}>
            <span className="material-symbols-outlined shrink-0 text-[20px]">admin_panel_settings</span>
            <span className="min-w-0 text-sm leading-tight">Painel interno</span>
          </Link>
        ) : null}
      </nav>

      <div className="hidden border-t border-slate-200 p-4 dark:border-slate-800 lg:block">
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
