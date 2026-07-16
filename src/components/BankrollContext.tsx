"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { BankrollState, BankrollStats, Bet } from "@/lib/bankroll";

type Payload = { state: BankrollState; stats: BankrollStats };

type BankrollContextValue = {
  state: BankrollState | null;
  stats: BankrollStats | null;
  loading: boolean;
  authed: boolean;
  refresh: () => Promise<void>;
  setBankroll: (startingBankroll: number, kellyMultiplier?: number) => Promise<void>;
  placeBet: (bet: Pick<Bet, "matchLabel" | "pick" | "odds" | "stake" | "modelProb">) => Promise<void>;
  settleBet: (id: string, status: "won" | "lost" | "void") => Promise<void>;
  deleteBet: (id: string) => Promise<void>;
  reset: () => Promise<void>;
};

const Ctx = createContext<BankrollContextValue | null>(null);

async function post(body: Record<string, unknown>): Promise<Payload> {
  const res = await fetch("/api/bankroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function BankrollProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bankroll");
      if (res.status === 401) {
        setAuthed(false);
        setPayload(null);
        return;
      }
      const json = await res.json();
      if (res.ok) {
        setPayload(json);
        setAuthed(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Writing a bet while logged out sends the user to login instead of silently failing.
  function requireAuth(): boolean {
    if (!authed) {
      if (typeof window !== "undefined") window.location.href = "/login";
      return false;
    }
    return true;
  }

  const value: BankrollContextValue = {
    state: payload?.state ?? null,
    stats: payload?.stats ?? null,
    loading,
    authed,
    refresh,
    setBankroll: async (startingBankroll, kellyMultiplier) => {
      if (!requireAuth()) return;
      setPayload(await post({ action: "setBankroll", startingBankroll, kellyMultiplier }));
    },
    placeBet: async (bet) => {
      if (!requireAuth()) return;
      setPayload(await post({ action: "addBet", ...bet }));
    },
    settleBet: async (id, status) => setPayload(await post({ action: "settleBet", id, status })),
    deleteBet: async (id) => setPayload(await post({ action: "deleteBet", id })),
    reset: async () => setPayload(await post({ action: "reset" })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBankroll(): BankrollContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBankroll must be used within BankrollProvider");
  return ctx;
}

export function formatMoney(amount: number, currency: string): string {
  return `${Math.round(amount).toLocaleString("sr-RS")} ${currency}`;
}
