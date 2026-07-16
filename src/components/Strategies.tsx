"use client";

import { useMemo, useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { scoreStrategies, type StrategyEval, type CriterionStatus } from "@/lib/strategies";
import { suggestStake } from "@/lib/bankroll";
import PlayerCombobox from "./PlayerCombobox";
import { useBankroll, formatMoney } from "./BankrollContext";

const VARIANCE_LABEL = { low: "niska varijansa", medium: "srednja varijansa", high: "visoka varijansa" } as const;
const CRIT_MARK: Record<CriterionStatus, { m: string; c: string }> = {
  pass: { m: "✓", c: "text-good" },
  fail: { m: "✗", c: "text-risk" },
  unknown: { m: "?", c: "text-muted" },
};

export default function Strategies({
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
  const [oddsA, setOddsA] = useState("");
  const [oddsB, setOddsB] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placedMsg, setPlacedMsg] = useState("");

  const a = byName.get(nameA);
  const b = byName.get(nameB);
  const oA = parseFloat(oddsA);
  const oB = parseFloat(oddsB);

  const result = useMemo(() => {
    if (!a || !b) return null;
    return scoreStrategies(a, b, surface, oA > 1 ? oA : undefined, oB > 1 ? oB : undefined);
  }, [a, b, surface, oA, oB]);

  const selected = result?.supported.find((s) => s.id === selectedId) ?? result?.supported[0] ?? null;

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <PlayerCombobox label="Igrač A" value={nameA} onChange={setNameA} players={players} />
        <PlayerCombobox label="Igrač B" value={nameB} onChange={setNameB} players={players} />
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Podloga</label>
          <select value={surface} onChange={(e) => setSurface(e.target.value as Surface)} className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent">
            <option value="Hard">Tvrda podloga</option>
            <option value="Clay">Šljaka</option>
            <option value="Grass">Trava</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">Kvota A (opc.)</span>
            <input type="number" step="0.01" min="1.01" value={oddsA} onChange={(e) => setOddsA(e.target.value)} placeholder="npr. 1.80" className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">Kvota B (opc.)</span>
            <input type="number" step="0.01" min="1.01" value={oddsB} onChange={(e) => setOddsB(e.target.value)} placeholder="npr. 2.05" className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-accent" />
          </label>
        </div>
      </div>

      {result && (
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-xs uppercase tracking-wide text-muted mb-3">
            Koliko meč odgovara svakoj strategiji {result.features.edgeFavPct == null && <span className="text-muted/80">(unesi kvote za value/edge)</span>}
          </p>
          <div className="space-y-2.5">
            {result.supported.map((s) => (
              <StrategyBar
                key={s.id}
                s={s}
                recommended={s.id === result.recommendedId}
                selected={s.id === (selected?.id ?? null)}
                onSelect={() => {
                  setSelectedId(s.id);
                  setPlacedMsg("");
                }}
                nameA={nameA}
                nameB={nameB}
              />
            ))}
          </div>

          {selected && (
            <SelectedDetail
              s={selected}
              nameA={nameA}
              nameB={nameB}
              surface={surface}
              oA={oA}
              oB={oB}
              bankrollAvailable={!!(bankrollState && bankrollStats)}
              onPlace={async () => {
                if (!selected.side || !bankrollState || !bankrollStats) return;
                const odds = selected.side === "A" ? oA : oB;
                if (!(odds > 1)) return;
                const pick = selected.pickName ?? (selected.side === "A" ? nameA : nameB);
                const r = scoreStrategies(a!, b!, surface, oA > 1 ? oA : undefined, oB > 1 ? oB : undefined);
                const prob = selected.side === r.features.favSide ? r.features.pFav : 1 - r.features.pFav;
                const sug = suggestStake(prob, odds, bankrollStats.currentBankroll, bankrollState.kellyMultiplier);
                await placeBet({ matchLabel: `${nameA} vs ${nameB} (${surface}) · ${selected.name}`, pick, odds, stake: sug.stakeAmount, modelProb: prob });
                setPlacedMsg(`Dodato: ${pick} @ ${odds.toFixed(2)} · ${formatMoney(sug.stakeAmount, bankrollState.currency)}`);
                await refresh();
              }}
              placedMsg={placedMsg}
              currency={bankrollState?.currency ?? "RSD"}
              currentBankroll={bankrollStats?.currentBankroll ?? 0}
              kellyMultiplier={bankrollState?.kellyMultiplier ?? 0.25}
              features={result.features}
            />
          )}

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-muted mb-2">Strategije koje traže dodatne podatke (još nisu podržane)</p>
            <div className="space-y-1.5">
              {result.unsupported.map((u) => (
                <div key={u.name} className="rounded-lg border border-dashed border-line px-3 py-2 opacity-80">
                  <p className="text-sm text-ink-soft">{u.name}</p>
                  <p className="text-[11px] text-muted">{u.reason} <span className="text-ink-soft">Treba: {u.needs}.</span></p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyBar({
  s,
  recommended,
  selected,
  onSelect,
  nameA,
  nameB,
}: {
  s: StrategyEval;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
  nameA: string;
  nameB: string;
}) {
  const pick = s.side === "A" ? nameA : s.side === "B" ? nameB : "ne igraj";
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected ? "border-accent bg-surface-alt/60" : "border-line bg-paper hover:border-accent/60"
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-3 w-3 rounded-full border shrink-0 ${selected ? "border-accent bg-accent" : "border-muted"}`} />
          <span className="text-sm font-semibold text-ink truncate">{s.name}</span>
          {recommended && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 bg-accent text-accent-contrast">Preporučeno</span>
          )}
        </div>
        <span className="shrink-0 font-display font-bold text-lg text-ink tabular" style={{ fontStretch: "85%" }}>
          {s.suitability}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-alt overflow-hidden mb-1.5">
        <div className={`h-full rounded-full ${recommended ? "bg-accent" : "bg-muted/60"}`} style={{ width: `${s.suitability}%` }} />
      </div>
      <p className="text-[11px] text-muted">
        {s.market} · {VARIANCE_LABEL[s.variance]} · kvote {s.typicalOdds}
        {s.side && <span className="text-ink-soft"> · igraš: {pick}</span>}
      </p>
    </button>
  );
}

function SelectedDetail({
  s,
  surface,
  oA,
  oB,
  onPlace,
  placedMsg,
  currency,
  currentBankroll,
  kellyMultiplier,
  features,
  bankrollAvailable,
  nameA,
  nameB,
}: {
  s: StrategyEval;
  nameA: string;
  nameB: string;
  surface: Surface;
  oA: number;
  oB: number;
  onPlace: () => void;
  placedMsg: string;
  currency: string;
  currentBankroll: number;
  kellyMultiplier: number;
  features: { favSide: "A" | "B"; pFav: number };
  bankrollAvailable: boolean;
}) {
  const pickOdds = s.side === "A" ? oA : s.side === "B" ? oB : NaN;
  const canStake = s.side != null && pickOdds > 1 && bankrollAvailable;
  let stakeAmount = 0;
  if (canStake) {
    const prob = s.side === features.favSide ? features.pFav : 1 - features.pFav;
    stakeAmount = suggestStake(prob, pickOdds, currentBankroll, kellyMultiplier).stakeAmount;
  }

  return (
    <div className="mt-4 rounded-r-lg border-l-[3px] border-accent bg-paper px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wide font-bold rounded px-2 py-0.5 bg-accent text-accent-contrast">Izabrana strategija</span>
        <span className="text-sm font-semibold text-ink">{s.name}</span>
        <span className="text-xs text-muted">· {s.suitability}% poklapanje</span>
      </div>
      <p className="text-sm text-ink-soft mb-2">{s.rationale}</p>
      <p className="text-sm text-ink mb-3">
        <span className="text-muted">Igra se:</span>{" "}
        <strong>{s.market}</strong>
        {s.side && <span> — na {s.side === "A" ? nameA : nameB}</span>}
      </p>

      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Kriterijumi</p>
        <ul className="space-y-1">
          {s.criteria.map((c, i) => (
            <li key={i} className="text-sm flex items-start gap-2">
              <span className={`font-bold ${CRIT_MARK[c.status].c}`}>{CRIT_MARK[c.status].m}</span>
              <span className="text-ink-soft">
                {c.label} <span className="text-muted">— {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {s.side ? (
        canStake ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-soft tabular">
              Predlog uloga: <strong className="text-ink">{stakeAmount.toLocaleString("sr-RS")} {currency}</strong>{" "}
              <span className="text-muted">(¼-Kelly)</span>
            </span>
            <button onClick={onPlace} disabled={stakeAmount <= 0} className="text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition">
              Dodaj na tiket
            </button>
            {placedMsg && <span className="text-xs text-good">{placedMsg}</span>}
          </div>
        ) : (
          <p className="text-xs text-muted">Unesi kvotu za {s.side === "A" ? nameA : nameB} da bih izračunao tačan ulog i dodao na tiket.</p>
        )
      ) : (
        <p className="text-sm text-ink-soft">Ova strategija preporučuje da se meč <strong>preskoči</strong> — nema tiketa.</p>
      )}
    </div>
  );
}
