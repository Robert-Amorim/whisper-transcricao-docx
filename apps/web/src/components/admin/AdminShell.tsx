import type { ReactNode } from "react";
import AdminSidebar from "./AdminSidebar";
import type { PublicUser } from "../../lib/types";

type AdminShellProps = {
  user: PublicUser | null;
  activeMenu?: "overview" | "tickets" | "users";
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function AdminShell({
  user,
  activeMenu,
  title,
  subtitle,
  actions,
  children
}: AdminShellProps) {
  return (
    <main className="font-body text-slate-100 antialiased">
      <div className="flex min-h-screen flex-col bg-[#020617] lg:h-screen lg:flex-row lg:overflow-hidden">
        <AdminSidebar user={user} activeMenu={activeMenu} />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-slate-800 bg-slate-950/80 px-4 py-5 backdrop-blur sm:px-6 lg:min-h-24 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex min-w-0 flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.24em] text-primary/70">Operações</p>
              <h1 className="mt-1.5 font-display text-xl font-black tracking-tight text-white sm:text-2xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            </div>
            {actions ? <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">{actions}</div> : null}
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
