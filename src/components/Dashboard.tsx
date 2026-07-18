"use client";

import { useState } from "react";
import { useBankroll, formatMoney } from "./BankrollContext";

/** Sažet pregled: koliko imam, koliko je u igri, koliko može biti — plus aktivni tiketi. */
export default function Dashboard() {
  const { state, stats, authed, loading, settleBet, refresh } = useBankroll();
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");

  async function checkResults() {
    setChecking(true);
    setCheckMsg("");
    try {
      const res = await fetch("/api/autosettle", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setCheckMsg(j.message ?? "Provereno.");
      if (j.settled?.length) await refresh();
    } catch (e) {
      setCheckMsg(e instanceof Error ? e.message : "Greška.");
    } finally {
      setChecking(false);
    }
  }

  if (loading && !state) return <p className="text-sm text-muted">Učitavanje…</p>;

  if (!authed) {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-sm p-8 text-center">
        <p className="font-display font-bold text-2xl text-ink mb-2" style={{ fontStretch: "85%" }}>Prijavi se da vidiš svoj plan</p>
        <p className="text-sm text-muted mb-5 max-w-[46ch] mx-auto">
          Uneseš koliko imaš, a aplikacija ti pokazuje šta se danas igra, koliko da uložiš i koliko bi bilo ako sve prođe.
        </p>
        <a href="/login" className="inline-block rounded-md bg-accent text-accent-contrast font-semibold text-sm px-6 py-3 hover:brightness-95 transition">
          Prijava / Napravi nalog
        </a>
      </div>
    );
  }
  if (!state || !stats) return null;

  const cur = stats.currency;
  const pending = state.bets.filter((x) => x.status === "pending");
  const pendingStake = pending.reduce((s, x) => s + x.stake, 0);
  const pendingPotential = pending.reduce((s, x) => s + x.stake * (x.odds - 1), 0);
  const ifAllWin = stats.currentBankroll + pendingPotential;
  const ifAllLose = stats.currentBankroll - pendingStake;

  return (
    <div className="space-y-4">
      {/* hero brojke */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroTile label="Moj bankroll" value={formatMoney(stats.currentBankroll, cur)} sub={`start ${formatMoney(stats.startingBankroll, cur)}`} />
        <HeroTile
          label="Profit / gubitak"
          value={`${stats.realizedPnl >= 0 ? "+" : ""}${formatMoney(stats.realizedPnl, cur)}`}
          sub={`ROI ${stats.roiPct >= 0 ? "+" : ""}${stats.roiPct.toFixed(1)}% · ${stats.wins}-${stats.losses}`}
          tone={stats.realizedPnl > 0 ? "good" : stats.realizedPnl < 0 ? "risk" : undefined}
        />
        <HeroTile label="U igri sada" value={formatMoney(pendingStake, cur)} sub={`${pending.length} ${pending.length === 1 ? "tiket" : "tiketa"} u toku`} />
        <HeroTile
          label="Ako sve prođe"
          value={formatMoney(ifAllWin, cur)}
          sub={pendingPotential > 0 ? `+${formatMoney(pendingPotential, cur)} dobitka` : "nema aktivnih tiketa"}
          tone={pendingPotential > 0 ? "good" : undefined}
        />
      </div>

      {/* aktivni tiketi — samo kad ih ima */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-line bg-surface shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-ink">Aktivni tiketi</p>
            <button onClick={checkResults} disabled={checking} className="text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition">
              {checking ? "Proveravam…" : "Proveri rezultate"}
            </button>
          </div>
          {checkMsg && <p className="text-xs text-ink-soft mb-2">{checkMsg}</p>}
          <div className="space-y-1.5">
            {pending.map((bt) => (
              <div key={bt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] border-b border-line/40 last:border-0 pb-1.5">
                <span className="font-medium text-ink min-w-0 truncate">{bt.pick}</span>
                <span className="text-muted text-[12px] truncate">{bt.matchLabel}</span>
                <span className="tabular text-ink-soft ml-auto">@{bt.odds.toFixed(2)}</span>
                <span className="tabular text-ink">{formatMoney(bt.stake, cur)}</span>
                <span className="tabular text-good">+{formatMoney(bt.stake * (bt.odds - 1), cur)}</span>
                <span className="whitespace-nowrap">
                  <button onClick={() => settleBet(bt.id, "won")} className="rounded border border-line px-1.5 py-0.5 text-good hover:bg-good-bg transition-colors mr-1" title="Dobitak">✓</button>
                  <button onClick={() => settleBet(bt.id, "lost")} className="rounded border border-line px-1.5 py-0.5 text-risk hover:bg-risk-bg transition-colors" title="Gubitak">✗</button>
                </span>
                {bt.legs && bt.legs.length >= 2 && (
                  <span className="w-full text-[11px] text-muted">
                    {bt.legs.map((l, i) => (
                      <span key={i} className="mr-2">
                        <span className={l.result === "won" ? "text-good" : l.result === "lost" ? "text-risk" : ""}>{l.result === "won" ? "✓" : l.result === "lost" ? "✗" : "•"}</span> {l.pick}
                      </span>
                    ))}
                    — pada ako bilo koji padne
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded bg-good-bg text-good px-2 py-1 tabular">sve prođe → {formatMoney(ifAllWin, cur)}</span>
            <span className="rounded bg-risk-bg text-risk px-2 py-1 tabular">sve padne → {formatMoney(ifAllLose, cur)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "risk" }) {
  const t = tone === "good" ? "text-good" : tone === "risk" ? "text-risk" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{label}</p>
      <p className={`font-display font-bold tabular text-xl ${t}`} style={{ fontStretch: "85%" }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5 tabular">{sub}</p>}
    </div>
  );
}
