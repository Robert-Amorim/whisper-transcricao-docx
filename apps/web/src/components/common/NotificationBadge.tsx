type NotificationBadgeProps = {
  count: number;
  className?: string;
};

export default function NotificationBadge({ count, className = "" }: NotificationBadgeProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold leading-none text-white ${className}`}
      aria-label={`${count} notificacao${count === 1 ? "" : "oes"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
