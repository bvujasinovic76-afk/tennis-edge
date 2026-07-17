"use client";

import { useState } from "react";
import { combinedOdds } from "@/lib/bankroll";
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

type ScanItem = {
  id: string;
  fileName: string;
  preview: string;
  status: "cekanje" | "citam" | "gotovo" | "greska" | "upisano";
  ticket?: Ticket;
  error?: string;
  stake: string;
  result: "pending" | "won" | "lost";
};

/** Slikaj jedan ili više tiketa → svaki se pročita → potvrdiš → upišu se u istoriju. */
export default function TicketScan() {
  const { authed, state, placeBet, refresh } = useBankroll();
  const [items, setItems] = useState<ScanItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  if (!authed) return null;
  const cur = state?.currency ?? "RSD";

  async function onFiles(files: FileList) {
    const list = Array.from(files).slice(0, 12); // razuman limit po seriji
    const prepared: ScanItem[] = [];
    for (const f of list) {
      const preview = await downscale(f, 1400);
      prepared.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: f.name,
        preview,
        status: "cekanje",
        stake: "",
        result: "pending",
      });
    }
    setItems((prev) => [...prev, ...prepared]);
    setBusy(true);

    // Redom, jedan po jedan — da ne udaramo API u isto vreme i da vidiš napredak.
    for (const item of prepared) {
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: "citam" } : x)));
      try {
        const res = await fetch("/api/scan-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: item.preview }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? { ...x, status: "gotovo", ticket: j.ticket, stake: j.ticket?.stake != null ? String(j.ticket.stake) : "" }
              : x
          )
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: "greska", error: e instanceof Error ? e.message : "Greška." } : x))
        );
      }
    }
    setBusy(false);
  }

  async function saveOne(item: ScanItem): Promise<boolean> {
    if (!item.ticket) return false;
    const legs = item.ticket.legs.filter((l): l is Leg & { odds: number } => !!l.odds && l.odds > 1);
    const stakeNum = parseFloat(item.stake);
    if (legs.length === 0 || !(stakeNum > 0)) return false;

    // Kombinacija = JEDAN tiket: ukupna kvota je proizvod, pada ako bilo koji par padne.
    const total = item.ticket.totalOdds && item.ticket.totalOdds > 1 ? item.ticket.totalOdds : combinedOdds(legs);
    const bk = item.ticket.bookmaker ? ` · ${item.ticket.bookmaker}` : "";
    await placeBet({
      matchLabel: legs.length === 1 ? `${legs[0].match}${bk}` : `Kombinacija ${legs.length} para${bk}`,
      pick: legs.map((l) => l.pick).join(" + "),
      odds: total,
      stake: stakeNum,
      modelProb: 0,
      source: "slika",
      status: item.result,
      legs:
        legs.length >= 2
          ? legs.map((l) => ({ match: l.match, pick: l.pick, odds: l.odds, result: item.result === "pending" ? "pending" : undefined }))
          : undefined,
    });
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: "upisano" } : x)));
    return true;
  }

  async function saveAll() {
    setSavingAll(true);
    try {
      for (const it of items.filter((x) => x.status === "gotovo")) {
        await saveOne(it);
      }
      await refresh();
    } finally {
      setSavingAll(false);
    }
  }

  const ready = items.filter((x) => x.status === "gotovo");
  const done = items.filter((x) => x.status === "upisano").length;
  const scanning = items.filter((x) => x.status === "citam" || x.status === "cekanje").length;

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <h3 className="font-display font-bold text-lg text-ink mb-1" style={{ fontStretch: "85%" }}>
        📷 Slikaj tikete — sam ih pročitam i zapišem
      </h3>
      <p className="text-sm text-muted mb-4 max-w-[64ch]">
        Možeš ubaciti <strong>više tiketa odjednom</strong>. Pročitam parove, kvote i ulog sa svakog, ti označiš ishod i
        potvrdiš — pa svi uđu u istoriju i u analizu „Gde grešim".
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-block">
          <span className={`inline-block rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2.5 transition ${busy ? "opacity-50" : "cursor-pointer hover:brightness-95"}`}>
            {busy ? `Čitam… (${items.filter((x) => x.status === "gotovo" || x.status === "greska").length}/${items.length})` : "Izaberi / slikaj tikete"}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.length) onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {ready.length > 0 && (
          <button
            onClick={saveAll}
            disabled={savingAll}
            className="rounded-md border border-accent text-accent font-semibold text-sm px-4 py-2.5 disabled:opacity-50 hover:bg-surface-alt transition"
          >
            {savingAll ? "Upisujem…" : `Zapiši sve (${ready.length})`}
          </button>
        )}
        {items.length > 0 && !busy && (
          <button onClick={() => setItems([])} className="text-xs text-muted hover:text-risk transition-colors">
            očisti listu
          </button>
        )}
        {items.length > 0 && (
          <span className="text-[12px] text-muted tabular ml-auto">
            {items.length} {items.length === 1 ? "tiket" : "tiketa"} · upisano {done}
            {scanning > 0 && ` · u redu ${scanning}`}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-5 space-y-3">
          {items.map((it) => (
            <TicketCard
              key={it.id}
              item={it}
              cur={cur}
              onStake={(v) => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stake: v } : x)))}
              onResult={(v) => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, result: v } : x)))}
              onSave={async () => {
                await saveOne(it);
                await refresh();
              }}
              onRemove={() => setItems((p) => p.filter((x) => x.id !== it.id))}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-4 text-[11px] text-muted">
          Svaka slika je jedan poziv AI modela (troši kredit) — zato se čitaju redom, jedna po jedna.
        </p>
      )}
    </div>
  );
}

