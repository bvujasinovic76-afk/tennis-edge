"use client";

import { useEffect, useState } from "react";
import type { Surface } from "@/lib/elo";

type MarketAgg = { id: string; label: string; hits: number; total: number; pct: number; histPct: number };
type ComboRetro = { title: string; legs: { text: string; hit: boolean }[]; passed: boolean; estOdds: number };
type PlayerFit = { name: string; pct: number };
type Weather = { city: string; country: string | null; elevation: number | null; tMax: number | null; windMax: number | null; rainProb: number | null; rainSum: number | null };
type TournamentReview = {
  tournament: string;
  tier: string;
  surface: Surface;
  winHits: number;
  winTotal: number;
  safeHits: number;
  safeTotal: number;
  upcomingKnown: number;
  expectedSafePct: number | null;
  weather: Weather | null;
  notes: string[];
  suits: PlayerFit[];
  suitsNot: PlayerFit[];
};
type Resp = { date: string; evaluatedCount: number; markets: MarketAgg[]; combos: ComboRetro[]; tournaments: TournamentReview[]; error?: string; hint?: string };

const SURFACE_SR: Record<Surface, string> = { Hard: "tvrda", Clay: "šljaka", Grass: "trava" };

/**
 * 🧠 Dnevna analiza: koja igra je taj dan stvarno najviše prolazila (na osnovu
 * rezultata po setovima), koje kombinacije bi prošle, i koji turniri su najpogodniji
 * za igranje — sa klimatskim uslovima i igračima kojima podloga prija.
 */
