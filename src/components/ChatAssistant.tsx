"use client";

import { useEffect, useRef, useState } from "react";
import { useBankroll } from "./BankrollContext";

type Msg = { role: "user" | "assistant"; content: string; actions?: string[] };

const SUGGESTIONS = [
  "Šta danas igramo?",
  "Koliko mi je bankroll?",
  "Odigrao sam tiket",
  "Koji sistem je najbolji?",
];

/** Chat sa asistentom — može da pročita plan i sam upiše/obeleži tiket. */
export default function ChatAssistant() {
  const { authed, refresh } = useBankroll();
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Zdravo. Pitaj me šta danas igramo, koliko ti je bankroll, ili mi reci da si odigrao tiket pa ću ga upisati. Kad meč prođe, samo javi kako je bilo — obeležiću.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  if (!authed) {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-sm p-5 text-center">
        <p className="text-sm text-muted">
          Prijavi se da bi pričao sa asistentom — on čita tvoj plan i vodi ti evidenciju tiketa.
        </p>
      </div>
    );
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setError("");
    const next: Msg[] = [...msgs, { role: "user", content: clean }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsgs((p) => [...p, { role: "assistant", content: j.reply, actions: j.actions }]);
      // Ako je asistent nešto upisao/obeležio, osveži brojke u ostatku app-a.
      if (j.actions?.length) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-lg text-ink" style={{ fontStretch: "85%" }}>
          💬 Pričaj sa asistentom
        </h3>
        <span className="text-[11px] text-muted">zna tvoj plan i vodi evidenciju</span>
      </div>

      <div ref={boxRef} className="max-h-[340px] overflow-y-auto space-y-3 mb-3 pr-1">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "bg-accent text-accent-contrast" : "bg-surface-alt text-ink-soft"
              }`}
            >
              {/* Jeftini modeli vole da ubace **markdown** — skidamo zvezdice iz prikaza. */}
              {m.content.replace(/\*\*/g, "")}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-line/60 space-y-0.5">
                  {m.actions.map((a, j) => (
                    <p key={j} className="text-[11px] text-good">✓ {a}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-surface-alt px-3.5 py-2.5 text-[13px] text-muted">piše…</div>
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-[12px] text-risk">{error}</p>}

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            className="text-[11px] rounded-full border border-line bg-paper px-2.5 py-1 text-ink-soft hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Npr. odigrao sam Rublev @1.28, ulog 200…"
          disabled={busy}
          className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2 disabled:opacity-50 hover:brightness-95 transition"
        >
          Pošalji
        </button>
      </form>
    </div>
  );
}
