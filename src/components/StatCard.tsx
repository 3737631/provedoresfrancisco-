export function StatCard({
  label,
  value,
  hint,
  color = "brand",
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  color?: "brand" | "emerald" | "amber" | "rose" | "slate";
  icon?: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`rounded-lg p-2.5 ${colors[color]}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
        {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}