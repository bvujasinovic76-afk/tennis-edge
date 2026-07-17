import { kellyFraction } from "./elo";

export type BetStatus = "pending" | "won" | "lost" | "void";

/** Jedan par unutar kombinacije. Kombinacija je JEDAN tiket: padne li jedan par, pada ceo tiket. */
export type BetLeg = {
  match: string;
  pick: string;
  odds: number;
  result?: "won" | "lost" | "pending";
};

export type Bet = {
  id: string;
  placedAt: string; // ISO
  matchLabel: string; // "Sinner J. vs Alcaraz C. (Hard)" ili "Kombinacija (3 para)"
  pick: string; // igrač na koga se igra (singl) ili sažetak kombinacije
  odds: number; // za kombinaciju: UKUPNA kvota (proizvod svih parova)
  stake: number; // ulog na CEO tiket (ne po paru)
  modelProb: number; // 0..1 — za kombinaciju: proizvod verovatnoća svih parova
  status: BetStatus;
  settledAt?: string;
  legs?: BetLeg[]; // prisutno samo za kombinacije (2+ para)
};

/** Ukupna kvota kombinacije = proizvod pojedinačnih kvota. */
export function combinedOdds(legs: { odds: number }[]): number {
  return Math.round(legs.reduce((acc, l) => acc * l.odds, 1) * 100) / 100;
}

/** Šansa da kombinacija prođe = proizvod verovatnoća (svi parovi moraju da prođu). */
export function combinedProb(probs: number[]): number {
  return probs.reduce((acc, p) => acc * p, 1);
}

export type BankrollState = {
  currency: string; // "RSD"
  startingBankroll: number;
  kellyMultiplier: number; // e.g. 0.25 = quarter Kelly
  bets: Bet[];
};

export const DEFAULT_STATE: BankrollState = {
  currency: "RSD",
  startingBankroll: 10000,
  kellyMultiplier: 0.25,
  bets: [],
};

/** Realized P/L of a single settled bet. Pending/void return 0. */
export function betPnl(bet: Bet): number {
  if (bet.status === "won") return bet.stake * (bet.odds - 1);
  if (bet.status === "lost") return -bet.stake;
  return 0; // pending or void
}

export type BankrollStats = {
  currency: string;
  startingBankroll: number;
  currentBankroll: number; // starting + realized P/L
  availableBankroll: number; // current - pending exposure
  pendingExposure: number; // sum of stakes on pending bets
  realizedPnl: number;
  roiPct: number; // realized P/L / total settled stake
  totalBets: number;
  settledBets: number;
  pendingBets: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalStakedSettled: number;
};

export function computeStats(state: BankrollState): BankrollStats {
  let realizedPnl = 0;
  let pendingExposure = 0;
  let totalStakedSettled = 0;
  let wins = 0;
  let losses = 0;
  let settledBets = 0;
  let pendingBets = 0;

  for (const bet of state.bets) {
    if (bet.status === "pending") {
      pendingExposure += bet.stake;
      pendingBets += 1;
    } else if (bet.status === "won" || bet.status === "lost") {
      realizedPnl += betPnl(bet);
      totalStakedSettled += bet.stake;
      settledBets += 1;
      if (bet.status === "won") wins += 1;
      else losses += 1;
    }
  }

  const currentBankroll = state.startingBankroll + realizedPnl;
  return {
    currency: state.currency,
    startingBankroll: state.startingBankroll,
    currentBankroll,
    availableBankroll: currentBankroll - pendingExposure,
    pendingExposure,
    realizedPnl,
    roiPct: totalStakedSettled > 0 ? (realizedPnl / totalStakedSettled) * 100 : 0,
    totalBets: state.bets.length,
    settledBets,
    pendingBets,
    wins,
    losses,
    winRatePct: settledBets > 0 ? (wins / settledBets) * 100 : 0,
    totalStakedSettled,
  };
}

export type StakeSuggestion = {
  kellyFractionFull: number; // full-Kelly fraction of bankroll (0..1)
  fractionUsed: number; // after kellyMultiplier
  stakeAmount: number; // rounded currency amount
  hasEdge: boolean;
};

/**
 * Recommends a stake off the CURRENT bankroll using fractional Kelly.
 * Full Kelly is aggressive and assumes a perfectly calibrated model; we scale by
 * state.kellyMultiplier (default 1/4) — standard practice to survive model error and variance.
 */
export function suggestStake(modelProb: number, odds: number, currentBankroll: number, kellyMultiplier: number): StakeSuggestion {
  const full = kellyFraction(modelProb, odds);
  const fractionUsed = full * kellyMultiplier;
  const raw = fractionUsed * currentBankroll;
  // round to nearest 10 currency units for clean tickets
  const stakeAmount = Math.max(0, Math.round(raw / 10) * 10);
  return { kellyFractionFull: full, fractionUsed, stakeAmount, hasEdge: full > 0 };
}
