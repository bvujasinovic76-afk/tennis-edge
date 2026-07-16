import type { PersonaId } from "./personas";

export type Stake = "none" | "low" | "medium" | "high";

export type PersonaResult = {
  id: PersonaId;
  name: string;
  model: string;
  pick: "A" | "B";
  confidence: number;
  stake: Stake;
  reasoning: string;
  error?: string;
};

export type JudgeScore = { persona: string; score: number; comment: string };
export type JudgeResult = { scores: JudgeScore[]; contradictions: string[]; error?: string };

export type FinalVerdict = {
  finalPick: "A" | "B";
  confidence: number;
  staking: Stake;
  keyFactors: string[];
  narrative: string;
  error?: string;
};

export type PredictRequest = {
  playerAName: string;
  playerBName: string;
  surface: "Hard" | "Clay" | "Grass";
  oddsA?: number;
  oddsB?: number;
};

export type PredictResponse = {
  playerA: string;
  playerB: string;
  personas: PersonaResult[];
  judge: JudgeResult;
  final: FinalVerdict;
};
