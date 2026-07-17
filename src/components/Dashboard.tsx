"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { blendedRating, expectedProb, devig, EDGE_THRESHOLD_PCT } from "@/lib/elo";
import { suggestStake } from "@/lib/bankroll";
import { buildNarrative } from "@/lib/narrative";
import { useBankroll, formatMoney } from "./BankrollContext";

type FixtureRow = {
  id: number;
  tournament: string;
  round: string;
  startTime: string;
  statusType: string;
  home: { name: string; eloName: string | null };
  away: { name: string; eloName: string | null };
  model: { homeWinPct: number; awayWinPct: number; surfaceUsed: Surface } | null;
};

type OddsInput = { a: string; b: string };

/** Glavni pregled kad si prijavljen: koliko imaš, šta se igra danas, i koliko bi bilo ako sve prođe. */
export default function Dashboard({ players, onAnalyze }: { players: Player[]; onAnalyze: (a: string, b: string, s: Surface) => void }) {
  const { state, stats, authed, loading, placeBet, settleBet, refresh } = useBankroll();
  const byName = useMemo(() => new Map(players.map((p) => [p.name, p])), [players]);

  const [rows, setRows] = useState<FixtureRow[] | null>(null);
  const [fxError, setFxError] = useState("");
  const [odds, setOdds] = useState<Record<number, OddsInput>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [placed, setPlaced] = useState<Record<number, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        const all: FixtureRow[] = [...(j.live ?? []), ...(j.upcoming ?? [])];
        setRows(all.filter((m) => m.home.eloName && m.away.eloName && m.model));
      })
      .catch((e) => setFxError(e instanceof Error ? e.message : "Greška"));
  }, []);

  // Za svaki meč: model, kvote koje si uneo, edge, predlog uloga, potencijalni dobitak.
  const computed = useMemo(() => {
    if (!rows || !state || !stats) return [];
    return rows.map((m) => {
      const a = byName.get(m.home.eloName!)!;
      const b = byName.get(m.away.eloName!)!;
      const surface = m.model!.surfaceUsed;
      const pA = expectedProb(blendedRating(a, surface), blendedRating(b, surface));
      const o = odds[m.id];
      const oA = parseFloat(o?.a ?? "");
      const oB = parseFloat(o?.b ?? "");
      const hasOdds = oA > 1 && oB > 1;

      let pick: { name: string; odds: number; prob: number; edgePct: number } | null = null;
      if (hasOdds) {
        const { pA: mA, pB: mB } = devig(oA, oB);
        const edgeA = (pA - mA) * 100;
        const edgeB = (1 - pA - mB) * 100;
        pick = edgeA >= edgeB
          ? { name: a.name, odds: oA, prob: pA, edgePct: edgeA }
          : { name: b.name, odds: oB, prob: 1 - pA, edgePct: edgeB };
      }
      const hasValue = !!pick && pick.edgePct > EDGE_THRESHOLD_PCT;
      const sug = hasValue ? suggestStake(pick!.prob, pick!.odds, stats.currentBankroll, state.kellyMultiplier) : null;
      const stake = sug?.stakeAmount ?? 0;
      const potential = hasValue && stake > 0 ? stake * (pick!.odds - 1) : 0;

      return { m, a, b, surface, pA, pick, hasValue, stake, potential };
    });
  }, [rows, odds, state, stats, byName]);

  const valueRows = computed.filter((c) => c.hasValue && c.stake > 0 && !placed[c.m.id]);
  const planStake = valueRows.reduce((s, c) => s + c.stake, 0);
  const planPotential = valueRows.reduce((s, c) => s + c.potential, 0);

  const pending = state?.bets.filter((x) => x.status === "pending") ?? [];
  const pendingStake = pending.reduce((s, x) => s + x.stake, 0);
  const pendingPotential = pending.reduce((s, x) => s + x.stake * (x.odds - 1), 0);

  async function checkResults() {
    setChecking(true);
    setCheckMsg("");
    try {
      const res = await fetch("/api/autosettle", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setCheckMsg(j.message ?? "Provereno.");
      if (j.settled?.length) await refresh();
    } catch (e) {
      setCheckMsg(e instanceof Error ? e.message : "Greška.");
    } finally {
      setChecking(false);
    }
  }

  if (loading && !state) return <p className="text-sm text-muted">Učitavanje…</p>;

  if (!authed) {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-sm p-8 text-center">
        <p className="font-display font-bold text-2xl text-ink mb-2" style={{ fontStretch: "85%" }}>Prijavi se da vidiš svoj plan</p>
        <p className="text-sm text-muted mb-5 max-w-[46ch] mx-auto">
          Uneseš koliko imaš, a aplikacija ti pokazuje šta se danas igra, koliko da uložiš i koliko bi bilo ako sve prođe.
        </p>
        <a href="/login" className="inline-block rounded-md bg-accent text-accent-contrast font-semibold text-sm px-6 py-3 hover:brightness-95 transition">
          Prijava / Napravi nalog
        </a>
      </div>
    );
  }
  if (!state || !stats) return null;

  const cur = stats.currency;
  const ifAllWin = stats.currentBankroll + pendingPotential;
  const ifAllLose = stats.currentBankroll - pendingStake;

  return (
    <div className="space-y-6">
      {/* ---- HERO: koliko imam, koliko sam stavio, koliko može biti ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroTile label="Moj bankroll" value={formatMoney(stats.currentBankroll, cur)} sub={`start ${formatMoney(stats.startingBankroll, cur)}`} big />
        <HeroTile
          label="Profit / gubitak"
          value={`${stats.realizedPnl >= 0 ? "+" : ""}${formatMoney(stats.realizedPnl, cur)}`}
          sub={`ROI ${stats.roiPct >= 0 ? "+" : ""}${stats.roiPct.toFixed(1)}% · ${stats.wins}-${stats.losses}`}
          tone={stats.realizedPnl > 0 ? "good" : stats.realizedPnl < 0 ? "risk" : undefined}
          big
        />
        <HeroTile label="U igri sada" value={formatMoney(pendingStake, cur)} sub={`${pending.length} ${pending.length === 1 ? "tiket" : "tiketa"} u toku`} big />
        <HeroTile
          label="Ako sve prođe"
          value={formatMoney(ifAllWin, cur)}
          sub={pendingPotential > 0 ? `+${formatMoney(pendingPotential, cur)} dobitka` : "nema aktivnih tiketa"}
          tone={pendingPotential > 0 ? "good" : undefined}
          big
        />
      </div>

      {/* ---- AKTIVNI TIKETI ---- */}
      {pending.length > 0 && (
        <Card title="Aktivni tiketi — šta je u igri" action={
          <button onClick={checkResults} disabled={checking} className="text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition">
            {checking ? "Proveravam…" : "Proveri rezultate"}
          </button>
        }>
          {checkMsg && <p className="text-xs text-ink-soft mb-2">{checkMsg}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">Meč</th>
                  <th className="py-2 px-2 font-medium">Igram</th>
                  <th className="py-2 px-2 font-medium text-right">Kvota</th>
                  <th className="py-2 px-2 font-medium text-right">Ulog</th>
                  <th className="py-2 px-2 font-medium text-right">Ako prođe</th>
                  <th className="py-2 pl-2 font-medium text-right">Ishod</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((bt) => (
                  <tr key={bt.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 text-ink-soft text-[13px]">{bt.matchLabel}</td>
                    <td className="py-2 px-2 font-medium text-ink">{bt.pick}</td>
                    <td className="py-2 px-2 text-right tabular text-ink-soft">{bt.odds.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right tabular text-ink">{formatMoney(bt.stake, cur)}</td>
                    <td className="py-2 px-2 text-right tabular font-semibold text-good">+{formatMoney(bt.stake * (bt.odds - 1), cur)}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button onClick={() => settleBet(bt.id, "won")} className="rounded border border-line px-2 py-0.5 text-good hover:bg-good-bg transition-colors mr-1" title="Dobitak">✓</button>
                      <button onClick={() => settleBet(bt.id, "lost")} className="rounded border border-line px-2 py-0.5 text-risk hover:bg-risk-bg transition-colors" title="Gubitak">✗</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3 pr-3 text-muted text-[12px]" colSpan={3}>Ukupno u igri</td>
                  <td className="pt-3 px-2 text-right tabular text-ink">{formatMoney(pendingStake, cur)}</td>
                  <td className="pt-3 px-2 text-right tabular text-good">+{formatMoney(pendingPotential, cur)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[13px]">
            <p className="rounded-md bg-good-bg text-good px-3 py-2">
              Ako <strong>sve prođe</strong>: bankroll → <strong className="tabular">{formatMoney(ifAllWin, cur)}</strong>
            </p>
            <p className="rounded-md bg-risk-bg text-risk px-3 py-2">
              Ako <strong>sve padne</strong>: bankroll → <strong className="tabular">{formatMoney(ifAllLose, cur)}</strong>
            </p>
          </div>
        </Card>
      )}

      {/* ---- DANAŠNJI PLAN ---- */}
      <Card
        title="Šta se igra danas — unesi kvotu i vidi plan"
        action={<span className="text-[11px] text-muted">{rows ? `${computed.length} mečeva iz naše baze` : "učitavanje…"}</span>}
      >
        {fxError && <p className="text-sm text-risk">{fxError}</p>}
        {!rows && !fxError && <p className="text-sm text-muted">Učitavam mečeve…</p>}
        {rows && computed.length === 0 && <p className="text-sm text-muted">Trenutno nema mečeva koje prepoznajemo u bazi (van sezone ili feed prazan).</p>}

        {computed.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[820px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                    <th className="py-2 pr-2 font-medium">Vreme</th>
                    <th className="py-2 px-2 font-medium">Meč</th>
                    <th className="py-2 px-2 font-medium text-right">Model</th>
                    <th className="py-2 px-2 font-medium text-center">Kvote (1 / 2)</th>
                    <th className="py-2 px-2 font-medium">Preporuka</th>
                    <th className="py-2 px-2 font-medium text-right">Ulog</th>
                    <th className="py-2 px-2 font-medium text-right">Ako prođe</th>
                    <th className="py-2 pl-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map((c) => {
                    const isLive = c.m.statusType === "inprogress";
                    return (
                      <Fragment key={c.m.id}>
                        <tr className="border-b border-line/60 align-middle">
                          <td className="py-2 pr-2 text-[12px] text-muted whitespace-nowrap">
                            {isLive ? <span className="text-risk font-semibold">UŽIVO</span> : new Date(c.m.startTime).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-2 px-2">
                            <p className="text-ink font-medium text-[13px]">{c.a.name} <span className="text-muted font-normal">vs</span> {c.b.name}</p>
                            <p className="text-[11px] text-muted">{c.m.tournament} · {c.surface === "Clay" ? "šljaka" : c.surface === "Grass" ? "trava" : "tvrda"}</p>
                          </td>
                          <td className="py-2 px-2 text-right tabular text-[13px] whitespace-nowrap">
                            <span className={c.pA >= 0.5 ? "font-semibold text-ink" : "text-muted"}>{Math.round(c.pA * 100)}%</span>
                            <span className="text-muted"> / </span>
                            <span className={c.pA < 0.5 ? "font-semibold text-ink" : "text-muted"}>{Math.round((1 - c.pA) * 100)}%</span>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex gap-1 justify-center">
                              <input
                                type="number" step="0.01" min="1.01" placeholder="1.80"
                                value={odds[c.m.id]?.a ?? ""}
                                onChange={(e) => setOdds((o) => ({ ...o, [c.m.id]: { a: e.target.value, b: o[c.m.id]?.b ?? "" } }))}
                                className="w-16 rounded border border-line bg-paper px-1.5 py-1 text-[12px] text-ink tabular text-center focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                              <input
                                type="number" step="0.01" min="1.01" placeholder="2.05"
                                value={odds[c.m.id]?.b ?? ""}
                                onChange={(e) => setOdds((o) => ({ ...o, [c.m.id]: { a: o[c.m.id]?.a ?? "", b: e.target.value } }))}
                                className="w-16 rounded border border-line bg-paper px-1.5 py-1 text-[12px] text-ink tabular text-center focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-[12px]">
                            {!c.pick ? (
                              <span className="text-muted">unesi kvote</span>
                            ) : c.hasValue ? (
                              <span className="text-good font-medium">{c.pick.name} <span className="tabular">+{c.pick.edgePct.toFixed(1)}pp</span></span>
                            ) : (
                              <span className="text-muted">nema value-a</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular text-[13px] font-semibold text-ink">{c.stake > 0 ? formatMoney(c.stake, cur) : "—"}</td>
                          <td className="py-2 px-2 text-right tabular text-[13px] font-semibold text-good">{c.potential > 0 ? `+${formatMoney(c.potential, cur)}` : "—"}</td>
                          <td className="py-2 pl-2 text-right whitespace-nowrap">
                            <button onClick={() => setExpanded(expanded === c.m.id ? null : c.m.id)} className="text-[11px] text-accent hover:underline mr-2">
                              {expanded === c.m.id ? "sakrij" : "analiza"}
                            </button>
                            {c.hasValue && c.stake > 0 && (
                              <button
                                onClick={async () => {
                                  await placeBet({
                                    matchLabel: `${c.a.name} vs ${c.b.name} (${c.surface})`,
                                    pick: c.pick!.name,
                                    odds: c.pick!.odds,
                                    stake: c.stake,
                                    modelProb: c.pick!.prob,
                                  });
                                  setPlaced((p) => ({ ...p, [c.m.id]: true }));
                                  await refresh();
                                }}
                                disabled={placed[c.m.id]}
                                className="text-[11px] rounded bg-accent text-accent-contrast font-semibold px-2 py-1 disabled:opacity-50 hover:brightness-95 transition"
                              >
                                {placed[c.m.id] ? "✓" : "Igraj"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded === c.m.id && (
                          <tr className="bg-surface-alt/40">
                            <td colSpan={8} className="p-4">
                              <PreAnalysis a={c.a} b={c.b} surface={c.surface} oddsA={parseFloat(odds[c.m.id]?.a ?? "")} oddsB={parseFloat(odds[c.m.id]?.b ?? "")} onDeep={() => onAnalyze(c.a.name, c.b.name, c.surface)} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PLAN DANA — projekcija */}
            <div className="mt-4 rounded-lg border border-accent/40 bg-paper p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Plan dana — ako odigraš sve preporučeno</p>
              {valueRows.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  Unesi kvote iznad — čim neki meč ima value, ovde ti izlazi ukupan ulog i koliko bi bilo ako sve prođe.
                </p>
              ) : (
                <div className="grid sm:grid-cols-3 gap-3">
                  <PlanStat label="Tiketa sa value-om" value={String(valueRows.length)} />
                  <PlanStat label="Ukupan ulog" value={formatMoney(planStake, cur)} sub={`${((planStake / stats.currentBankroll) * 100).toFixed(1)}% bankrolla`} />
                  <PlanStat
                    label="Ako sve prođe"
                    value={`+${formatMoney(planPotential, cur)}`}
                    sub={`bankroll → ${formatMoney(stats.currentBankroll + planPotential, cur)}`}
                    tone="good"
                  />
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Kvote unosiš sa svoje kladionice (Mozzart, Meridian…) — tako je računica tačna za tebe. Ulog je ¼-Kelly
              predlog. Model nema dokazan edge — igraj male iznose. 18+.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

/** Analiza koja je već spremna — računa se lokalno, bez čekanja i bez kredita. */
function PreAnalysis({ a, b, surface, oddsA, oddsB, onDeep }: { a: Player; b: Player; surface: Surface; oddsA: number; oddsB: number; onDeep: () => void }) {
  const n = useMemo(
    () => buildNarrative(a, b, surface, oddsA > 1 ? oddsA : undefined, oddsB > 1 ? oddsB : undefined),
    [a, b, surface, oddsA, oddsB]
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="space-y-1.5">
          {n.paragraphs.map((p, i) => (
            <p key={i} className="text-[13px] leading-relaxed text-ink-soft">{p}</p>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink font-medium border-l-2 border-accent pl-2.5">{n.verdict}</p>
        <button onClick={onDeep} className="mt-2.5 text-[11px] text-accent hover:underline">
          Hoću dublje — AI konzilijum i istraživanje (povrede, kvote, forumi) →
        </button>
      </div>
      <table className="text-[12px] border-collapse self-start">
        <tbody>
          {n.rows.map((r) => (
            <tr key={r.label} className="border-b border-line/50">
              <td className="py-1 pr-3 text-muted">{r.label}</td>
              <td className={`py-1 px-2 text-right tabular ${r.better === "A" ? "font-bold text-good" : "text-ink-soft"}`}>{r.a}</td>
              <td className={`py-1 pl-2 text-right tabular ${r.better === "B" ? "font-bold text-good" : "text-ink-soft"}`}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-display font-bold text-lg text-ink" style={{ fontStretch: "85%" }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function HeroTile({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: "good" | "risk"; big?: boolean }) {
  const t = tone === "good" ? "text-good" : tone === "risk" ? "text-risk" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm px-4 py-3.5">
      <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{label}</p>
      <p className={`font-display font-bold tabular ${big ? "text-2xl" : "text-xl"} ${t}`} style={{ fontStretch: "85%" }}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5 tabular">{sub}</p>}
    </div>
  );
}

function PlanStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{label}</p>
      <p className={`font-display font-bold text-xl tabular ${tone === "good" ? "text-good" : "text-ink"}`} style={{ fontStretch: "85%" }}>{value}</p>
      {sub && <p className="text-[11px] text-muted tabular">{sub}</p>}
    </div>
  );
}
