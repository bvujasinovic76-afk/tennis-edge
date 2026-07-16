export type SurfaceRecord = { wins: number; losses: number; pct: number };

export type Player = {
  name: string;
  elo: number;
  matches: number;
  surfaceElo: Record<string, number>;
  atpRank: number | null;
  form: { wins: number; total: number }; // W in last `total` (≤10) matches
  surfaceRecord: Record<string, SurfaceRecord>;
};

export type Surface = "Hard" | "Clay" | "Grass";

/** Standard Elo expected-score formula. */
export function expectedProb(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** 50% overall Elo + 50% surface Elo — same blend used to build and backtest the ratings. */
export function blendedRating(player: Player, surface: Surface): number {
  const surfaceRating = player.surfaceElo[surface] ?? player.elo;
  return 0.5 * player.elo + 0.5 * surfaceRating;
}

/** Removes the bookmaker's overround from two decimal odds, returning true (de-vigged) probabilities. */
export function devig(oddsA: number, oddsB: number) {
  const impliedA = 1 / oddsA;
  const impliedB = 1 / oddsB;
  const overround = impliedA + impliedB;
  return {
    pA: impliedA / overround,
    pB: impliedB / overround,
    overroundPct: (overround - 1) * 100,
  };
}

export const EDGE_THRESHOLD_PCT = 2; // matches the backtest's flagging threshold

/**
 * Full Kelly stake as a fraction of bankroll: f* = (b*p - q) / b
 * b = net decimal odds (odds - 1), p = model win probability, q = 1 - p.
 * Negative results (no edge) clamp to 0 — Kelly never recommends betting against your own model.
 */
export function kellyFraction(modelProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const f = (b * modelProb - (1 - modelProb)) / b;
  return Math.max(0, f);
}
