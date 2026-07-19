"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Stranica na koju vodi link iz mejla za oporavak lozinke. Supabase klijent pri
 * učitavanju sam razmeni kod iz URL-a za sesiju (PKCE), pa ovde samo upišeš novu lozinku.
 */
export default function NovaLozinkaPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Sačekaj da klijent obradi kod iz URL-a, pa proveri da li sesija postoji.
    let cancelled = false;
    const check = async () => {
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setReady("ok");
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) setReady("no-session");
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Lozinke se ne poklapaju.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri promeni lozinke.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm px-5 py-20">
      <a href="/" className="font-display font-bold text-2xl text-ink block mb-1" style={{ fontStretch: "85%" }}>
        EDGE — Tenis
      </a>
      <p className="text-sm text-muted mb-8">Postavi novu lozinku</p>

      {ready === "checking" && <p className="text-sm text-muted">Proveravam link…</p>}

      {ready === "no-session" && (
        <div className="rounded-xl border border-line bg-surface shadow-sm p-5">
          <p className="text-sm text-risk mb-3">
            Link nije važeći ili je istekao. Bitno: link iz mejla mora da se otvori u istom pregledaču
            iz kog si tražio promenu lozinke.
          </p>
          <a href="/login" className="text-sm text-accent hover:underline">Zatraži novi link</a>
        </div>
      )}

      {ready === "ok" && (
        <form onSubmit={submit} className="rounded-xl border border-line bg-surface shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Nova lozinka</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Ponovi lozinku</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && <div className="rounded-md border border-risk-line bg-risk-bg px-3 py-2 text-sm text-risk">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2.5 disabled:opacity-50 hover:brightness-95 transition"
          >
            {busy ? "Sačekaj…" : "Sačuvaj novu lozinku"}
          </button>
        </form>
      )}
    </div>
  );
}
