"use client";

import { systemBacktest, type SystemResult } from "@/lib/systemBacktest";

// Boje krivih — validirane za kontrast i daltonizam, i u svetloj i u tamnoj temi.
const LINE_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

const fmt = (n: number) => Math.round(n).toLocaleString("sr-RS");

export default function SystemsBacktest() {
  const bt = systemBacktest;
  const sorted = [...bt.systems].sort((a, b) => b.roiPct - a.roiPct);
  const best = sorted[0];
  const singles = bt.systems.filter((s) => s.kind === "singl");
  const combos = bt.systems.filter((s) => s.kind === "kombo");
  const bestSingle = singles.reduce((a, b) => (a.roiPct >= b.roiPct ? a : b));
  const k2 = combos.find((s) => s.legs === 2);
  const k3 = combos.find((s) => s.legs === 3);
  const k4 = combos.find((s) => s.legs === 4);

  // Krive: najbolji singl vs kombinacije — da se vidi kako se razilaze.
  const chartSystems = [bestSingle, k2, k3, k4].filter((s): s is SystemResult => !!s);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft max-w-[75ch]">
          Ovo <strong>nije procena</strong> — ovo je simulacija na <strong>{bt.picksTested.toLocaleString("sr-RS")} stvarnih mečeva</strong> sa
          stvarnim Pinnacle kvotama ({bt.window.start} – {bt.window.end}, {bt.window.days} dana). Svaki sistem svakog dana
          rizikuje <strong>isti novac ({bt.dailyRiskPct}% bankrolla)</strong> i kreće od {fmt(bt.startBankroll)} RSD — razlikuje se
          samo <strong>forma tiketa</strong>. Tako se vidi šta forma sama po sebi radi.
        </p>
      </div>

      {/* Glavni nalaz */}
      <div className="rounded-xl border border-accent/50 bg-paper p-5">
        <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Odgovor na pitanje „koji sistem je najbolji"</p>
        <p className="font-display font-bold text-xl text-ink mb-3" style={{ fontStretch: "85%" }}>
          {best.name}
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <Stat label="Kraj (od 10.000)" value={`${fmt(best.finalBankroll)} RSD`} tone={best.pnl >= 0 ? "good" : "risk"} />
          <Stat label="ROI" value={`${best.roiPct > 0 ? "+" : ""}${best.roiPct}%`} tone={best.roiPct >= 0 ? "good" : "risk"} />
          <Stat label="Prolaznost" value={`${best.winRatePct}%`} />
        </div>
        {best.roiPct < 0 && (
          <p className="mt-3 text-[13px] text-ink-soft">
            Ali pazi: <strong>i najbolji sistem je u minusu ({best.roiPct}%)</strong>. Model još nema dokazan edge, pa ni
            najbolja forma tiketa ne pravi profit — samo <strong>gubi najsporije</strong>. To je iskrena istina, ne izgovor.
          </p>
        )}
      </div>

      {/* Kriva bankrolla */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Kako bi ti išao bankroll kroz {bt.window.days} dana</p>
        <p className="text-[12px] text-muted mb-4">Isti pickovi, isti novac u igri — jedina razlika je forma tiketa.</p>
        <Chart systems={chartSystems} start={bt.startBankroll} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
          {chartSystems.map((s, i) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
              <span className="text-[12px] text-ink-soft">{s.name}</span>
              <span className={`text-[12px] tabular font-semibold ${s.pnl >= 0 ? "text-good" : "text-risk"}`}>
                {fmt(s.finalBankroll)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela svih sistema */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-[11px] uppercase tracking-wide text-muted mb-3">Svi sistemi — od najboljeg ka najgorem</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                <th className="py-2 pr-2 font-medium">Sistem</th>
                <th className="py-2 px-2 font-medium text-right">Tiketa</th>
                <th className="py-2 px-2 font-medium text-right">Prolaznost</th>
                <th className="py-2 px-2 font-medium text-right">ROI</th>
                <th className="py-2 px-2 font-medium text-right">Kraj</th>
                <th className="py-2 px-2 font-medium text-right" title="Najveći pad od vrha — koliko bi te bolelo usput">Najveći pad</th>
                <th className="py-2 pl-2 font-medium text-right" title="Najduži niz uzastopnih gubitaka">Niz gubitaka</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.name} className="border-b border-line/60">
                  <td className="py-2 pr-2 text-ink">
                    {s.name}
                    {s.name === best.name && (
                      <span className="ml-1.5 text-[10px] uppercase font-bold rounded px-1.5 py-0.5 bg-accent text-accent-contrast">najbolji</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular text-muted">{s.tickets}</td>
                  <td className="py-2 px-2 text-right tabular text-ink-soft">{s.winRatePct}%</td>
                  <td className={`py-2 px-2 text-right tabular font-semibold ${s.roiPct >= 0 ? "text-good" : "text-risk"}`}>
                    {s.roiPct > 0 ? "+" : ""}{s.roiPct}%
                  </td>
                  <td className={`py-2 px-2 text-right tabular ${s.finalBankroll >= bt.startBankroll ? "text-good" : "text-risk"}`}>
                    {fmt(s.finalBankroll)}
                  </td>
                  <td className="py-2 px-2 text-right tabular text-muted">−{s.maxDrawdownPct}%</td>
                  <td className="py-2 pl-2 text-right tabular text-muted">{s.worstLosingStreak}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Šta ovo znači */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-[11px] uppercase tracking-wide text-muted mb-3">Šta ovo konkretno znači za tebe</p>
        <ul className="space-y-3 text-[13px] text-ink-soft">
          <li>
            <strong className="text-ink">Svaki dodatni par na tiketu te košta.</strong>{" "}
            {k2 && k3 && k4 && (
              <>
                Kombinacija 2 para: <span className="tabular text-risk">{k2.roiPct}%</span> · 3 para:{" "}
                <span className="tabular text-risk">{k3.roiPct}%</span> · 4 para:{" "}
                <span className="tabular text-risk">{k4.roiPct}%</span>. Od 10.000 RSD, kombinacija 3 para bi ti ostavila{" "}
                <strong className="text-risk">{fmt(k3.finalBankroll)}</strong> — izgubio bi{" "}
                {Math.round((1 - k3.finalBankroll / bt.startBankroll) * 100)}% bankrolla.
              </>
            )}
          </li>
          <li>
            <strong className="text-ink">Pickovi su ti dobri — forma tiketa nije.</strong> Singlovi pogađaju{" "}
            <span className="tabular text-good">{bestSingle.winRatePct}%</span>, a kombinacija 3 para samo{" "}
            <span className="tabular text-risk">{k3?.winRatePct}%</span> — <em>isti</em> pickovi, drugačija forma.
          </li>
          <li>
            <strong className="text-ink">81% prolaznosti i dalje gubi.</strong> Zato što se igraju favoriti na malim
            kvotama, a marža kladionice pojede razliku. Visoka prolaznost ≠ profit.
          </li>
          <li>
            <strong className="text-ink">Niz gubitaka te lomi.</strong> Singlovi: najgori niz{" "}
            {bestSingle.worstLosingStreak} uzastopna gubitka. Kombinacija 4 para: {k4?.worstLosingStreak}× zaredom — malo
            ko to izdrži bez povećanja uloga i propasti.
          </li>
        </ul>
      </div>

      <p className="text-[11px] text-muted">
        Simulacija koristi Pinnacle kvote (najoštrije tržište). Kod srpskih kladionica marža je veća, pa bi rezultati bili
        još lošiji. Ovo je razlog zašto app ne obećava profit — 18+, klađenje je odgovornost korisnika.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "risk" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{label}</p>
      <p className={`font-display font-bold text-2xl tabular ${tone === "good" ? "text-good" : tone === "risk" ? "text-risk" : "text-ink"}`} style={{ fontStretch: "85%" }}>
        {value}
      </p>
    </div>
  );
}

/** Krive bankrolla — x je napredak kroz period, y je stanje bankrolla. */
function Chart({ systems, start }: { systems: SystemResult[]; start: number }) {
  const W = 720;
  const H = 220;
  const P = { t: 10, r: 10, b: 18, l: 46 };

  const allVals = systems.flatMap((s) => s.curve);
  if (allVals.length === 0) return null;
  const min = Math.min(...allVals, start);
  const max = Math.max(...allVals, start);
  const pad = (max - min) * 0.08 || 100;
  const lo = min - pad;
  const hi = max + pad;

  const x = (i: number, n: number) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  const ticks = [lo, start, hi].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Kriva bankrolla po sistemima">
        {/* mreža */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} y1={y(v)} x2={W - P.r} y2={y(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={v === start ? "4 3" : "0"} />
            <text x={P.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" className="tabular">
              {fmt(v)}
            </text>
          </g>
        ))}
        {/* linija početnog bankrolla je isprekidana (gore) */}
        {systems.map((s, si) => {
          const n = s.curve.length;
          const d = s.curve.map((v, i) => `${i === 0 ? "M" : "L"}${x(i, n).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          const last = s.curve[n - 1];
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={LINE_COLORS[si % LINE_COLORS.length]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1, n)} cy={y(last)} r="3" fill={LINE_COLORS[si % LINE_COLORS.length]} />
            </g>
          );
        })}
        <text x={P.l} y={H - 5} fontSize="9" fill="var(--muted)">početak</text>
        <text x={W - P.r} y={H - 5} textAnchor="end" fontSize="9" fill="var(--muted)">kraj perioda</text>
      </svg>
    </div>
  );
}
