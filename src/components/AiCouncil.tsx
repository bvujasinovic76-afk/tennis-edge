"use client";

import { useMemo, useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { kellyFraction } from "@/lib/elo";
import type { PredictResponse, Stake } from "@/lib/predictTypes";
import PlayerCombobox from "./PlayerCombobox";

const SURFACES: Surface[] = ["Hard", "Clay", "Grass"];
const SURFACE_LABEL: Record<Surface, string> = { Hard: "Tvrda podloga", Clay: "Šljaka", Grass: "Trava" };
const STAKE_LABEL: Record<Stake, string> = { none: "bez uloga", low: "nizak ulog", medium: "srednji ulog", high: "visok ulog" };

type Status = "idle" | "loading" | "done" | "error";

export default function AiCouncil({
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
  const [nameA, setNameA] = useState(initialA ?? players[0]?.name ?? "");
  const [nameB, setNameB] = useState(initialB ?? players[1]?.name ?? "");
  const [surface, setSurface] = useState<Surface>(initialSurface ?? "Hard");
  const [oddsA, setOddsA] = useState("");
  const [oddsB, setOddsB] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string>("");

  const playerA = byName.get(nameA);
  const playerB = byName.get(nameB);

  async function runCouncil() {
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerAName: nameA,
          playerBName: nameB,
          surface,
          oddsA: oddsA ? parseFloat(oddsA) : undefined,
          oddsB: oddsB ? parseFloat(oddsB) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as PredictResponse);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepoznata greška.");
      setStatus("error");
    }
  }

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

        <OddsInput label={`Kvota — ${playerA?.name ?? "Igrač A"} (opciono)`} value={oddsA} onChange={setOddsA} />
        <OddsInput label={`Kvota — ${playerB?.name ?? "Igrač B"} (opciono)`} value={oddsB} onChange={setOddsB} />
      </div>

      <button
        onClick={runCouncil}
        disabled={status === "loading" || !playerA || !playerB}
        className="mt-5 w-full sm:w-auto rounded-md bg-accent text-accent-contrast font-semibold text-sm px-5 py-2.5 disabled:opacity-50 hover:brightness-95 transition"
      >
        {status === "loading" ? "Konzilijum radi… (5 analitičara + sudija + finale)" : "Generiši AI konzilijum"}
      </button>

      {status === "error" && (
        <div className="mt-4 rounded-md border border-risk-line bg-risk-bg px-4 py-3 text-sm text-risk">{error}</div>
      )}

      {result && (
        <div className="mt-6 border-t border-line pt-5 space-y-6">
          {result.cached && (
            <p className="text-xs rounded-md bg-good-bg text-good px-3 py-2 inline-block">
              📁 Iz arhive ({result.cachedAt ? new Date(result.cachedAt).toLocaleString("sr-RS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ranije"}) — nije potrošen nijedan kredit.
            </p>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-3">Pet analitičara</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.personas.map((p) => (
                <div key={p.id} className="rounded-lg bg-surface-alt/60 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-ink">{p.name}</p>
                    <span className="text-[10px] font-mono text-muted">{p.model.split("/")[1]}</span>
                  </div>
                  {p.error ? (
                    <p className="text-xs text-risk">{p.error}</p>
                  ) : (
                    <>
                      <p className="text-sm text-ink-soft mb-2">
                        Pick: <strong className="text-ink">{p.pick === "A" ? result.playerA : result.playerB}</strong>{" "}
                        <span className="tabular text-muted">({p.confidence}%)</span> · {STAKE_LABEL[p.stake]}
                      </p>
                      <p className="text-xs text-muted leading-relaxed">{p.reasoning}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-3">Sudija — ocene rezonovanja</p>
            {result.judge.error ? (
              <p className="text-xs text-risk">{result.judge.error}</p>
            ) : (
              <div className="space-y-1.5">
                {result.judge.scores.map((s) => (
                  <div key={s.persona} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-ink-soft">
                      {s.persona} <span className="text-muted">— {s.comment}</span>
                    </span>
                    <span className="tabular font-semibold text-ink whitespace-nowrap">{s.score}/10</span>
                  </div>
                ))}
                {result.judge.contradictions.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-xs text-risk">
                    {result.judge.contradictions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="rounded-r-lg border-l-[3px] border-accent bg-paper px-5 py-4">
            <span className="inline-block text-[11px] uppercase tracking-wide font-bold rounded px-2 py-0.5 mb-2 bg-accent text-accent-contrast">
              Finalni plan igre
            </span>
            {result.final.error ? (
              <p className="text-sm text-risk">{result.final.error}</p>
            ) : (
              <>
                <p className="text-ink font-semibold mb-1">
                  {result.final.finalPick === "A" ? result.playerA : result.playerB}{" "}
                  <span className="tabular font-normal text-muted">
                    ({result.final.confidence}% · {STAKE_LABEL[result.final.staking]})
                  </span>
                </p>
                {(() => {
                  const pickedOdds = parseFloat(result.final.finalPick === "A" ? oddsA : oddsB);
                  if (!(pickedOdds > 1)) return null;
                  const pct = kellyFraction(result.final.confidence / 100, pickedOdds) * 100;
                  return (
                    <p className="text-xs text-ink-soft mb-2 tabular">
                      Kelly ulog na uneto kvotu ({pickedOdds}): <strong className="text-ink">{pct > 0 ? `${pct.toFixed(1)}% bankrolla` : "0% — nema edge na ovoj kvoti"}</strong>{" "}
                      <span className="text-muted">(pun Kelly; realno 1/4–1/2 od ovoga)</span>
                    </p>
                  );
                })()}
                <p className="text-sm text-ink-soft mb-3">{result.final.narrative}</p>
                {result.final.keyFactors.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-muted space-y-0.5">
                    {result.final.keyFactors.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
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
        placeholder="npr. 1.80"
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}
