"use client";

import { useEffect, useState } from "react";
import type { Surface } from "@/lib/elo";
import { useBankroll, formatMoney } from "./BankrollContext";

type PlanPick = {
  matchId: number;
  tournament: string;
  startTime: string;
  surface: Surface;
  playerA: string;
  playerB: string;
  pick: string;
  opponent: string;
  modelProb: number;
  confidence: number;
  tier: "visok" | "srednji";
  estOdds: number;
  stake: number;
  estProfit: number;
  reasons: string[];
};

type PlanResp = { date: string; locked: boolean; generatedAt?: string; bankrollAtGen?: number; picks: PlanPick[]; error?: string; message?: string };

function belgradeDateStr(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);
}

const DAY_TABS = [
  { off: 0, label: "Danas" },
  { off: 1, label: "Sutra" },
  { off: 2, label: "Prekosutra" },
];

export default function DailyPlanCalendar({ onAnalyze }: { onAnalyze: (a: string, b: string, s: Surface) => void }) {
  const { state, stats, authed, placeBet, refresh } = useBankroll();
  const [dayOff, setDayOff] = useState(0);
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [regen, setRegen] = useState(false);
  const [placed, setPlaced] = useState<Record<number, boolean>>({});

  const dateStr = belgradeDateStr(dayOff);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setPlan(null);
    fetch(`/api/daily-plan?date=${dateStr}`)
      .then((r) => r.json())
      .then((j) => setPlan(j))
      .catch(() => setPlan({ date: dateStr, locked: false, picks: [], error: "Greška pri učitavanju plana." }))
      .finally(() => setLoading(false));
  }, [dateStr, authed]);

  async function regenerate() {
    setRegen(true);
    try {
      const r = await fetch("/api/daily-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dateStr }) });
      setPlan(await r.json());
    } finally {
      setRegen(false);
    }
  }

  if (!authed) return null;

  const cur = state?.currency ?? "RSD";
  const picks = plan?.picks ?? [];
  const totalStake = picks.reduce((s, p) => s + p.stake, 0);
  const totalProfit = picks.reduce((s, p) => s + p.estProfit, 0);
  const bankrollNow = stats?.currentBankroll ?? 0;
  const isToday = dayOff === 0;

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-display font-bold text-lg text-ink" style={{ fontStretch: "85%" }}>
          Dnevni listić — {isToday ? "šta igramo danas" : "najava"}
        </h3>
        <div className="flex items-center gap-2">
          {plan?.generatedAt && (
            <span className="text-[11px] text-muted">
              plan napravljen {new Date(plan.generatedAt).toLocaleString("sr-RS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={regenerate} disabled={regen || loading} className="text-xs rounded-md border border-line bg-paper px-2.5 py-1 text-ink-soft hover:border-accent hover:text-accent transition-colors disabled:opacity-50">
            {regen ? "Pravim…" : "Napravi ponovo"}
          </button>
        </div>
      </div>

      {/* kalendar dana */}
      <div className="flex gap-1.5 mb-4">
        {DAY_TABS.map((d) => {
          const on = d.off === dayOff;
          const ds = belgradeDateStr(d.off);
          return (
            <button
              key={d.off}
              onClick={() => setDayOff(d.off)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${on ? "border-accent bg-surface-alt/60" : "border-line bg-paper hover:border-accent/50"}`}
            >
              <p className={`text-[13px] font-semibold ${on ? "text-accent" : "text-ink"}`}>{d.label}</p>
              <p className="text-[11px] text-muted tabular">{ds.slice(8, 10)}.{ds.slice(5, 7)}.</p>
            </button>
          );
        })}
      </div>

      {!isToday && (
        <p className="mb-3 text-[12px] rounded-md bg-surface-alt px-3 py-2 text-ink-soft">
          ⓘ Ovo je <strong>najava</strong> — ujutru na dan meča ide glavna provera sa svim alatima (istraživanje, povrede, kvote), pa se plan može promeniti.
        </p>
      )}

      {loading && <p className="text-sm text-muted">Pravim plan…</p>}
      {plan?.error && <p className="text-sm text-risk">{plan.error}</p>}
      {!loading && !plan?.error && picks.length === 0 && (
        <p className="text-sm text-muted">{plan?.message ?? "Za ovaj dan nema mečeva koji prolaze naše kriterijume (ili feed još nema raspored)."}</p>
      )}

      {picks.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 px-2 font-medium">Vreme</th>
                  <th className="py-2 px-2 font-medium">Meč / zašto</th>
                  <th className="py-2 px-2 font-medium">Igramo</th>
                  <th className="py-2 px-2 font-medium text-right">Model</th>
                  <th className="py-2 px-2 font-medium text-right">Kvota ~</th>
                  <th className="py-2 px-2 font-medium text-right">Ulog</th>
                  <th className="py-2 px-2 font-medium text-right">Ako prođe ~</th>
                  <th className="py-2 pl-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p, i) => (
                  <tr key={p.matchId} className="border-b border-line/60">
                    <td className="py-2 pr-2 font-mono text-accent text-[12px]">{i + 1}</td>
                    <td className="py-2 px-2 text-[12px] text-muted whitespace-nowrap">
                      {new Date(p.startTime).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 px-2">
                      <p className="text-[13px] text-ink">{p.playerA} <span className="text-muted">vs</span> {p.playerB}</p>
                      <p className="text-[11px] text-muted">{p.reasons.join(" · ") || p.tournament}</p>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-semibold text-ink text-[13px]">{p.pick}</span>
                      <span className={`ml-1.5 text-[10px] rounded px-1.5 py-0.5 font-medium ${p.tier === "visok" ? "bg-good-bg text-good" : "bg-surface-alt text-ink-soft"}`}>
                        {p.tier}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular text-[13px] font-semibold text-ink">{Math.round(p.modelProb * 100)}%</td>
                    <td className="py-2 px-2 text-right tabular text-[13px] text-muted">{p.estOdds.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular text-[13px] font-semibold text-ink">{formatMoney(p.stake, cur)}</td>
                    <td className="py-2 px-2 text-right tabular text-[13px] text-good">+{formatMoney(p.estProfit, cur)}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button onClick={() => onAnalyze(p.pick, p.opponent, p.surface)} className="text-[11px] text-accent hover:underline mr-2">analiza</button>
                      {isToday && (
                        <button
                          onClick={async () => {
                            await placeBet({
                              matchLabel: `${p.playerA} vs ${p.playerB} (${p.surface})`,
                              pick: p.pick,
                              odds: p.estOdds,
                              stake: p.stake,
                              modelProb: p.modelProb,
                            });
                            setPlaced((x) => ({ ...x, [p.matchId]: true }));
                            await refresh();
                          }}
                          disabled={placed[p.matchId]}
                          className="text-[11px] rounded bg-accent text-accent-contrast font-semibold px-2 py-1 disabled:opacity-50 hover:brightness-95 transition"
                        >
                          {placed[p.matchId] ? "✓" : "Igraj"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid sm:grid-cols-3 gap-3 rounded-lg border border-accent/40 bg-paper p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Parova u listiću</p>
              <p className="font-display font-bold text-xl text-ink tabular" style={{ fontStretch: "85%" }}>{picks.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Ukupan ulog</p>
              <p className="font-display font-bold text-xl text-ink tabular" style={{ fontStretch: "85%" }}>{formatMoney(totalStake, cur)}</p>
              <p className="text-[11px] text-muted tabular">{bankrollNow ? ((totalStake / bankrollNow) * 100).toFixed(1) : "0"}% bankrolla</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Ako sve prođe (~)</p>
              <p className="font-display font-bold text-xl text-good tabular" style={{ fontStretch: "85%" }}>+{formatMoney(totalProfit, cur)}</p>
              <p className="text-[11px] text-muted tabular">bankroll ≈ {formatMoney(bankrollNow + totalProfit, cur)}</p>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted">
            Kvote su <strong>procena</strong> (nemamo live kvote na hostingu) — pravi iznos vidiš kad odigraš i slikaš tiket.
            Ulog je ravnomeran po tieru (2% / 1.25% bankrolla), ne Kelly, jer bez prave kvote nema pravog edge-a. 18+.
          </p>
        </>
      )}
    </div>
  );
}
