"use client";

import { useState } from "react";
import { useBankroll, formatMoney } from "./BankrollContext";

type Leg = { match: string; pick: string; odds: number | null };
type Ticket = {
  bookmaker: string | null;
  legs: Leg[];
  stake: number | null;
  totalOdds: number | null;
  potentialPayout: number | null;
  currency: string | null;
  notes: string | null;
};

/** Slikaj tiket → vision model ga pročita → potvrdiš → upiše se u istoriju. */
export default function TicketScan() {
  const { authed, state, placeBet, refresh } = useBankroll();
  const [preview, setPreview] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error" | "saved">("idle");
  const [error, setError] = useState("");
  const [stakeEdit, setStakeEdit] = useState("");

  if (!authed) return null;
  const cur = state?.currency ?? "RSD";

  async function onFile(file: File) {
    setError("");
    setTicket(null);
    setStatus("scanning");
    try {
      // Smanji sliku pre slanja — brže i jeftinije, a čitljivost ostaje.
      const dataUrl = await downscale(file, 1400);
      setPreview(dataUrl);
      const res = await fetch("/api/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setTicket(j.ticket);
      setStakeEdit(j.ticket?.stake != null ? String(j.ticket.stake) : "");
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška pri čitanju.");
      setStatus("error");
    }
  }

  async function save() {
    if (!ticket) return;
    const legs = ticket.legs.filter((l) => l.odds && l.odds > 1);
    if (legs.length === 0) {
      setError("Nijedan par nema pročitanu kvotu — ne mogu da upišem.");
      return;
    }
    const totalStake = parseFloat(stakeEdit);
    if (!(totalStake > 0)) {
      setError("Unesi ulog.");
      return;
    }
    // Singl tiket → ceo ulog; kombinacija → ulog se deli na parove radi praćenja pojedinačno.
    const per = Math.round(totalStake / legs.length);
    for (const l of legs) {
      await placeBet({
        matchLabel: `${l.match}${ticket.bookmaker ? ` · ${ticket.bookmaker}` : ""}`,
        pick: l.pick,
        odds: l.odds!,
        stake: per,
        modelProb: 0,
        source: "slika",
      });
    }
    await refresh();
    setStatus("saved");
  }

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <h3 className="font-display font-bold text-lg text-ink mb-1" style={{ fontStretch: "85%" }}>
        📷 Slikaj tiket — sam ga pročitam i zapišem
      </h3>
      <p className="text-sm text-muted mb-4 max-w-[62ch]">
        Odigraš na kladionici, slikaš tiket telefonom i ubaciš ovde. Pročitam parove, kvote i ulog, ti potvrdiš —
        i tiket ulazi u tvoju istoriju sa svim ostalim.
      </p>

      <label className="inline-block">
        <span className="inline-block rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2.5 cursor-pointer hover:brightness-95 transition">
          {status === "scanning" ? "Čitam tiket…" : "Izaberi / slikaj tiket"}
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={status === "scanning"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      {error && <div className="mt-3 rounded-md border border-risk-line bg-risk-bg px-3 py-2 text-sm text-risk">{error}</div>}

      {preview && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Slikan tiket" className="rounded-lg border border-line max-h-56 object-contain bg-paper" />

          {ticket && (
            <div>
              {ticket.legs.length === 0 ? (
                <p className="text-sm text-risk">{ticket.notes ?? "Nisam prepoznao tiket na slici."}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] uppercase tracking-wide font-bold rounded px-2 py-0.5 bg-accent text-accent-contrast">Pročitano</span>
                    {ticket.bookmaker && <span className="text-sm text-ink-soft">{ticket.bookmaker}</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                          <th className="py-1.5 pr-2 font-medium">Meč</th>
                          <th className="py-1.5 px-2 font-medium">Igrano</th>
                          <th className="py-1.5 pl-2 font-medium text-right">Kvota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticket.legs.map((l, i) => (
                          <tr key={i} className="border-b border-line/60">
                            <td className="py-1.5 pr-2 text-ink-soft text-[13px]">{l.match}</td>
                            <td className="py-1.5 px-2 text-ink font-medium text-[13px]">{l.pick}</td>
                            <td className={`py-1.5 pl-2 text-right tabular text-[13px] ${l.odds ? "text-ink" : "text-risk"}`}>
                              {l.odds ? l.odds.toFixed(2) : "nečitko"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="block text-[11px] uppercase tracking-wide text-muted mb-1">Ulog ({cur})</span>
                      <input
                        type="number"
                        value={stakeEdit}
                        onChange={(e) => setStakeEdit(e.target.value)}
                        className="w-28 rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-ink tabular focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </label>
                    {ticket.totalOdds && (
                      <p className="text-sm text-ink-soft tabular">
                        Ukupna kvota <strong className="text-ink">{ticket.totalOdds.toFixed(2)}</strong>
                      </p>
                    )}
                    {ticket.potentialPayout && (
                      <p className="text-sm text-good tabular">
                        Moguća isplata <strong>{formatMoney(ticket.potentialPayout, cur)}</strong>
                      </p>
                    )}
                    <button
                      onClick={save}
                      disabled={status === "saved"}
                      className="rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2 disabled:opacity-50 hover:brightness-95 transition"
                    >
                      {status === "saved" ? "Zapisano ✓" : "Zapiši u istoriju"}
                    </button>
                  </div>

                  {ticket.notes && <p className="mt-2 text-[11px] text-muted">Napomena modela: {ticket.notes}</p>}
                  {ticket.legs.length > 1 && (
                    <p className="mt-1 text-[11px] text-muted">
                      Kombinacija — ulog delim na {ticket.legs.length} para da bi svaki mogao da se prati posebno.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Smanji sliku u browseru pre slanja (brže, jeftinije, i dalje čitljivo). */
async function downscale(file: File, maxDim: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}
