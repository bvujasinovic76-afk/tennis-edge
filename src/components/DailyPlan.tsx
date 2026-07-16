"use client";

import { useEffect, useState } from "react";
import type { Surface } from "@/lib/elo";
import { useBankroll, formatMoney } from "./BankrollContext";

type PlanPlay = {
  matchId: number;
  matchLabel: string;
  tournament: string;
  round: string;
  startTime: string;
  surface: Surface;
  pick: string;
  opponent: string;
  modelProb: number;
  marketProb: number;
  odds: number;
  edgePct: number;
  recommendedStake: number;
  kellyPct: number;
};

type PlanResponse = {
  asOf: string;
  currency: string;
  currentBankroll: number;
  kellyMultiplier: number;
  totalMatchesScanned: number;
  matchedWithModel: number;
  oddsSource?: "sofascore" | "none";
  plays: PlanPlay[];
};

type LoadState = "idle" | "loading" | "done" | "error";

export default function DailyPlan({ onAnalyze }: { onAnalyze: (a: string, b: string, s: Surface) => void }) {
  const { placeBet, refresh } = useBankroll();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<Record<number, boolean>>({});

  async function load() {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/plan");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška.");
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onPlace(play: PlanPlay) {
    await placeBet({
      matchLabel: play.matchLabel,
      pick: play.pick,
      odds: play.odds,
      stake: play.recommendedStake,
      modelProb: play.modelProb,
    });
    setPlaced((p) => ({ ...p, [play.matchId]: true }));
    await refresh();
  }

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">
          {data
            ? `Skenirano ${data.totalMatchesScanned} mečeva · ${data.matchedWithModel} u bazi · bankroll ${formatMoney(data.currentBankroll, data.currency)} · Kelly ×${data.kellyMultiplier}`
            : "Generisanje plana…"}
        </p>
        <button onClick={load} disabled={state === "loading"} className="text-xs text-accent hover:underline disabled:opacity-50">
          {state === "loading" ? "Računam…" : "Osveži plan"}
        </button>
      </div>

      {state === "error" && <div className="rounded-md border border-risk-line bg-risk-bg px-4 py-3 text-sm text-risk">{error}</div>}
      {state === "loading" && !data && <p className="text-sm text-muted">Tražim mečeve sa edge-om i računam uloge…</p>}

      {data && data.plays.length === 0 && state === "done" && (
        <p className="text-sm text-muted">
          {data.oddsSource === "none"
            ? "Kvote po meču trenutno nisu dostupne sa ovog servera (online izvor daje mečeve, ali ne i kvote) — plan sa edge-om radi u lokalnoj verziji. Mečeve i dalje možeš analizirati ručno ispod."
            : "Nijedan nadolazeći meč trenutno nema edge preko praga po Elo modelu vs tržišne kvote. To je normalno — model nema dokazan edge (vidi track record). Bolje ništa nego loš tiket."}
        </p>
      )}

      {data && data.plays.length > 0 && (
        <div className="space-y-2">
          {data.plays.map((play, i) => (
            <div key={play.matchId} className="rounded-lg bg-surface-alt/60 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted truncate">
                    {play.tournament} · {play.round} · {new Date(play.startTime).toLocaleString("sr-RS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-sm text-ink">
                    <span className="font-mono text-accent mr-1">{i + 1}.</span>
                    <strong>{play.pick}</strong> <span className="text-muted">protiv {play.opponent}</span>
                  </p>
                  <p className="text-[12px] text-muted tabular">
                    Model {(play.modelProb * 100).toFixed(1)}% · tržište {(play.marketProb * 100).toFixed(1)}% · kvota {play.odds.toFixed(2)} ·{" "}
                    <span className="text-good font-medium">edge +{play.edgePct.toFixed(1)}pp</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Preporučen ulog</p>
                  <p className="font-display font-bold text-xl text-ink tabular" style={{ fontStretch: "85%" }}>
                    {formatMoney(play.recommendedStake, data.currency)}
                  </p>
                  <p className="text-[11px] text-muted tabular">{play.kellyPct.toFixed(1)}% bankrolla</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => onPlace(play)}
                  disabled={placed[play.matchId]}
                  className="text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition"
                >
                  {placed[play.matchId] ? "Dodato na tiket ✓" : "Dodaj na tiket"}
                </button>
                <button
                  onClick={() => onAnalyze(play.pick, play.opponent, play.surface)}
                  className="text-xs rounded-md border border-line bg-paper px-3 py-1.5 text-ink-soft hover:border-accent hover:text-accent transition-colors"
                >
                  Analiziraj / istraži
                </button>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted pt-2">
            Ulozi su ¼-Kelly predlog za brojeve modela — <strong>model nema dokazan edge</strong>, tretiraj ovo kao
            simulaciju i uči na malim iznosima. 18+, klađenje je odgovornost korisnika.
          </p>
        </div>
      )}
    </div>
  );
}
