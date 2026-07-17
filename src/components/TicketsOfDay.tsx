"use client";

import { useEffect, useState } from "react";
import type { Surface } from "@/lib/elo";
import { useBankroll, formatMoney } from "./BankrollContext";

type Leg = { matchId: number; match: string; tournament: string; startTime: string; surface: Surface; pick: string; opponent: string; prob: number; odds: number };
type Ticket = {
  kind: "duplas" | "rizican";
  title: string;
  legs: Leg[];
  totalOdds: number;
  hitProb: number;
  stake: number;
  potentialReturn: number;
  potentialProfit: number;
  evPct: number;
  warning: string | null;
};
type Resp = { date: string; currency: string; bankroll: number; matchesAvailable: number; tickets: Ticket[]; notes?: string[]; error?: string };

export default function TicketsOfDay({ onAnalyze }: { onAnalyze: (a: string, b: string, s: Surface) => void }) {
  const { authed, placeBet, refresh } = useBankroll();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [placed, setPlaced] = useState<Record<string, boolean>>({});
  const [stakes, setStakes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetch("/api/tickets-of-day")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ date: "", currency: "RSD", bankroll: 0, matchesAvailable: 0, tickets: [], error: "Greška." }))
      .finally(() => setLoading(false));
  }, [authed]);

  if (!authed) return null;

  const cur = data?.currency ?? "RSD";

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <h3 className="font-display font-bold text-lg text-ink mb-1" style={{ fontStretch: "85%" }}>
        🎟️ Tiket dana — kombinacije
      </h3>
      <p className="text-sm text-muted mb-4 max-w-[70ch]">
        Dva predloga: jedan da <strong>dupliraš</strong> (cilj kvota ~2.0) i jedan <strong>rizičan</strong> za veliku kvotu.
        Uz svaki piše <strong>prava šansa da prođe</strong> — jer kombinacija je jedan tiket: padne li jedan par, pada sve.
      </p>

      {loading && <p className="text-sm text-muted">Sastavljam tikete…</p>}
      {data?.error && <p className="text-sm text-risk">{data.error}</p>}
      {data && !data.error && data.tickets.length === 0 && (
        <p className="text-sm text-muted">
          Danas nema dovoljno mečeva iz naše baze ({data.matchesAvailable}) da sastavim kombinaciju.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data?.tickets.map((t) => {
          const key = t.kind;
          const stakeVal = stakes[key] ?? String(t.stake);
          const stakeNum = parseFloat(stakeVal) || 0;
          const ret = Math.round(stakeNum * t.totalOdds);
          const isRisky = t.kind === "rizican";
          return (
            <div key={key} className={`rounded-lg border p-4 ${isRisky ? "border-risk-line bg-risk-bg/30" : "border-accent/50 bg-paper"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`font-semibold text-sm ${isRisky ? "text-risk" : "text-accent"}`}>{t.title}</p>
                <span className="font-display font-bold text-xl text-ink tabular" style={{ fontStretch: "85%" }}>
                  {t.totalOdds.toFixed(2)}
                </span>
              </div>

              <table className="w-full text-[12px] border-collapse mb-3">
                <tbody>
                  {t.legs.map((l, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="py-1.5 pr-2">
                        <button onClick={() => onAnalyze(l.pick, l.opponent, l.surface)} className="text-left hover:underline">
                          <span className="font-medium text-ink">{l.pick}</span>
                          <span className="text-muted"> protiv {l.opponent}</span>
                        </button>
                        <p className="text-[10px] text-muted">
                          {new Date(l.startTime).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })} · {l.tournament}
                        </p>
                      </td>
                      <td className="py-1.5 px-1 text-right tabular text-muted whitespace-nowrap">{Math.round(l.prob * 100)}%</td>
                      <td className="py-1.5 pl-1 text-right tabular font-semibold text-ink whitespace-nowrap">{l.odds.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Poštena matematika — ovo je najvažniji red */}
              <div className="rounded-md bg-surface px-3 py-2 mb-3 border border-line">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted">Šansa da CEO tiket prođe</span>
                  <span className={`tabular font-bold ${t.hitProb >= 0.5 ? "text-good" : t.hitProb >= 0.25 ? "text-ink" : "text-risk"}`}>
                    {Math.round(t.hitProb * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[12px] mt-1">
                  <span className="text-muted">Očekivana vrednost (EV)</span>
                  <span className={`tabular font-medium ${t.evPct >= 0 ? "text-good" : "text-risk"}`}>
                    {t.evPct >= 0 ? "+" : ""}{t.evPct}%
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Ulog ({cur})</span>
                  <input
                    type="number"
                    value={stakeVal}
                    onChange={(e) => setStakes((s) => ({ ...s, [key]: e.target.value }))}
                    className="w-24 rounded border border-line bg-paper px-2 py-1 text-[13px] text-ink tabular focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </label>
                <p className="text-[13px] text-ink-soft tabular pb-1">
                  Ako prođe: <strong className="text-good">{formatMoney(ret, cur)}</strong>
                </p>
                <button
                  onClick={async () => {
                    await placeBet({
                      matchLabel: `Kombinacija ${t.legs.length} para · ${t.kind === "duplas" ? "duplaš" : "rizičan"}`,
                      pick: t.legs.map((l) => l.pick).join(" + "),
                      odds: t.totalOdds,
                      stake: stakeNum,
                      modelProb: t.hitProb,
                      legs: t.legs.map((l) => ({ match: l.match, pick: l.pick, odds: l.odds })),
                    });
                    setPlaced((p) => ({ ...p, [key]: true }));
                    await refresh();
                  }}
                  disabled={placed[key] || !(stakeNum > 0)}
                  className="ml-auto text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition"
                >
                  {placed[key] ? "Odigrano ✓" : "Igraj tiket"}
                </button>
              </div>

              {t.warning && (
                <p className={`mt-2 text-[11px] ${isRisky ? "text-risk" : "text-ink-soft"}`}>⚠️ {t.warning}</p>
              )}
            </div>
          );
        })}
      </div>

      {data?.notes && data.notes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {data.notes.map((n, i) => (
            <p key={i} className="text-[12px] rounded-md bg-surface-alt px-3 py-2 text-ink-soft">ⓘ {n}</p>
          ))}
        </div>
      )}

      {data && data.tickets.length > 0 && (
        <p className="mt-4 text-[11px] text-muted">
          Kvote su procena (nemamo live kvote na hostingu) — kad odigraš, slikaj tiket pa se upiše tačna kvota.
          <strong> Negativan EV znači da tiket dugoročno gubi</strong> — model još nema dokazan edge, pa uzmi ovo kao
          predlog za mali ulog i praćenje, ne kao siguran novac. 18+.
        </p>
      )}
    </div>
  );
}
