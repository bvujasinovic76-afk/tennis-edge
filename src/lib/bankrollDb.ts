import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankrollState, Bet, BetLeg } from "./bankroll";

type BetRow = {
  id: string;
  placed_at: string;
  match_label: string;
  pick: string;
  odds: number | string;
  stake: number | string;
  model_prob: number | string;
  status: Bet["status"];
  settled_at: string | null;
  legs: BetLeg[] | null;
};

function mapBet(r: BetRow): Bet {
  return {
    id: r.id,
    placedAt: r.placed_at,
    matchLabel: r.match_label,
    pick: r.pick,
    odds: Number(r.odds),
    stake: Number(r.stake),
    modelProb: Number(r.model_prob),
    status: r.status,
    settledAt: r.settled_at ?? undefined,
    legs: Array.isArray(r.legs) && r.legs.length > 0 ? r.legs : undefined,
  };
}

/** Loads a user's bankroll settings + bets from Supabase into the shape the UI expects. */
export async function loadState(supabase: SupabaseClient, userId: string): Promise<BankrollState> {
  const [{ data: profile }, { data: bets }] = await Promise.all([
    supabase.from("profiles").select("currency, starting_bankroll, kelly_multiplier").eq("id", userId).maybeSingle(),
    supabase.from("bets").select("*").eq("user_id", userId).order("placed_at", { ascending: false }),
  ]);
  return {
    currency: profile?.currency ?? "RSD",
    startingBankroll: Number(profile?.starting_bankroll ?? 10000),
    kellyMultiplier: Number(profile?.kelly_multiplier ?? 0.25),
    bets: (bets ?? []).map(mapBet),
  };
}
