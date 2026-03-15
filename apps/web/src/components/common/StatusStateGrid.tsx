import { DEFAULT_MONITORING_ITEMS } from "./MonitoringPanel";

type StatusStateGridProps = {
  containerClassName: string;
  itemBaseClassName: string;
};

const STATES = DEFAULT_MONITORING_ITEMS.map((item) => ({
  tone: item.tone,
  label: item.title ?? "Vazio"
}));

export default function StatusStateGrid({
  containerClassName,
  itemBaseClassName
}: StatusStateGridProps) {
  return (
    <div className={containerClassName}>
      {STATES.map((state) => (
        <div key={state.tone} className={`${itemBaseClassName} ${state.tone}`}>
          {state.label}
        </div>
      ))}
    </div>
  );
}
