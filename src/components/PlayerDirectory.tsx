"use client";

import { useMemo, useState } from "react";
import type { Player } from "@/lib/elo";

const COMBINING_MARKS = /[̀-ͯ]/g;

function normalize(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

export default function PlayerDirectory({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...players].sort((a, b) => (a.atpRank ?? 1e9) - (b.atpRank ?? 1e9)),
    [players]
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return sorted;
    return sorted.filter((p) => normalize(p.name).includes(q));
  }, [sorted, query]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pretraži igrača po imenu…"
          className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-muted whitespace-nowrap tabular">
          {filtered.length} / {players.length} igrača
        </p>
      </div>
      <div className="overflow-auto max-h-[520px] rounded-lg border border-line">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">ATP #</th>
              <th className="px-3 py-2 font-medium">Igrač</th>
              <th className="px-3 py-2 font-medium text-right">Forma</th>
              <th className="px-3 py-2 font-medium text-right">Elo</th>
              <th className="px-3 py-2 font-medium text-right" title="Elo / % pobeda na tvrdoj podlozi">Tvrda</th>
              <th className="px-3 py-2 font-medium text-right" title="Elo / % pobeda na šljaci">Šljaka</th>
              <th className="px-3 py-2 font-medium text-right" title="Elo / % pobeda na travi">Trava</th>
              <th className="px-3 py-2 font-medium text-right">Mečeva</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.name} className="border-t border-line bg-surface">
                <td className="px-3 py-2 text-muted tabular">{p.atpRank ?? "—"}</td>
                <td className="px-3 py-2 font-medium text-ink">{p.name}</td>
                <td className="px-3 py-2 text-right tabular">
                  <FormCell wins={p.form?.wins} total={p.form?.total} />
                </td>
                <td className="px-3 py-2 text-right tabular font-semibold text-ink">{p.elo}</td>
                <SurfaceCell elo={p.surfaceElo.Hard} rec={p.surfaceRecord?.Hard} />
                <SurfaceCell elo={p.surfaceElo.Clay} rec={p.surfaceRecord?.Clay} />
                <SurfaceCell elo={p.surfaceElo.Grass} rec={p.surfaceRecord?.Grass} />
                <td className="px-3 py-2 text-right tabular text-muted">{p.matches}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  Nema igrača za &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormCell({ wins, total }: { wins?: number; total?: number }) {
  if (total == null || total === 0) return <span className="text-muted">—</span>;
  const losses = total - wins!;
  const tone = wins! >= 8 ? "text-good" : wins! <= 3 ? "text-risk" : "text-ink-soft";
  return (
    <span className={`font-medium ${tone}`} title={`${wins}-${losses} u poslednjih ${total} mečeva`}>
      {wins}-{losses}
    </span>
  );
}

function SurfaceCell({ elo, rec }: { elo?: number; rec?: { wins: number; losses: number; pct: number } }) {
  return (
    <td className="px-3 py-2 text-right tabular text-ink-soft">
      {elo ?? "—"}
      {rec && rec.wins + rec.losses > 0 && (
        <span className="block text-[10px] text-muted">{rec.pct}%</span>
      )}
    </td>
  );
}
