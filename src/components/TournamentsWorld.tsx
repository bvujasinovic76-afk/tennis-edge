"use client";

import { useEffect, useState } from "react";
import type { Surface } from "@/lib/elo";

type Score = { current?: number; display?: number; period1?: number; period2?: number; period3?: number; point?: string };
type Match = {
  id: number;
  round: string;
  status: string;
  statusType: string;
  startTime: string;
  surface: Surface;
  home: { name: string };
  away: { name: string };
  score?: { home: Score; away: Score };
  winner: "home" | "away" | null;
  homeElo: string | null;
  awayElo: string | null;
  modelHomePct: number | null;
};
type Group = { tournament: string; tier: "Grand Slam" | "Masters" | "ATP" | "Challenger"; category: string; matches: Match[] };
type Resp = { date: string; totalMatches: number; totalTournaments: number; live: number; groups: Group[]; error?: string; hint?: string };

const TIER_STYLE: Record<Group["tier"], string> = {
  "Grand Slam": "bg-accent text-accent-contrast",
  Masters: "bg-accent text-accent-contrast",
  ATP: "bg-good-bg text-good",
  Challenger: "bg-surface-alt text-ink-soft",
};

function belgradeDateStr(offsetDays = 0): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(new Date(Date.now() + offsetDays * 86400000));
}

function setsText(m: Match): string {
  if (!m.score) return "";
  const h = m.score.home, a = m.score.away;
  const parts: string[] = [];
  for (const k of ["period1", "period2", "period3"] as const) {
    if (h[k] != null || a[k] != null) parts.push(`${h[k] ?? 0}:${a[k] ?? 0}`);
  }
  return parts.join(" ");
}

