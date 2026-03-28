type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-8 border-[3px]"
};

export default function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${sizeMap[size]} ${className}`}
      role="status"
      aria-label="Carregando"
    />
  );
}
