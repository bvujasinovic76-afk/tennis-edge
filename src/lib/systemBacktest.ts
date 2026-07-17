import raw from "../../data/system_backtest.json";

export type SystemResult = {
  name: string;
  kind: "singl" | "kombo";
  legs: number;
  finalBankroll: number;
  pnl: number;
  roiPct: number;
  tickets: number;
  wins: number;
  winRatePct: number;
  maxDrawdownPct: number;
  worstLosingStreak: number;
  totalStaked: number;
  curve: number[];
};

export type SystemBacktest = {
  window: { start: string; end: string; days: number };
  startBankroll: number;
  dailyRiskPct: number;
  minProb: number;
  picksTested: number;
  systems: SystemResult[];
  bestByRoi: string;
};

export const systemBacktest = raw as unknown as SystemBacktest;
