export function MetaCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wide text-muted mb-1">{k}</p>
      <p className="text-sm font-semibold text-ink tabular">{v}</p>
    </div>
  );
}

export function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3.5 mb-4">
      <span className="font-mono text-sm font-bold text-accent">{num} —</span>
      <h2 className="font-display font-bold text-2xl text-ink">{title}</h2>
    </div>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "risk" }) {
  const toneClass = tone === "good" ? "text-good" : tone === "risk" ? "text-risk" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-surface shadow-sm px-4 py-3.5">
      <p className="text-[10.5px] uppercase tracking-wide text-muted mb-1.5">{label}</p>
      <p className={`font-display font-bold text-2xl tabular ${toneClass}`} style={{ fontStretch: "85%" }}>
        {value}
      </p>
    </div>
  );
}
