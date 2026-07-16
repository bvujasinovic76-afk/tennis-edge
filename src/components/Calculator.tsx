"use client";

import { useMemo, useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { blendedRating, devig, expectedProb, kellyFraction, EDGE_THRESHOLD_PCT } from "@/lib/elo";
import { suggestStake } from "@/lib/bankroll";
import PlayerCombobox from "./PlayerCombobox";
import { useBankroll, formatMoney } from "./BankrollContext";

const SURFACES: Surface[] = ["Hard", "Clay", "Grass"];
const SURFACE_LABEL: Record<Surface, string> = { Hard: "Tvrda podloga", Clay: "Šljaka", Grass: "Trava" };

export default function Calculator({
  players,
  initialA,
  initialB,
  initialSurface,
}: {
  players: Player[];
  initialA?: string;
  initialB?: string;
  initialSurface?: Surface;
}) {
  const byName = useMemo(() => new Map(players.map((p) => [p.name, p])), [players]);
  const { state: bankrollState, stats: bankrollStats, placeBet, refresh } = useBankroll();

  const [nameA, setNameA] = useState(initialA ?? players[0]?.name ?? "");
  const [nameB, setNameB] = useState(initialB ?? players[1]?.name ?? "");
  const [surface, setSurface] = useState<Surface>(initialSurface ?? "Hard");
  const [oddsA, setOddsA] = useState("1.80");
  const [oddsB, setOddsB] = useState("2.05");
  const [placedMsg, setPlacedMsg] = useState("");

  const playerA = byName.get(nameA);
  const playerB = byName.get(nameB);
  const oA = parseFloat(oddsA);
  const oB = parseFloat(oddsB);

  const result = useMemo(() => {
    if (!playerA || !playerB || !(oA > 1) || !(oB > 1)) return null;
    const ra = blendedRating(playerA, surface);
    const rb = blendedRating(playerB, surface);
    const modelPA = expectedProb(ra, rb);
    const modelPB = 1 - modelPA;
    const { pA: marketPA, pB: marketPB, overroundPct } = devig(oA, oB);
    const edgeA = (modelPA - marketPA) * 100;
    const edgeB = (modelPB - marketPB) * 100;
    const kellyA = kellyFraction(modelPA, oA) * 100;
    const kellyB = kellyFraction(modelPB, oB) * 100;

    let verdict: { side: "A" | "B" | "none"; label: string; kellyPct: number } = {
      side: "none",
      label: "Nema edge — u granicama greške modela",
      kellyPct: 0,
    };
    if (edgeA > EDGE_THRESHOLD_PCT && kellyA > 0) verdict = { side: "A", label: `Value bet: ${playerA.name}`, kellyPct: kellyA };
    else if (edgeB > EDGE_THRESHOLD_PCT && kellyB > 0) verdict = { side: "B", label: `Value bet: ${playerB.name}`, kellyPct: kellyB };

    return { modelPA, modelPB, marketPA, marketPB, edgeA, edgeB, kellyA, kellyB, overroundPct, verdict };
  }, [playerA, playerB, oA, oB, surface]);

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <PlayerCombobox label="Igrač A" value={nameA} onChange={setNameA} players={players} />
        <PlayerCombobox label="Igrač B" value={nameB} onChange={setNameB} players={players} />

        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Podloga</label>
          <select
            value={surface}
            onChange={(e) => setSurface(e.target.value as Surface)}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div />

        <OddsInput label={`Kvota — ${playerA?.name ?? "Igrač A"}`} value={oddsA} onChange={setOddsA} />
        <OddsInput label={`Kvota — ${playerB?.name ?? "Igrač B"}`} value={oddsB} onChange={setOddsB} />
      </div>

      {result ? (
        <div className="mt-6 border-t border-line pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <ProbRow label={playerA!.name} model={result.modelPA} market={result.marketPA} edge={result.edgeA} kellyPct={result.kellyA} />
            <ProbRow label={playerB!.name} model={result.modelPB} market={result.marketPB} edge={result.edgeB} kellyPct={result.kellyB} />
          </div>
          <p className="mt-4 text-xs text-muted">
            Marža kladionice (overround) u unetim kvotama: <span className="tabular font-medium text-ink-soft">{result.overroundPct.toFixed(2)}%</span>
          </p>
          <div
            className={`mt-4 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
              result.verdict.side === "none" ? "bg-surface-alt text-ink-soft" : "bg-good-bg text-good"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${result.verdict.side === "none" ? "bg-muted" : "bg-good"}`} />
            {result.verdict.label}
            {result.verdict.side !== "none" && (
              <span className="tabular font-normal">
                — Kelly ulog: {result.verdict.kellyPct.toFixed(1)}% bankrolla (pun Kelly; realno igraj 1/4–1/2 od ovoga)
              </span>
            )}
          </div>

          {result.verdict.side !== "none" && bankrollState && bankrollStats && (() => {
            const pickName = result.verdict.side === "A" ? playerA!.name : playerB!.name;
            const pickOdds = result.verdict.side === "A" ? oA : oB;
            const pickProb = result.verdict.side === "A" ? result.modelPA : result.modelPB;
            const sug = suggestStake(pickProb, pickOdds, bankrollStats.currentBankroll, bankrollState.kellyMultiplier);
            return (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-ink-soft tabular">
                  Predlog uloga: <strong className="text-ink">{formatMoney(sug.stakeAmount, bankrollState.currency)}</strong>{" "}
                  <span className="text-muted">(¼-Kelly od {formatMoney(bankrollStats.currentBankroll, bankrollState.currency)})</span>
                </span>
                <button
                  onClick={async () => {
                    await placeBet({
                      matchLabel: `${playerA!.name} vs ${playerB!.name} (${surface})`,
                      pick: pickName,
                      odds: pickOdds,
                      stake: sug.stakeAmount,
                      modelProb: pickProb,
                    });
                    setPlacedMsg(`Dodato: ${pickName} @ ${pickOdds.toFixed(2)} · ${formatMoney(sug.stakeAmount, bankrollState.currency)}`);
                    await refresh();
                  }}
                  disabled={sug.stakeAmount <= 0}
                  className="text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition"
                >
                  Dodaj na tiket
                </button>
                {placedMsg && <span className="text-xs text-good">{placedMsg}</span>}
              </div>
            );
          })()}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Unesi validne kvote (&gt; 1.00) za oba igrača.</p>
      )}
    </div>
  );
}

function OddsInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</label>
      <input
        type="number"
        step="0.01"
        min="1.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}

function ProbRow({ label, model, market, edge, kellyPct }: { label: string; model: number; market: number; edge: number; kellyPct: number }) {
  const positive = edge > 0;
  return (
    <div className="rounded-lg bg-surface-alt/60 p-3">
      <p className="text-sm font-medium text-ink mb-2">{label}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Model</span>
        <span className="tabular font-semibold text-ink">{(model * 100).toFixed(1)}%</span>
      </div>
      <div className="flex items-center justify-between text-sm mt-1">
        <span className="text-muted">Tržište (de-vig)</span>
        <span className="tabular font-semibold text-ink">{(market * 100).toFixed(1)}%</span>
      </div>
      <div className="flex items-center justify-between text-sm mt-1">
        <span className="text-muted">Edge</span>
        <span className={`tabular font-semibold ${positive ? "text-good" : "text-risk"}`}>
          {positive ? "+" : ""}
          {edge.toFixed(1)}pp
        </span>
      </div>
      <div className="flex items-center justify-between text-sm mt-1">
        <span className="text-muted">Kelly ulog</span>
        <span className="tabular font-semibold text-ink">{kellyPct > 0 ? `${kellyPct.toFixed(1)}%` : "—"}</span>
      </div>
    </div>
  );
}