export default function DailyReview({ dateStr }: { dateStr: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/daily-review?date=${dateStr}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ date: dateStr, evaluatedCount: 0, markets: [], combos: [], tournaments: [], error: "Greška pri učitavanju." }))
      .finally(() => setLoading(false));
  }, [dateStr]);

  const hasRetro = (data?.markets.length ?? 0) > 0;

  return (
    <div className="mb-4 rounded-lg border border-line bg-paper">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <span className="text-[11px] uppercase tracking-wide text-muted">🧠 Dnevna analiza — šta prolazi, gde igrati, uslovi</span>
        {data && hasRetro && (
          <span className="text-[11px] text-ink-soft tabular ml-auto shrink-0">
            najprolaznije: <strong className="text-good">{data.markets[0].label} {data.markets[0].pct}%</strong>
          </span>
        )}
        <span className={`text-muted text-xs shrink-0 ${data && hasRetro ? "" : "ml-auto"}`}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3 space-y-4">
          {loading && <p className="text-sm text-muted">Analiziram sve mečeve dana…</p>}
          {data?.error && <p className="text-sm text-risk">{data.error}</p>}

          {/* 1) Koja igra je najviše prolazila */}
          {data && hasRetro && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted mb-2">
                Prolaznost po tipu igre — {data.evaluatedCount} završenih mečeva iz naše baze
              </p>
              <div className="space-y-1.5">
                {data.markets.map((mk) => (
                  <div key={mk.id} className="flex items-center gap-2.5 text-[12px]">
                    <span className="w-44 sm:w-52 shrink-0 text-ink-soft truncate">{mk.label}</span>
                    <div className="flex-1 h-3.5 rounded-sm overflow-hidden flex" style={{ background: "var(--risk)", opacity: 0.95 }}>
                      <div style={{ width: `${mk.pct}%`, background: "var(--good)" }} />
                    </div>
                    <span className={`w-20 shrink-0 text-right tabular font-semibold ${mk.pct >= 70 ? "text-good" : mk.pct < 45 ? "text-risk" : "text-ink"}`}>
                      {mk.hits}/{mk.total} · {mk.pct}%
                    </span>
                    <span className="w-24 shrink-0 text-right tabular text-muted hidden sm:inline" title="Prosečna istorijska prolaznost za iste mečeve">
                      ist. {mk.histPct}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Čita se stvarni rezultat po setovima (predaje se ne broje). „Ist." = koliko taj tip istorijski prolazi u ovako
                jakim mečevima — kad je dan ispod toga, model je grešio više nego obično.
              </p>
            </div>
          )}

          {/* 2) Da si igrao kombinacije */}
          {data && data.combos.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Iste parove kroz različite igre — šta bi prošlo</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {data.combos.map((c) => (
                  <div key={c.title} className={`rounded-md border px-3 py-2.5 ${c.passed ? "border-good bg-good-bg/20" : "border-risk-line bg-risk-bg/20"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-[12px] font-semibold text-ink">{c.title}</p>
                      <span className={`text-[11px] font-bold shrink-0 ${c.passed ? "text-good" : "text-risk"}`}>
                        {c.passed ? `PROŠLA · ~${c.estOdds.toFixed(2)}` : "PALA"}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed break-words">
                      {c.legs.map((l, i) => (
                        <span key={i} className="inline-block mr-2">
                          <span className={l.hit ? "text-good" : "text-risk"}>{l.hit ? "✓" : "✗"}</span>{" "}
                          <span className="text-ink-soft">{l.text}</span>
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">Kvote su procena iz istorijske prolaznosti (fer minus marža) — orijentir, ne ponuda kladionice.</p>
            </div>
          )}

          {/* 3) Turniri — gde igrati + uslovi */}
          {data && data.tournaments.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Turniri — pogodnost za igranje i uslovi</p>
              <div className="space-y-2">
                {data.tournaments.map((t) => {
                  const realPct = t.safeTotal > 0 ? Math.round((t.safeHits / t.safeTotal) * 100) : null;
                  const winPct = t.winTotal > 0 ? Math.round((t.winHits / t.winTotal) * 100) : null;
                  return (
                    <div key={t.tournament} className="rounded-md border border-line/70 bg-surface px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                        <span className="font-semibold text-ink">{t.tournament.replace(", Qualifying", " (kv.)")}</span>
                        <span className="text-muted">{SURFACE_SR[t.surface]}</span>
                        {realPct != null && (
                          <span className={`tabular ${realPct >= 70 ? "text-good" : realPct < 45 ? "text-risk" : "text-ink-soft"}`}>
                            najsigurniji tip {t.safeHits}/{t.safeTotal} ({realPct}%)
                          </span>
                        )}
                        {winPct != null && <span className="tabular text-muted">1/2: {t.winHits}/{t.winTotal}</span>}
                        {t.upcomingKnown > 0 && t.expectedSafePct != null && (
                          <span className="tabular text-ink-soft">sledi {t.upcomingKnown} {t.upcomingKnown === 1 ? "meč" : "meča"} · očekivano ~{t.expectedSafePct}%</span>
                        )}
                        <span className="ml-auto flex flex-wrap gap-1.5 text-[11px] text-muted tabular">
                          {t.weather?.tMax != null && <span>🌡️ {Math.round(t.weather.tMax)}°</span>}
                          {t.weather?.windMax != null && <span>💨 {Math.round(t.weather.windMax)} km/h</span>}
                          {t.weather?.elevation != null && t.weather.elevation >= 300 && <span>⛰️ {Math.round(t.weather.elevation)} m</span>}
                        </span>
                      </div>
                      {t.notes.length > 0 && (
                        <p className="mt-1 text-[11px] text-ink-soft">{t.notes.join(" · ")}</p>
                      )}
                      {(t.suits.length > 0 || t.suitsNot.length > 0) && (
                        <p className="mt-1 text-[11px]">
                          {t.suits.length > 0 && (
                            <span className="text-good">prija: {t.suits.map((p) => `${p.name} (${p.pct}%)`).join(", ")}</span>
                          )}
                          {t.suits.length > 0 && t.suitsNot.length > 0 && <span className="text-muted"> · </span>}
                          {t.suitsNot.length > 0 && (
                            <span className="text-risk">ne prija: {t.suitsNot.map((p) => `${p.name} (${p.pct}%)`).join(", ")}</span>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Rang: prvo stvarni pogoci tog dana, pa očekivana prolaznost za mečeve koji slede. Vreme i visina: Open-Meteo.
                „Prija" = procenat pobeda igrača na toj podlozi (min. 10 mečeva).
              </p>
            </div>
          )}

          {data && !data.error && !hasRetro && data.tournaments.length === 0 && !loading && (
            <p className="text-sm text-muted">Za ovaj dan još nema mečeva iz naše baze za analizu.</p>
          )}
        </div>
      )}
    </div>
  );
}
