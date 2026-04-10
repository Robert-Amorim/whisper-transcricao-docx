type DashboardTopbarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
};

export default function DashboardTopbar({
  searchTerm,
  onSearchTermChange
}: DashboardTopbarProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
      <h2 className="font-display text-xl font-bold tracking-tight">Dashboard</h2>

      <div className="group relative w-full sm:max-w-xs">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
          search
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Buscar arquivos..."
          className="min-h-0 w-full rounded-lg border-none bg-slate-100 py-2 pl-9 pr-4 font-body text-sm transition-all focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:placeholder:text-slate-500"
        />
      </div>
    </header>
  );
}
