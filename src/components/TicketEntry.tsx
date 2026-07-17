"use client";

import { useState } from "react";
import { combinedOdds } from "@/lib/bankroll";
import { useBankroll, formatMoney } from "./BankrollContext";

type LegForm = { match: string; pick: string; odds: string; result: "won" | "lost" };

const emptyLeg = (): LegForm => ({ match: "", pick: "", odds: "", result: "won" });

/** Ručni unos već odigranih tiketa — da analiza ima od čega da uči. */
export default function TicketEntry({ onSaved }: { onSaved?: () => void }) {
  const { authed, state, placeBet, refresh } = useBankroll();
  const [open, setOpen] = useState(false);
  const [legs, setLegs] = useState<LegForm[]>([emptyLeg()]);
  const [stake, setStake] = useState("");
  const [date, setDate] = useState("");
  const [bookmaker, setBookmaker] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  if (!authed) return null;
  const cur = state?.currency ?? "RSD";

  const validLegs = legs.filter((l) => l.match.trim() && l.pick.trim() && parseFloat(l.odds) > 1);
  const total = validLegs.length ? combinedOdds(validLegs.map((l) => ({ odds: parseFloat(l.odds) }))) : 0;
  // Tiket prolazi samo ako SVI parovi prođu — isto pravilo kao na pravom listiću.
  const ticketResult: "won" | "lost" = validLegs.every((l) => l.result === "won") ? "won" : "lost";
  const stakeNum = parseFloat(stake) || 0;

  async function save() {
    setError("");
    if (validLegs.length === 0) return setError("Unesi bar jedan par (meč, na koga si igrao, kvota).");
    if (!(stakeNum > 0)) return setError("Unesi ulog.");
    setSaving(true);
    try {
      const bk = bookmaker.trim() ? ` · ${bookmaker.trim()}` : "";
      await placeBet({
        matchLabel: validLegs.length === 1 ? `${validLegs[0].match.trim()}${bk}` : `Kombinacija ${validLegs.length} para${bk}`,
        pick: validLegs.map((l) => l.pick.trim()).join(" + "),
        odds: total,
        stake: stakeNum,
        modelProb: 0,
        source: "rucno",
        status: ticketResult,
        placedAt: date ? new Date(date).toISOString() : undefined,
        legs:
          validLegs.length >= 2
            ? validLegs.map((l) => ({ match: l.match.trim(), pick: l.pick.trim(), odds: parseFloat(l.odds), result: l.result }))
            : undefined,
      });
      await refresh();
      setMsg(`Upisano: ${validLegs.length === 1 ? "singl" : `kombinacija ${validLegs.length} para`} @ ${total.toFixed(2)} — ${ticketResult === "won" ? "dobitak" : "gubitak"}`);
      setLegs([emptyLeg()]);
      setStake("");
      setDate("");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška pri upisu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-ink hover:text-accent transition-colors">
        {open ? "− " : "+ "}Unesi tiket koji si već odigrao (ručno)
      </button>
      {!open && <p className="text-[12px] text-muted mt-1">Ili gore slikaj tiket — brže je. Ručni unos je za starije tikete bez slike.</p>}

      {open && (
        <div className="mt-4 space-y-3">
          {legs.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_80px_110px_auto] items-end">
              <label className="block">
                {i === 0 && <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Meč</span>}
                <input
                  value={l.match}
                  onChange={(e) => setLegs((s) => s.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))}
                  placeholder="Sinner J. vs Alcaraz C."
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <label className="block">
                {i === 0 && <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Igrao si na</span>}
                <input
                  value={l.pick}
                  onChange={(e) => setLegs((s) => s.map((x, j) => (j === i ? { ...x, pick: e.target.value } : x)))}
                  placeholder="Sinner J."
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <label className="block">
                {i === 0 && <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Kvota</span>}
                <input
                  type="number" step="0.01" min="1.01"
                  value={l.odds}
                  onChange={(e) => setLegs((s) => s.map((x, j) => (j === i ? { ...x, odds: e.target.value } : x)))}
                  placeholder="1.80"
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink tabular focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <label className="block">
                {i === 0 && <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Par</span>}
                <select
                  value={l.result}
                  onChange={(e) => setLegs((s) => s.map((x, j) => (j === i ? { ...x, result: e.target.value as "won" | "lost" } : x)))}
                  className={`w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent ${l.result === "won" ? "text-good" : "text-risk"}`}
                >
                  <option value="won">prošao ✓</option>
                  <option value="lost">pao ✗</option>
                </select>
              </label>
              {legs.length > 1 && (
                <button onClick={() => setLegs((s) => s.filter((_, j) => j !== i))} className="text-[11px] text-muted hover:text-risk pb-1.5" title="Ukloni par">
                  ukloni
                </button>
              )}
            </div>
          ))}

          <button onClick={() => setLegs((s) => [...s, emptyLeg()])} className="text-xs text-accent hover:underline">
            + dodaj još jedan par
          </button>

          <div className="grid gap-2 sm:grid-cols-4 items-end pt-2 border-t border-line">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Ulog ({cur})</span>
              <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="500"
                className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink tabular focus:outline-none focus:ring-1 focus:ring-accent" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Datum (opc.)</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Kladionica (opc.)</span>
              <input value={bookmaker} onChange={(e) => setBookmaker(e.target.value)} placeholder="Mozzart"
                className="w-full rounded border border-line bg-surface px-2 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent" />
            </label>
            <button onClick={save} disabled={saving}
              className="rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2 disabled:opacity-50 hover:brightness-95 transition">
              {saving ? "Upisujem…" : "Upiši tiket"}
            </button>
          </div>

          {validLegs.length > 0 && (
            <p className="text-[12px] text-ink-soft">
              Ukupna kvota <strong className="tabular">{total.toFixed(2)}</strong> · ishod tiketa:{" "}
              <strong className={ticketResult === "won" ? "text-good" : "text-risk"}>
                {ticketResult === "won" ? "dobitak" : "gubitak"}
              </strong>
              {validLegs.length > 1 && ticketResult === "lost" && <span className="text-muted"> (bar jedan par je pao → pada ceo tiket)</span>}
              {stakeNum > 0 && ticketResult === "won" && <span className="text-good"> → +{formatMoney(stakeNum * (total - 1), cur)}</span>}
              {stakeNum > 0 && ticketResult === "lost" && <span className="text-risk"> → −{formatMoney(stakeNum, cur)}</span>}
            </p>
          )}
          {error && <p className="text-[12px] text-risk">{error}</p>}
          {msg && <p className="text-[12px] text-good">{msg}</p>}
        </div>
      )}
    </div>
  );
}
