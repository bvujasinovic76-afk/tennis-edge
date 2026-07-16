"use client";

import { useEffect, useState } from "react";
import type { Surface } from "@/lib/elo";

type EnrichedSide = { name: string; ranking: number | null; eloName: string | null; elo: number | null };
type Score = { current?: number; display?: number; period1?: number; period2?: number; period3?: number; point?: string };
type EnrichedMatch = {
  id: number;
  tournament: string;
  round: string;
  status: string;
  statusType: string;
  startTime: string;
  home: EnrichedSide;
  away: EnrichedSide;
  score?: { home: Score; away: Score };
  model: { homeWinPct: number; awayWinPct: number; surfaceUsed: Surface } | null;
};

type FixturesResponse = { asOf: string; live: EnrichedMatch[]; upcoming: EnrichedMatch[] };
type LoadState = "loading" | "done" | "error";

export default function Fixtures({ onPick }: { onPick: (nameA: string, nameB: string, surface: Surface) => void }) {
  const [data, setData] = useState<FixturesResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  async function load() {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/fixtures");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepoznata greška.");
      setState("error");
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted">
          {data ? `Ažurirano ${new Date(data.asOf).toLocaleTimeString("sr-RS")}` : "Učitavanje…"} · izvor: Sofascore (javni feed)
        </p>
        <button onClick={load} className="text-xs text-accent hover:underline" disabled={state === "loading"}>
          Osveži
        </button>
      </div>

      {state === "error" && <div className="rounded-md border border-risk-line bg-risk-bg px-4 py-3 text-sm text-risk">{error}</div>}
      {state === "loading" && !data && <p className="text-sm text-muted">Tražim ATP mečeve uživo…</p>}

      {data && (
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-3">
              Uživo sada <span className="tabular">({data.live.length})</span>
            </p>
            {data.live.length === 0 ? (
              <p className="text-sm text-muted">Trenutno nema ATP pojedinačnih mečeva uživo.</p>
            ) : (
              <div className="space-y-2">
                {data.live.map((m) => (
                  <MatchRow key={m.id} m={m} live onPick={onPick} />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-3">
              Sledeći mečevi <span className="tabular">({data.upcoming.length})</span>
            </p>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nema zakazanih mečeva u aktivnim turnirima trenutno.</p>
            ) : (
              <div className="space-y-2">
                {data.upcoming.map((m) => (
                  <MatchRow key={m.id} m={m} onPick={onPick} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ m, live, onPick }: { m: EnrichedMatch; live?: boolean; onPick: (a: string, b: string, s: Surface) => void }) {
  const canAnalyze = !!(m.home.eloName && m.away.eloName);
  return (
    <div className="rounded-lg bg-surface-alt/60 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted truncate">
          {m.tournament} · {m.round}
          {!live && ` · ${new Date(m.startTime).toLocaleString("sr-RS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
        </p>
        <p className="text-sm text-ink">
          <PlayerName side={m.home} /> <span className="text-muted">vs</span> <PlayerName side={m.away} />
        </p>
        {m.model && (
          <p className="text-[11px] text-muted tabular">
            Elo model: {m.model.homeWinPct}% – {m.model.awayWinPct}% ({m.model.surfaceUsed})
          </p>
        )}
      </div>
      {live && m.score && (
        <div className="text-xs tabular text-ink-soft whitespace-nowrap">
          {m.status} · {[m.score.home.period1, m.score.home.period2, m.score.home.period3].filter((x) => x != null).join("-")} vs{" "}
          {[m.score.away.period1, m.score.away.period2, m.score.away.period3].filter((x) => x != null).join("-")}
        </div>
      )}
      <button
        onClick={() => canAnalyze && onPick(m.home.eloName!, m.away.eloName!, m.model?.surfaceUsed ?? "Hard")}
        disabled={!canAnalyze}
        className="shrink-0 text-xs rounded-md border border-line bg-paper px-3 py-1.5 text-ink-soft hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
        title={canAnalyze ? "Pošalji u kalkulator i AI konzilijum" : "Nema Elo podataka za jednog od igrača"}
      >
        Analiziraj
      </button>
    </div>
  );
}

function PlayerName({ side }: { side: EnrichedSide }) {
  return (
    <span className="font-medium">
      {side.name}
      {side.ranking != null && <span className="text-muted font-normal tabular"> (#{side.ranking})</span>}
    </span>
  );
}
