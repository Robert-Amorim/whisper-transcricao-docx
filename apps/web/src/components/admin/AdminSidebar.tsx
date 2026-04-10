import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NotificationBadge from "../common/NotificationBadge";
import { getAdminSupportSummary } from "../../lib/api";
import type { PublicUser } from "../../lib/types";

type AdminSidebarProps = {
  user: PublicUser | null;
  activeMenu?: "overview" | "tickets" | "users";
};

function getNavClass(isActive: boolean) {
  if (isActive) {
    return "flex min-w-0 items-center gap-3 rounded-xl bg-primary/10 px-3 py-3 text-sm font-semibold text-primary lg:whitespace-nowrap";
  }
  return "flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 lg:whitespace-nowrap";
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AdminSidebar({ user, activeMenu = "overview" }: AdminSidebarProps) {
  const name = user?.name?.trim() || "Equipe";
  const [unreadForStaff, setUnreadForStaff] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      try {
        const summary = await getAdminSupportSummary();
        if (isMounted) {
          setUnreadForStaff(summary.unreadForStaff);
        }
      } catch {
        if (isMounted) {
          setUnreadForStaff(0);
        }
      }
    }

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <aside className="shrink-0 overflow-hidden border-b border-slate-800 bg-slate-950 lg:flex lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 lg:min-h-24 lg:block lg:border-b lg:border-slate-800 lg:px-6 lg:py-5">
        <Link to="/admin" className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <span className="material-symbols-outlined text-[26px]">support_agent</span>
          </div>
          <div>
            <p className="font-display text-lg font-black tracking-tight text-white">Voxora Ops</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Admin e suporte</p>
          </div>
        </Link>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2 lg:hidden">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 px-4 py-4 lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:py-6">
        <Link to="/admin" className={getNavClass(activeMenu === "overview")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">space_dashboard</span>
          <span className="min-w-0 leading-tight">Visão geral</span>
        </Link>
        <Link to="/admin/tickets" className={getNavClass(activeMenu === "tickets")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">mark_email_unread</span>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="leading-tight">Tickets</span>
            <NotificationBadge count={unreadForStaff} />
          </span>
        </Link>
        <Link to="/admin/users" className={getNavClass(activeMenu === "users")}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">groups</span>
          <span className="min-w-0 leading-tight">Usuários</span>
        </Link>
        <Link to="/dashboard" className={getNavClass(false)}>
          <span className="material-symbols-outlined shrink-0 text-[20px]">arrow_back</span>
          <span className="min-w-0 leading-tight">Voltar ao produto</span>
        </Link>
      </nav>

      <div className="hidden border-t border-slate-800 px-4 py-4 lg:block">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-3 py-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
            {getInitials(name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email ?? "Equipe Voxora"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
