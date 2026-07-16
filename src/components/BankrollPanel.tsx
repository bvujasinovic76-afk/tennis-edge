"use client";

import { useState } from "react";
import { useBankroll, formatMoney } from "./BankrollContext";
import { betPnl, type Bet } from "@/lib/bankroll";

export default function BankrollPanel() {
  const { state, stats, loading, authed, setBankroll, settleBet, deleteBet, reset } = useBankroll();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [mult, setMult] = useState("0.25");

  if (loading && !state) return <p className="text-sm text-muted">Učitavanje bankrolla…</p>;
  if (!authed) {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-sm p-6 text-center">
        <p className="text-ink font-semibold mb-1">Prijavi se da pratiš svoj bankroll</p>
        <p className="text-sm text-muted mb-4">Napravi nalog (ili se prijavi) da uneseš ulog i pratiš tikete, profit i statistiku.</p>
        <a href="/login" className="inline-block rounded-md bg-accent text-accent-contrast font-semibold text-sm px-5 py-2.5 hover:brightness-95 transition">
          Prijava / Napravi nalog
        </a>
      </div>
    );
  }
  if (!state || !stats) return null;

  const profit = stats.realizedPnl;
  const profitTone = profit > 0 ? "text-good" : profit < 0 ? "text-risk" : "text-ink";

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Trenutni bankroll</p>
          <p className="font-display font-bold text-4xl text-ink tabular" style={{ fontStretch: "85%" }}>
            {formatMoney(stats.currentBankroll, stats.currency)}
          </p>
          <p className="text-xs text-muted mt-1 tabular">
            Start: {formatMoney(stats.startingBankroll, stats.currency)} · Kelly ×{state.kellyMultiplier} · dostupno{" "}
            {formatMoney(stats.availableBankroll, stats.currency)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing((v) => !v);
              setAmount(String(state.startingBankroll));
              setMult(String(state.kellyMultiplier));
            }}
            className="text-xs rounded-md border border-line bg-paper px-3 py-1.5 text-ink-soft hover:border-accent hover:text-accent transition-colors"
          >
            {editing ? "Zatvori" : "Podesi bankroll"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-5 rounded-lg bg-surface-alt/60 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">Početni bankroll ({state.currency})</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">Kelly množilac (opreznost)</span>
            <select
              value={mult}
              onChange={(e) => setMult(e.target.value)}
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="0.125">1/8 — vrlo oprezno</option>
              <option value="0.25">1/4 — preporučeno</option>
              <option value="0.5">1/2 — agresivno</option>
              <option value="1">Pun Kelly — vrlo rizično</option>
            </select>
          </label>
          <button
            onClick={() => {
              const a = parseFloat(amount);
              if (a > 0) {
                setBankroll(a, parseFloat(mult));
                setEditing(false);
              }
            }}
            className="rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2 hover:brightness-95 transition"
          >
            Sačuvaj
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Profit / gubitak" value={`${profit >= 0 ? "+" : ""}${formatMoney(profit, stats.currency)}`} tone={profitTone} />
        <Stat label="ROI" value={`${stats.roiPct >= 0 ? "+" : ""}${stats.roiPct.toFixed(1)}%`} tone={stats.roiPct >= 0 ? "text-good" : "text-risk"} />
        <Stat label="Uspešnost" value={stats.settledBets > 0 ? `${stats.winRatePct.toFixed(0)}%` : "—"} sub={`${stats.wins}-${stats.losses}`} />
        <Stat label="Tiketa (aktivnih)" value={`${stats.totalBets}`} sub={`${stats.pendingBets} u toku`} />
      </div>

      <BankrollSpark startingBankroll={state.startingBankroll} bets={state.bets} currency={stats.currency} />

      <div className="border-t border-line pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wide text-muted">Istorija tiketa</p>
          {state.bets.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Obrisati sve tikete i resetovati bankroll?")) reset();
              }}
              className="text-xs text-risk hover:underline"
            >
              Resetuj sve
            </button>
          )}
        </div>
        {state.bets.length === 0 ? (
          <p className="text-sm text-muted">
            Još nema odigranih tiketa. Iz &quot;Dnevnog plana&quot; ili kalkulatora klikni &quot;Dodaj na tiket&quot; da počneš praćenje.
          </p>
        ) : (
          <div className="space-y-2">
            {state.bets.map((bet) => (
              <BetRow key={bet.id} bet={bet} currency={stats.currency} onSettle={settleBet} onDelete={deleteBet} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Kretanje bankrolla kroz obeležene tikete — čovek na jedan pogled vidi da li ide gore ili dole. */
function BankrollSpark({ startingBankroll, bets, currency }: { startingBankroll: number; bets: Bet[]; currency: string }) {
  const settled = bets
    .filter((b) => b.status === "won" || b.status === "lost")
    .sort((x, y) => new Date(x.settledAt ?? x.placedAt).getTime() - new Date(y.settledAt ?? y.placedAt).getTime());
  if (settled.length < 2) return null;

  let run = startingBankroll;
  const vals = [run];
  for (const b of settled) {
    run += betPnl(b);
    vals.push(run);
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 260;
  const H = 56;
  const P = 4;
  const pts = vals.map((v, i) => [P + (i * (W - 2 * P)) / (vals.length - 1), H - P - ((v - min) / span) * (H - 2 * P)] as const);
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? "var(--good)" : "var(--risk)";
  const last = pts[pts.length - 1];

  return (
    <div className="mb-5 rounded-lg border border-line bg-paper px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-muted">Kretanje bankrolla (obeleženi tiketi)</p>
        <p className={`text-xs tabular font-semibold ${up ? "text-good" : "text-risk"}`}>
          {formatMoney(vals[0], currency)} → {formatMoney(vals[vals.length - 1], currency)}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] h-14" role="img" aria-label="Grafik kretanja bankrolla kroz odigrane tikete">
        <line x1={P} y1={H - P - ((startingBankroll - min) / span) * (H - 2 * P)} x2={W - P} y2={H - P - ((startingBankroll - min) / span) * (H - 2 * P)} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 3" />
        <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
      </svg>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{label}</p>
      <p className={`font-semibold text-lg tabular ${tone ?? "text-ink"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted tabular">{sub}</p>}
    </div>
  );
}

function BetRow({
  bet,
  currency,
  onSettle,
  onDelete,
}: {
  bet: Bet;
  currency: string;
  onSettle: (id: string, status: "won" | "lost" | "void") => void;
  onDelete: (id: string) => void;
}) {
  const pnl = betPnl(bet);
  const statusLabel: Record<Bet["status"], string> = { pending: "u toku", won: "dobitak", lost: "gubitak", void: "poništen" };
  const statusTone: Record<Bet["status"], string> = {
    pending: "bg-surface-alt text-ink-soft",
    won: "bg-good-bg text-good",
    lost: "bg-risk-bg text-risk",
    void: "bg-surface-alt text-muted",
  };
  return (
    <div className="rounded-lg bg-surface-alt/50 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">
          <strong>{bet.pick}</strong> <span className="text-muted">@ {bet.odds.toFixed(2)}</span>
        </p>
        <p className="text-[11px] text-muted truncate">{bet.matchLabel}</p>
      </div>
      <div className="text-sm tabular whitespace-nowrap">
        <span className="text-muted">ulog </span>
        <span className="text-ink font-medium">{formatMoney(bet.stake, currency)}</span>
        {bet.status !== "pending" && bet.status !== "void" && (
          <span className={`ml-2 font-semibold ${pnl >= 0 ? "text-good" : "text-risk"}`}>
            {pnl >= 0 ? "+" : ""}
            {formatMoney(pnl, currency)}
          </span>
        )}
      </div>
      <span className={`text-[11px] rounded px-2 py-0.5 font-medium ${statusTone[bet.status]}`}>{statusLabel[bet.status]}</span>
      {bet.status === "pending" ? (
        <div className="flex gap-1">
          <button onClick={() => onSettle(bet.id, "won")} className="text-[11px] rounded border border-line px-2 py-1 text-good hover:bg-good-bg transition-colors" title="Dobitak">
            ✓
          </button>
          <button onClick={() => onSettle(bet.id, "lost")} className="text-[11px] rounded border border-line px-2 py-1 text-risk hover:bg-risk-bg transition-colors" title="Gubitak">
            ✗
          </button>
          <button onClick={() => onSettle(bet.id, "void")} className="text-[11px] rounded border border-line px-2 py-1 text-muted hover:bg-surface-alt transition-colors" title="Poništi">
            —
          </button>
        </div>
      ) : (
        <button onClick={() => onDelete(bet.id)} className="text-[11px] text-muted hover:text-risk transition-colors" title="Obriši">
          obriši
        </button>
      )}
    </div>
  );
}
