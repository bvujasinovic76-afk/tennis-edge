"use client";

import { useMemo, useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { buildNarrative } from "@/lib/narrative";
import { marketsForMatch } from "@/lib/markets";
import PlayerCombobox from "./PlayerCombobox";

const SURFACE_LABEL: Record<Surface, string> = { Hard: "Tvrda podloga", Clay: "Šljaka", Grass: "Trava" };

export default function MatchAnalysis({
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

  const a = byName.get(nameA);
  const b = byName.get(nameB);
  const oA = parseFloat(oddsA);
  const oB = parseFloat(oddsB);

  const result = useMemo(() => {
    if (!a || !b || a.name === b.name) return null;
    return buildNarrative(a, b, surface, oA > 1 ? oA : undefined, oB > 1 ? oB : undefined);
  }, [a, b, surface, oA, oB]);

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
            {(Object.keys(SURFACE_LABEL) as Surface[]).map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]}
              </option>
            ))}
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

      {result && a && b && (
        <div className="mt-6 border-t border-line pt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* narativ */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-3">Analiza — ljudskim jezikom</p>
            <div className="space-y-3">
              {result.paragraphs.map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-ink-soft">
                  {p}
                </p>
              ))}
            </div>
            <div className="mt-4 rounded-r-lg border-l-[3px] border-accent bg-paper px-4 py-3">
              <p className="text-[15px] text-ink font-medium">{result.verdict}</p>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Analiza je generisana iz istorijskih podataka (Elo, forma, podloga, rang) — model nema dokazan edge protiv tržišta;
              za povrede i najnovije vesti pokreni Istraživanje ispod.
            </p>
          </div>

          {/* uporedna tabela */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-3">Jedan pored drugog</p>
            <div className="rounded-lg border border-line overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-2.5 py-2 text-left font-medium"></th>
                    <th className={`px-2.5 py-2 text-right font-semibold ${result.favSide === "A" ? "text-accent" : "text-ink-soft"}`}>{a.name}</th>
                    <th className={`px-2.5 py-2 text-right font-semibold ${result.favSide === "B" ? "text-accent" : "text-ink-soft"}`}>{b.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.label} className="border-t border-line bg-surface">
                      <td className="px-2.5 py-1.5 text-muted text-[12px]">{r.label}</td>
                      <td className={`px-2.5 py-1.5 text-right tabular ${r.better === "A" ? "font-bold text-good" : "text-ink-soft"}`}>{r.a}</td>
                      <td className={`px-2.5 py-1.5 text-right tabular ${r.better === "B" ? "font-bold text-good" : "text-ink-soft"}`}>{r.b}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line bg-surface-alt/60">
                    <td className="px-2.5 py-2 text-muted text-[12px]">Model — šansa za pobedu</td>
                    <td className={`px-2.5 py-2 text-right tabular font-bold ${result.favSide === "A" ? "text-accent" : "text-ink"}`}>
                      {result.favSide === "A" ? Math.round(result.pFav * 100) : Math.round((1 - result.pFav) * 100)}%
                    </td>
                    <td className={`px-2.5 py-2 text-right tabular font-bold ${result.favSide === "B" ? "text-accent" : "text-ink"}`}>
                      {result.favSide === "B" ? Math.round(result.pFav * 100) : Math.round((1 - result.pFav) * 100)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">Zeleno = bolji u toj kategoriji. Zlatno = favorit po modelu.</p>

            {/* Tipovi sa STVARNOM istorijskom prolaznošću za ovako jak/tesан meč */}
            <p className="text-xs uppercase tracking-wide text-muted mt-5 mb-2">Tipovi — istorijska prolaznost</p>
            <div className="rounded-lg border border-line overflow-hidden">
              <table className="w-full text-[12px] border-collapse">
                <tbody>
                  {marketsForMatch(
                    result.pFav,
                    result.favSide === "A" ? a.name : b.name,
                    result.favSide === "A" ? b.name : a.name
                  ).map((m) => (
                    <tr key={m.id} className="border-t border-line/60 first:border-t-0 bg-surface">
                      <td className="px-2.5 py-1.5 text-ink-soft">
                        {m.safest && <span className="text-accent font-bold mr-1">★</span>}
                        {m.label}
                      </td>
                      <td className={`px-2.5 py-1.5 text-right tabular font-semibold ${m.passPct >= 80 ? "text-good" : m.passPct < 50 ? "text-risk" : "text-ink"}`}>
                        {m.passPct}%
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular text-muted">~{m.estOdds.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              Prolaznost = koliko je taj tip stvarno prolazio u sličnim mečevima (uzorak ~
              {marketsForMatch(result.pFav, "x", "y")[0].sample.toLocaleString("sr-RS")}). ★ = najsigurniji.
            </p>
          </div>
        </div>
      )}

      {a && b && a.name === b.name && <p className="mt-4 text-sm text-risk">Izaberi dva različita igrača.</p>}
    </div>
  );
}
