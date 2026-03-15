type DashboardTopbarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
};

export default function DashboardTopbar({
  searchTerm,
  onSearchTermChange
}: DashboardTopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 backdrop-blur-md dark:border-slate-800 dark:bg-background-dark/50">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800">
          v1.4.2
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="group relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl text-slate-400">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar arquivos..."
            className="min-h-0 w-64 rounded-lg border-none bg-slate-100 py-2 pl-10 pr-4 text-sm transition-all focus:ring-2 focus:ring-primary dark:bg-slate-800"
          />
        </div>

        <button
          type="button"
          className="relative min-h-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500" />
        </button>
      </div>
    </header>
  );
}
