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
  eloV2?: {
    features: string[];
    coefficients: Record<string, number>;
    backtest: {
      windowStart: string;
      windowEnd: string;
      matchesTested: number;
      favoriteAccuracyPct: number;
      avgLogLoss: number;
      valueBetsFlagged: number;
      roiPct: number;
    };
  };
  h2h?: Record<string, [number, number]>;
  players: Player[];
};

export const ratings = raw as unknown as RatingsData;
export const players: Player[] = ratings.players;
