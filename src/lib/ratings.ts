import raw from "../../data/elo_ratings.json";
import type { Player } from "./elo";

export type RatingsData = {
  generatedFrom: string;
  matchesUsed: number;
  dateRange: [string, string];
  eloModel: { kFactor: number; baseRating: number; blend: string };
  backtest: {
    windowStart: string;
    windowEnd: string;
    matchesTested: number;
    favoriteAccuracyPct: number;
    avgLogLoss: number;
    edgeThresholdPct: number;
    valueBetsFlagged: number;
    roiPct: number;
    referenceOdds: string;
  };
  players: Player[];
};

export const ratings = raw as unknown as RatingsData;
export const players: Player[] = ratings.players;
