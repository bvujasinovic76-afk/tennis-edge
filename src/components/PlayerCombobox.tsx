"use client";

import { useId, useMemo } from "react";
import type { Player } from "@/lib/elo";

/** Searchable player picker backed by a native <datalist> — works across ~500+ players without a UI library. */
export default function PlayerCombobox({
  label,
  value,
  onChange,
  players,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
  players: Player[];
}) {
  const listId = useId();
  const byName = useMemo(() => new Set(players.map((p) => p.name)), [players]);

  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</label>
      <input
        list={listId}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
        }}
        placeholder="Traži igrača po imenu…"
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <datalist id={listId}>
        {players.map((p) => (
          <option key={p.name} value={p.name}>
            {`#${p.atpRank ?? "—"} · Elo ${p.elo}`}
          </option>
        ))}
      </datalist>
      {!byName.has(value) && value.length > 0 && (
        <p className="mt-1 text-[11px] text-risk">Igrač nije prepoznat — izaberi iz liste.</p>
      )}
    </div>
  );
}
