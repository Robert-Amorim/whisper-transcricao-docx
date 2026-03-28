import { Link } from "react-router-dom";
import type { PublicUser } from "../../lib/types";

type DashboardSidebarProps = {
  user: PublicUser | null;
  activeMenu?: "dashboard" | "new-transcription" | "transcriptions" | "wallet" | "settings";
};

function getNavClass(isActive: boolean) {
  if (isActive) {
    return "flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 font-medium text-primary";
  }
  return "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-clarity-surface";
}

export default function DashboardSidebar({ user, activeMenu = "dashboard" }: DashboardSidebarProps) {
  const displayName = user?.name?.trim() || "Usuário Admin";
  const displayEmail = user?.email?.trim() || "admin@voxora.ai";

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-background-dark">
      <div className="flex items-center gap-3 p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white">
          <span className="material-symbols-outlined text-2xl">graphic_eq</span>
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-bold leading-tight">Voxora</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">SaaS de Áudio</p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-2 px-4">
        <Link to="/dashboard" className={getNavClass(activeMenu === "dashboard")}>
          <span className="material-symbols-outlined">dashboard</span>
          <span>Dashboard</span>
        </Link>
        <Link
          to="/transcricoes/nova"
          className={getNavClass(activeMenu === "new-transcription")}
        >
          <span className="material-symbols-outlined">add_circle</span>
          <span>Nova transcrição</span>
        </Link>
        <Link to="/dashboard#jobs" className={getNavClass(activeMenu === "transcriptions")}>
          <span className="material-symbols-outlined">description</span>
          <span>Transcrições</span>
        </Link>
        <Link to="/dashboard#creditos" className={getNavClass(activeMenu === "wallet")}>
          <span className="material-symbols-outlined">account_balance_wallet</span>
          <span>Carteira</span>
        </Link>
        <Link to="/perfil" className={getNavClass(activeMenu === "settings")}>
          <span className="material-symbols-outlined">settings</span>
          <span>Configurações</span>
        </Link>
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <Link
          to="/perfil"
          className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-clarity-surface"
        >
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-clarity-border">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIbC9D9n5OGmCFMz8XJhW478h2NWUKstQPE_uRPMbayN6-I8zVDk60do5bg6vTBMEYcG3xPNoZS4ah449pRH6fDyY_LNGEdyEHvWcgIvJbV_l0WAVnJ4caZ9Dn-mpNFRrJjByyfmCNZk4cccNrs_FTYxQRTu564b1e6Hn1Byyw_SkK4aplPfjehYtxPgq83o7ZXy0frquApk-5kpkZjLIkF4UxKrxfu9kchhTDX80EtqT5noqWY5Ar7av0Gc_tUV0ZRf05jOoIGkA"
              alt="Avatar do usuário logado"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-col overflow-hidden">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{displayEmail}</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
