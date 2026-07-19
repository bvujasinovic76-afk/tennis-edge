"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/nova-lozinka`,
        });
        if (error) throw error;
        setInfo("Poslali smo ti mejl sa linkom za novu lozinku. Proveri i spam/junk folder — link otvori u ISTOM pregledaču iz kog si ovo tražio.");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri prijavi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm px-5 py-20">
      <a href="/" className="font-display font-bold text-2xl text-ink block mb-1" style={{ fontStretch: "85%" }}>
        EDGE — Tenis
      </a>
      <p className="text-sm text-muted mb-8">
        {mode === "login" ? "Prijavi se na svoj nalog" : mode === "signup" ? "Napravi nalog da pratiš bankroll i tikete" : "Upiši email — stiže ti link za novu lozinku"}
      </p>

      <form onSubmit={submit} className="rounded-xl border border-line bg-surface shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        {mode !== "reset" && (
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">Lozinka</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        )}

        {error && <div className="rounded-md border border-risk-line bg-risk-bg px-3 py-2 text-sm text-risk">{error}</div>}
        {info && <div className="rounded-md border border-good bg-good-bg px-3 py-2 text-sm text-good">{info}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent text-accent-contrast font-semibold text-sm px-4 py-2.5 disabled:opacity-50 hover:brightness-95 transition"
        >
          {busy ? "Sačekaj…" : mode === "login" ? "Prijavi se" : mode === "signup" ? "Napravi nalog" : "Pošalji link za novu lozinku"}
        </button>
      </form>

      <div className="mt-4 flex flex-col items-start gap-2">
        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setInfo("");
          }}
          className="text-sm text-accent hover:underline"
        >
          {mode === "login" ? "Nemaš nalog? Napravi nalog" : "Već imaš nalog? Prijavi se"}
        </button>
        {mode === "login" && (
          <button
            onClick={() => {
              setMode("reset");
              setError("");
              setInfo("");
            }}
            className="text-sm text-muted hover:text-accent hover:underline"
          >
            Zaboravio si lozinku?
          </button>
        )}
      </div>
    </div>
  );
}
