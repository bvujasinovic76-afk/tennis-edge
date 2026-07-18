"use client";

import { useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import PlayerCombobox from "./PlayerCombobox";

type Citation = { url: string; title: string };
type AgentResult = { id: string; name: string; model: string; content: string; citations: Citation[]; error?: string };
type Synth = { headline: string; signals: string[]; risk: "low" | "medium" | "high"; recommendation: string; error?: string };
type ResearchResponse = { playerA: string; playerB: string; agents: AgentResult[]; synth: Synth; cached?: boolean; cachedAt?: string };

const AGENT_OPTIONS: { id: string; name: string }[] = [
  { id: "povrede", name: "Povrede i vesti" },
  { id: "kvote", name: "Srpske kvote" },
  { id: "forumi", name: "Forumi i sentiment" },
];

const RISK_LABEL: Record<Synth["risk"], string> = { low: "nizak rizik", medium: "srednji rizik", high: "visok rizik" };
const RISK_TONE: Record<Synth["risk"], string> = { low: "bg-good-bg text-good", medium: "bg-surface-alt text-ink-soft", high: "bg-risk-bg text-risk" };

export default function Research({
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
  const [nameA, setNameA] = useState(initialA ?? players[0]?.name ?? "");
  const [nameB, setNameB] = useState(initialB ?? players[1]?.name ?? "");
  const [surface, setSurface] = useState<Surface>(initialSurface ?? "Hard");
  const [tournament, setTournament] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(AGENT_OPTIONS.map((a) => a.id)));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    if (selected.size === 0) {
      setError("Izaberi bar jednog agenta.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerA: nameA,
          playerB: nameB,
          surface,
          tournament,
          agents: selected.size < AGENT_OPTIONS.length ? [...selected] : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška.");
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
            <option value="Hard">Tvrda podloga</option>
            <option value="Clay">Šljaka</option>
            <option value="Grass">Trava</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Turnir (opciono)</label>
          <input
            value={tournament}
            onChange={(e) => setTournament(e.target.value)}
            placeholder="npr. Gstaad"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Izbor agenata — možeš pozvati samo onog koji ti treba (svaka pretraga košta) */}
      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-muted mb-2">Ko istražuje ({selected.size}/3)</p>
        <div className="flex flex-wrap gap-1.5">
          {AGENT_OPTIONS.map((a) => {
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                  on ? "bg-accent text-accent-contrast border-accent" : "bg-paper text-muted border-line hover:border-accent"
                }`}
              >
                {on ? "✓ " : ""}{a.name}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={run}
        disabled={status === "loading" || !nameA || !nameB}
        className="mt-4 w-full sm:w-auto rounded-md bg-accent text-accent-contrast font-semibold text-sm px-5 py-2.5 disabled:opacity-50 hover:brightness-95 transition"
      >
        {status === "loading"
          ? "Agenti pretražuju internet… (~30-60s)"
          : `Pokreni istraživanje (${selected.size} ${selected.size === 1 ? "agent" : "agenta"})`}
      </button>

      {status === "error" && <div className="mt-4 rounded-md border border-risk-line bg-risk-bg px-4 py-3 text-sm text-risk">{error}</div>}

      {result && (
        <div className="mt-6 border-t border-line pt-5 space-y-5">
          {result.cached && (
            <p className="text-xs rounded-md bg-good-bg text-good px-3 py-2 inline-block">
              📁 Iz arhive ({result.cachedAt ? new Date(result.cachedAt).toLocaleString("sr-RS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ranije"}) — bez novih web pretraga i kredita.
            </p>
          )}
          {!result.synth.error && (
            <div className="rounded-r-lg border-l-[3px] border-accent bg-paper px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] uppercase tracking-wide font-bold rounded px-2 py-0.5 bg-accent text-accent-contrast">Brifing istraživanja</span>
                <span className={`text-[11px] rounded px-2 py-0.5 font-medium ${RISK_TONE[result.synth.risk]}`}>{RISK_LABEL[result.synth.risk]}</span>
              </div>
              <p className="text-ink font-semibold mb-2">{result.synth.headline}</p>
              {result.synth.signals.length > 0 && (
                <ul className="list-disc list-inside text-sm text-ink-soft space-y-0.5 mb-2">
                  {result.synth.signals.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-ink-soft">{result.synth.recommendation}</p>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-3">
            {result.agents.map((a) => (
              <div key={a.id} className="rounded-lg bg-surface-alt/60 p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-ink">{a.name}</p>
                  <span className="text-[10px] font-mono text-muted">{a.model.split("/")[1]}</span>
                </div>
                {a.error ? (
                  <p className="text-xs text-risk">{a.error}</p>
                ) : (
                  <>
                    <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-wrap">{a.content}</p>
                    {a.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-line/60">
                        <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Izvori</p>
                        <ul className="space-y-0.5">
                          {a.citations.slice(0, 4).map((c, i) => (
                            <li key={i} className="truncate">
                              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:underline">
                                {c.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            Agenti čitaju internet uživo (OpenRouter web search) — informacije mogu biti nepotpune ili zastarele;
            uvek proveri izvore pre klađenja.
          </p>
        </div>
      )}
    </div>
  );
}