function TicketCard({
  item,
  cur,
  onStake,
  onResult,
  onSave,
  onRemove,
}: {
  item: ScanItem;
  cur: string;
  onStake: (v: string) => void;
  onResult: (v: "pending" | "won" | "lost") => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const legs = item.ticket?.legs.filter((l): l is Leg & { odds: number } => !!l.odds && l.odds > 1) ?? [];
  const total = item.ticket?.totalOdds && item.ticket.totalOdds > 1 ? item.ticket.totalOdds : legs.length ? combinedOdds(legs) : 0;
  const stakeNum = parseFloat(item.stake) || 0;

  return (
    <div className={`rounded-lg border p-3 ${item.status === "upisano" ? "border-good bg-good-bg/30" : item.status === "greska" ? "border-risk-line bg-risk-bg/30" : "border-line bg-paper"}`}>
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.preview} alt={item.fileName} className="rounded border border-line max-h-32 w-full object-contain bg-surface" />

        <div className="min-w-0">
          {(item.status === "cekanje" || item.status === "citam") && (
            <p className="text-sm text-muted">{item.status === "citam" ? "Čitam tiket…" : "Čeka u redu…"}</p>
          )}
          {item.status === "greska" && (
            <div>
              <p className="text-sm text-risk">{item.error}</p>
              <button onClick={onRemove} className="mt-1 text-[11px] text-muted hover:text-risk">ukloni</button>
            </div>
          )}

          {(item.status === "gotovo" || item.status === "upisano") && item.ticket && (
            <>
              {legs.length === 0 ? (
                <div>
                  <p className="text-sm text-risk">{item.ticket.notes ?? "Nisam prepoznao tiket na slici."}</p>
                  <button onClick={onRemove} className="mt-1 text-[11px] text-muted hover:text-risk">ukloni</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 ${item.status === "upisano" ? "bg-good text-white" : "bg-accent text-accent-contrast"}`}>
                      {item.status === "upisano" ? "Upisano ✓" : "Pročitano"}
                    </span>
                    {item.ticket.bookmaker && <span className="text-[13px] text-ink-soft">{item.ticket.bookmaker}</span>}
                    <span className="text-[12px] text-muted tabular ml-auto">
                      {legs.length === 1 ? "singl" : `${legs.length} para`} · kvota {total.toFixed(2)}
                    </span>
                  </div>

                  <ul className="space-y-0.5 mb-2">
                    {legs.map((l, i) => (
                      <li key={i} className="text-[12px] flex items-baseline gap-1.5">
                        <span className="font-medium text-ink">{l.pick}</span>
                        <span className="tabular text-ink-soft">@{l.odds.toFixed(2)}</span>
                        <span className="text-muted truncate">— {l.match}</span>
                      </li>
                    ))}
                  </ul>

                  {item.status !== "upisano" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Ulog ({cur})</span>
                        <input
                          type="number"
                          value={item.stake}
                          onChange={(e) => onStake(e.target.value)}
                          className="w-24 rounded border border-line bg-surface px-2 py-1 text-[13px] text-ink tabular focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Ishod tiketa</span>
                        <select
                          value={item.result}
                          onChange={(e) => onResult(e.target.value as "pending" | "won" | "lost")}
                          className={`rounded border border-line bg-surface px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-accent ${item.result === "won" ? "text-good" : item.result === "lost" ? "text-risk" : "text-ink"}`}
                        >
                          <option value="pending">još traje</option>
                          <option value="won">dobitak ✓</option>
                          <option value="lost">gubitak ✗</option>
                        </select>
                      </label>
                      {stakeNum > 0 && (
                        <p className="text-[12px] tabular pb-1.5">
                          {item.result === "lost" ? (
                            <span className="text-risk">−{formatMoney(stakeNum, cur)}</span>
                          ) : (
                            <span className="text-good">{item.result === "won" ? "+" : "ako prođe: +"}{formatMoney(stakeNum * (total - 1), cur)}</span>
                          )}
                        </p>
                      )}
                      <button
                        onClick={onSave}
                        disabled={!(stakeNum > 0)}
                        className="ml-auto text-xs rounded-md bg-accent text-accent-contrast font-semibold px-3 py-1.5 disabled:opacity-50 hover:brightness-95 transition"
                      >
                        Zapiši
                      </button>
                    </div>
                  )}

                  {item.ticket.notes && item.status !== "upisano" && (
                    <p className="mt-1.5 text-[11px] text-muted">Napomena: {item.ticket.notes}</p>
                  )}
                  {legs.length > 1 && item.status !== "upisano" && (
                    <p className="mt-1 text-[11px] text-muted">
                      Kombinacija — jedan tiket. Ako <strong>bilo koji</strong> par padne, ceo tiket je izgubljen.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
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
