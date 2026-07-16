"use client";

import { useEffect, useState } from "react";
import { useBankroll } from "./BankrollContext";

type ArchiveRow = {
  id: string;
  kind: "council" | "research";
  player_a: string;
  player_b: string;
  surface: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const KIND_LABEL = { council: "AI konzilijum", research: "Istraživanje" } as const;

function summaryOf(row: ArchiveRow): string {
  try {
    if (row.kind === "council") {
      const final = row.payload.final as { finalPick?: string; confidence?: number; narrative?: string } | undefined;
      const pick = final?.finalPick === "A" ? row.player_a : final?.finalPick === "B" ? row.player_b : "?";
      return `Pick: ${pick} (${final?.confidence ?? "?"}%) — ${(final?.narrative ?? "").slice(0, 140)}…`;
    }
    const synth = row.payload.synth as { headline?: string } | undefined;
    return synth?.headline ?? "";
  } catch {
    return "";
  }
}

export default function ArchiveList() {
  const { authed } = useBankroll();
  const [rows, setRows] = useState<ArchiveRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/analyses")
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((j) => setRows(j.analyses ?? []))
      .catch(() => setRows([]));
  }, [authed]);

  if (!authed) {
    return <p className="text-sm text-muted">Prijavi se da vidiš svoju arhivu analiza — svaka AI analiza se automatski čuva.</p>;
  }
  if (rows === null) return <p className="text-sm text-muted">Učitavanje arhive…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted">Arhiva je prazna — pokreni AI konzilijum ili Istraživanje i analiza će se sačuvati ovde.</p>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg bg-surface-alt/50 p-3">
          <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[10px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 bg-accent text-accent-contrast">{KIND_LABEL[r.kind]}</span>
              <span className="font-medium text-ink">{r.player_a} vs {r.player_b}</span>
              <span className="text-muted">· {r.surface} · {new Date(r.created_at).toLocaleString("sr-RS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">{summaryOf(r)}</p>
          </button>
          {open === r.id && (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-paper p-3 text-[11px] text-ink-soft whitespace-pre-wrap">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
