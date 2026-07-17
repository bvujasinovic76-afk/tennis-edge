"use client";

import { useMemo } from "react";
import { analyzeBets, type Severity } from "@/lib/coach";
import { useBankroll, formatMoney } from "./BankrollContext";
import TicketEntry from "./TicketEntry";

const SEV: Record<Severity, { box: string; badge: string; label: string }> = {
  high: { box: "border-risk-line bg-risk-bg/40", badge: "bg-risk text-white", label: "Glavni problem" },
  medium: { box: "border-line bg-surface-alt/50", badge: "bg-accent text-accent-contrast", label: "Pazi" },
  info: { box: "border-line bg-surface-alt/30", badge: "bg-surface-alt text-ink-soft", label: "Info" },
};

/** „Gde grešim" — analiza sopstvenih tiketa, sve lokalno iz istorije (0 AI kredita). */
export default function Coach() {
  const { state, stats, authed } = useBankroll();

  const report = useMemo(() => {
    if (!state || !stats) return null;
    return analyzeBets(state.bets, stats.currentBankroll);
  }, [state, stats]);

  if (!authed) return <p className="text-sm text-muted">Prijavi se da vidiš analizu svojih tiketa.</p>;
  if (!report || !state) return <p className="text-sm text-muted">Učitavanje…</p>;

  const cur = state.currency;

  return (
    <div className="space-y-5">
      <TicketEntry />

      {report.sampleWarning && (
        <p className="text-[13px] rounded-md bg-surface-alt px-3 py-2 text-ink-soft">ⓘ {report.sampleWarning}</p>
      )}

      {report.settledCount > 0 && (
        <>
          {/* Kontrafaktual — najvažniji nalaz */}
          {report.counterfactual && (
            <div className="rounded-xl border border-accent/50 bg-paper p-5">
              <p className="text-[11px] uppercase tracking-wide text-muted mb-3">
                Šta bi bilo da si iste parove igrao kao singlove
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] text-muted mb-0.5">Kako si igrao (kombinacije)</p>
                  <p className={`font-display font-bold text-2xl tabular ${report.counterfactual.comboPnl >= 0 ? "text-good" : "text-risk"}`} style={{ fontStretch: "85%" }}>
                    {report.counterfactual.comboPnl >= 0 ? "+" : ""}{formatMoney(report.counterfactual.comboPnl, cur)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted mb-0.5">Da si igrao singlove</p>
                  <p className={`font-display font-bold text-2xl tabular ${report.counterfactual.singlesPnl >= 0 ? "text-good" : "text-risk"}`} style={{ fontStretch: "85%" }}>
                    {report.counterfactual.singlesPnl >= 0 ? "+" : ""}{formatMoney(report.counterfactual.singlesPnl, cur)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted mb-0.5">Razlika</p>
                  <p className={`font-display font-bold text-2xl tabular ${report.counterfactual.difference > 0 ? "text-good" : "text-ink"}`} style={{ fontStretch: "85%" }}>
                    {report.counterfactual.difference > 0 ? "+" : ""}{formatMoney(report.counterfactual.difference, cur)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-ink-soft">
                Pogodio si <strong>{report.counterfactual.legsWon} od {report.counterfactual.legsTotal}</strong> parova
                ({Math.round((report.counterfactual.legsWon / report.counterfactual.legsTotal) * 100)}%) —{" "}
                {report.counterfactual.difference > 0
                  ? "tvoji pickovi nisu problem, nego forma tiketa."
                  : "kombinacije ti za sada nisu odmogle."}
              </p>
            </div>
          )}

          {/* Nalazi */}
          <div className="space-y-3">
            {report.findings.map((f, i) => (
              <div key={i} className={`rounded-lg border p-4 ${SEV[f.severity].box}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 ${SEV[f.severity].badge}`}>
                    {SEV[f.severity].label}
                  </span>
                  <p className="font-semibold text-ink text-sm">{f.title}</p>
                </div>
                <p className="text-[13px] text-ink-soft mb-2">{f.detail}</p>
                <p className="text-[13px] text-ink">
                  <strong>Šta promeniti:</strong> {f.fix}
                </p>
              </div>
            ))}
          </div>

          {/* Brojke */}
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted mb-3">Tvoje brojke</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Num label="Završenih tiketa" v={String(report.settledCount)} />
              <Num label="Ukupno uloženo" v={formatMoney(report.totalStaked, cur)} />
              <Num label="Rezultat" v={`${report.pnl >= 0 ? "+" : ""}${formatMoney(report.pnl, cur)}`} tone={report.pnl >= 0 ? "good" : "risk"} />
              <Num label="ROI" v={`${report.roiPct >= 0 ? "+" : ""}${report.roiPct.toFixed(1)}%`} tone={report.roiPct >= 0 ? "good" : "risk"} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Num label="Prosečna kvota" v={report.avgOdds.toFixed(2)} />
              <Num label="Prosečan ulog" v={formatMoney(report.avgStake, cur)} />
              <Num label="Kvote traže prolaz" v={`${report.impliedWinRatePct.toFixed(0)}%`} />
              <Num label="Tvoj stvarni prolaz" v={`${report.actualWinRatePct.toFixed(0)}%`} tone={report.actualWinRatePct >= report.impliedWinRatePct ? "good" : "risk"} />
            </div>

            {report.byLegCount.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[460px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                      <th className="py-2 pr-2 font-medium">Tip tiketa</th>
                      <th className="py-2 px-2 font-medium text-right">Odigrano</th>
                      <th className="py-2 px-2 font-medium text-right">Prošlo</th>
                      <th className="py-2 px-2 font-medium text-right">Uspešnost</th>
                      <th className="py-2 pl-2 font-medium text-right">Rezultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byLegCount.map((g) => (
                      <tr key={g.legs} className="border-b border-line/60">
                        <td className="py-2 pr-2 text-ink">{g.label}</td>
                        <td className="py-2 px-2 text-right tabular text-ink-soft">{g.count}</td>
                        <td className="py-2 px-2 text-right tabular text-ink-soft">{g.won}</td>
                        <td className="py-2 px-2 text-right tabular text-ink">{g.winRatePct.toFixed(0)}%</td>
                        <td className={`py-2 pl-2 text-right tabular font-semibold ${g.pnl >= 0 ? "text-good" : "text-risk"}`}>
                          {g.pnl >= 0 ? "+" : ""}{formatMoney(g.pnl, cur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Num({ label, v, tone }: { label: string; v: string; tone?: "good" | "risk" }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted mb-0.5">{label}</p>
      <p className={`font-semibold text-base tabular ${tone === "good" ? "text-good" : tone === "risk" ? "text-risk" : "text-ink"}`}>{v}</p>
    </div>
  );
}