/** Svi muški turniri na svetu (ATP/Masters + Challenger) — grupisano, sa live rezultatima. */
export default function TournamentsWorld({ onAnalyze }: { onAnalyze: (a: string, b: string, s: Surface) => void }) {
  const [dayOff, setDayOff] = useState(0);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [openT, setOpenT] = useState<string | null>(null);

  const dateStr = belgradeDateStr(dayOff);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/tournaments?date=${dateStr}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ date: dateStr, totalMatches: 0, totalTournaments: 0, live: 0, groups: [], error: "Greška pri učitavanju." }))
      .finally(() => setLoading(false));
    // osvežavanje na 60s zbog live rezultata
    const t = setInterval(() => {
      fetch(`/api/tournaments?date=${dateStr}`).then((r) => r.json()).then(setData).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, [dateStr]);

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display font-bold text-lg text-ink" style={{ fontStretch: "85%" }}>
            🌍 Svi turniri — ceo svet
          </h3>
          {data && !data.error && (
            <p className="text-[12px] text-muted tabular">
              {data.totalTournaments} turnira · {data.totalMatches} mečeva{data.live > 0 && <span className="text-risk font-semibold"> · {data.live} UŽIVO</span>}
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          {[{ off: -1, label: "Juče" }, { off: 0, label: "Danas" }, { off: 1, label: "Sutra" }].map((d) => (
            <button
              key={d.off}
              onClick={() => setDayOff(d.off)}
              className={`text-xs rounded-md px-3 py-1.5 border transition-colors ${d.off === dayOff ? "border-accent text-accent bg-surface-alt/60" : "border-line text-muted hover:border-accent"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Učitavam sve turnire…</p>}
      {data?.error && (
        <div className="rounded-md border border-risk-line bg-risk-bg px-4 py-3 text-sm text-risk">
          {data.error}
          {data.hint && <p className="mt-1 text-[12px] text-ink-soft">{data.hint}</p>}
        </div>
      )}

      {data && !data.error && <HitStats groups={data.groups} />}

      {data && !data.error && (
        <div className="space-y-2.5">
          {data.groups.map((g) => {
            const open = openT === g.tournament;
            const liveCnt = g.matches.filter((m) => m.statusType === "inprogress").length;
            return (
              <div key={g.tournament} className="rounded-lg border border-line bg-paper">
                <button onClick={() => setOpenT(open ? null : g.tournament)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left">
                  <span className={`text-[10px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 shrink-0 ${TIER_STYLE[g.tier]}`}>{g.tier}</span>
                  <span className="text-sm font-semibold text-ink truncate">{g.tournament}</span>
                  <span className="text-[11px] text-muted tabular ml-auto shrink-0">
                    {g.matches.length} {g.matches.length === 1 ? "meč" : "mečeva"}
                    {liveCnt > 0 && <span className="text-risk font-semibold"> · {liveCnt} live</span>}
                  </span>
                  <span className="text-muted text-xs shrink-0">{open ? "▲" : "▼"}</span>
                </button>

                {open && (
                  <div className="border-t border-line px-3.5 py-2 space-y-1.5">
                    {g.matches.map((m) => {
                      const live = m.statusType === "inprogress";
                      const done = m.statusType === "finished";
                      const known = m.homeElo && m.awayElo;
                      return (
                        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 border-b border-line/40 last:border-0 text-[13px]">
                          <span className={`w-14 shrink-0 text-[11px] tabular ${live ? "text-risk font-bold" : "text-muted"}`}>
                            {live ? "UŽIVO" : done ? "kraj" : new Date(m.startTime).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="min-w-0">
                            <span className={m.winner === "home" ? "font-bold text-ink" : done && m.winner === "away" ? "text-muted" : "text-ink"}>{m.home.name}</span>
                            <span className="text-muted"> vs </span>
                            <span className={m.winner === "away" ? "font-bold text-ink" : done && m.winner === "home" ? "text-muted" : "text-ink"}>{m.away.name}</span>
                          </span>
                          {(live || done) && <span className="tabular text-[12px] text-ink-soft">{setsText(m)}{live && m.score?.home.point != null ? ` · ${m.score.home.point}:${m.score?.away.point}` : ""}</span>}
                          {m.modelHomePct != null && !done && (
                            <span className="tabular text-[11px] text-muted">model {m.modelHomePct}% / {100 - m.modelHomePct}%</span>
                          )}
                          {m.round && <span className="text-[11px] text-muted hidden sm:inline">{m.round}</span>}
                          {known && !done && (
                            <button onClick={() => onAnalyze(m.homeElo!, m.awayElo!, m.surface)} className="ml-auto text-[11px] text-accent hover:underline shrink-0">
                              analiza
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted">
        Izvor: Sofascore (sve kategorije — ATP, Masters, Challenger). Model % se prikazuje samo za igrače koje imamo u
        Elo bazi (uglavnom ATP nivo); za većinu challenger igrača nemamo istoriju pa procenat izostaje. Osvežava se na 60s.
      </p>
    </div>
  );
}

/**
 * 🎯 Pogoci modela — za svaki turnir posebno: koliko je završenih mečeva model pogodio
 * (favorit po modelu je stvarno pobedio). Zeleno = pogođeno, crveno = promašeno.
 * Računa se samo na mečevima gde su OBA igrača u našoj bazi (inače model nije ni birao).
 */
function HitStats({ groups }: { groups: Group[] }) {
  type Row = { tournament: string; tier: Group["tier"]; hits: number; total: number };
  const rows: Row[] = [];
  let allHits = 0;
  let allTotal = 0;

  for (const g of groups) {
    let hits = 0;
    let total = 0;
    for (const m of g.matches) {
      if (m.statusType !== "finished" || m.winner == null || m.modelHomePct == null) continue;
      const modelPickedHome = m.modelHomePct >= 50;
      const hit = (modelPickedHome && m.winner === "home") || (!modelPickedHome && m.winner === "away");
      total += 1;
      if (hit) hits += 1;
    }
    if (total > 0) {
      rows.push({ tournament: g.tournament, tier: g.tier, hits, total });
      allHits += hits;
      allTotal += total;
    }
  }

  if (allTotal === 0) return null;
  rows.sort((a, b) => b.total - a.total);

  return (
    <div className="mb-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-[11px] uppercase tracking-wide text-muted">🎯 Pogoci modela — po turniru (završeni mečevi)</p>
        <div className="flex items-center gap-3 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--good)" }} /> pogođeno</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--risk)" }} /> promašeno</span>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        {/* ukupno za dan */}
        <div className="flex flex-col items-center">
          <Donut hits={allHits} total={allTotal} size={84} />
          <p className="mt-1 text-[12px] font-semibold text-ink">Ukupno</p>
          <p className="text-[11px] text-muted tabular">{allHits}/{allTotal} · {Math.round((allHits / allTotal) * 100)}%</p>
        </div>
        {/* po turniru */}
        {rows.map((r) => (
          <div key={r.tournament} className="flex flex-col items-center max-w-[110px]">
            <Donut hits={r.hits} total={r.total} size={64} />
            <p className="mt-1 text-[11px] font-medium text-ink text-center leading-tight">{r.tournament.replace(", Qualifying", " (kv.)")}</p>
            <p className="text-[10px] text-muted tabular">{r.hits}/{r.total} · {Math.round((r.hits / r.total) * 100)}%</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        „Pogođeno" = favorit po našem Elo modelu je stvarno pobedio. Broje se samo mečevi gde su oba igrača u našoj bazi.
      </p>
    </div>
  );
}

/** Donut: zeleni luk = pogoci, crveni = promašaji, u sredini odnos. */
function Donut({ hits, total, size }: { hits: number; total: number; size: number }) {
  const stroke = Math.max(7, Math.round(size / 8));
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = total > 0 ? hits / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Pogođeno ${hits} od ${total}`}>
      {/* crvena osnova (promašaji) pa zeleni luk preko (pogoci), počinje od vrha */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--risk)" strokeWidth={stroke} opacity={0.85} />
      {frac > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--good)"
          strokeWidth={stroke}
          strokeDasharray={`${C * frac} ${C * (1 - frac)}`}
          strokeLinecap={frac < 1 ? "butt" : "round"}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size / 4.2} fontWeight="700" fill="var(--ink)" className="tabular">
        {hits}/{total}
      </text>
    </svg>
  );
}
