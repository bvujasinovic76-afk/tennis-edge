import type { Player, Surface } from "./elo";
import { blendedRating, expectedProb } from "./elo";

export type PlanPick = {
  matchId: number;
  tournament: string;
  startTime: string;
  surface: Surface;
  playerA: string;
  playerB: string;
  pick: string;
  opponent: string;
  modelProb: number;   // 0..1 — šansa da pick pobedi
  confidence: number;  // 0..1 — koliko se signali poklapaju
  tier: "visok" | "srednji";
  estOdds: number;     // PROCENA kvote (nemamo live kvote online)
  stake: number;       // predlog uloga (ravnomerno po tieru, ne Kelly — nema prave kvote)
  estProfit: number;   // approx dobitak ako prođe
  reasons: string[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Tipična ukupna marža kladionice na tenis 1/2 tržištu (~5%) — koristi se samo za PROCENU kvote. */
const MARGIN = 0.05;

function estimateOdds(prob: number): number {
  const fair = 1 / prob;
  return Math.max(1.01, Math.round(fair * (1 - MARGIN) * 100) / 100);
}

/**
 * Bira 3–5 parova za dan. Online nemamo kvote, pa ne možemo računati pravi edge —
 * zato biramo mečeve u kojima se NAŠI signali najjače poklapaju (model + rang + podloga + forma)
 * i predlažemo ravnomeran ulog po tieru. Kvota i dobitak su PROCENA dok ne uneseš pravu kvotu.
 */
export function selectDailyPicks(
  candidates: { matchId: number; tournament: string; startTime: string; surface: Surface; a: Player; b: Player }[],
  bankroll: number,
  maxPicks = 5
): PlanPick[] {
  const scored = candidates.map((c) => {
    const ra = blendedRating(c.a, c.surface);
    const rb = blendedRating(c.b, c.surface);
    const aIsFav = ra >= rb;
    const fav = aIsFav ? c.a : c.b;
    const dog = aIsFav ? c.b : c.a;
    const pFav = aIsFav ? expectedProb(ra, rb) : expectedProb(rb, ra);

    const reasons: string[] = [];

    // 1) Koliko je model siguran (sweet spot: jasan favorit, ali ne 95%+ gde kvota ništa ne plaća)
    const favComp = clamp01((pFav - 0.6) / 0.25) * (pFav > 0.92 ? 0.6 : 1);
    if (pFav >= 0.7) reasons.push(`model daje ${fav.name} ${Math.round(pFav * 100)}%`);

    // 2) Rang jaz
    let rankComp = 0.4;
    if (fav.atpRank != null && dog.atpRank != null) {
      const gap = dog.atpRank - fav.atpRank; // pozitivno = favorit bolje rangiran
      rankComp = clamp01(gap / 50);
      if (gap >= 30) reasons.push(`rang jaz ${gap} mesta`);
    }

    // 3) Dominacija na podlozi
    const sRec = fav.surfaceRecord?.[c.surface];
    let surfComp = 0.4;
    if (sRec && sRec.wins + sRec.losses >= 10) {
      surfComp = clamp01((sRec.pct - 60) / 25);
      if (sRec.pct >= 70) reasons.push(`${sRec.pct}% na ovoj podlozi`);
    }

    // 4) Forma favorita
    let formComp = 0.4;
    if ((fav.form?.total ?? 0) >= 5) {
      formComp = clamp01((fav.form.wins - 5) / 4);
      if (fav.form.wins >= 7) reasons.push(`forma ${fav.form.wins}-${fav.form.total - fav.form.wins}`);
    }

    const confidence = clamp01(0.4 * favComp + 0.2 * rankComp + 0.2 * surfComp + 0.2 * formComp);
    return { c, fav, dog, pFav, confidence, reasons };
  });

  return scored
    .filter((s) => s.confidence >= 0.45 && s.pFav >= 0.6)
    .sort((x, y) => y.confidence - x.confidence)
    .slice(0, maxPicks)
    .map((s) => {
      const tier: PlanPick["tier"] = s.confidence >= 0.65 ? "visok" : "srednji";
      const pctOfBankroll = tier === "visok" ? 0.02 : 0.0125;
      const stake = Math.max(0, Math.round((bankroll * pctOfBankroll) / 10) * 10);
      const estOdds = estimateOdds(s.pFav);
      return {
        matchId: s.c.matchId,
        tournament: s.c.tournament,
        startTime: s.c.startTime,
        surface: s.c.surface,
        playerA: s.c.a.name,
        playerB: s.c.b.name,
        pick: s.fav.name,
        opponent: s.dog.name,
        modelProb: s.pFav,
        confidence: s.confidence,
        tier,
        estOdds,
        stake,
        estProfit: Math.round(stake * (estOdds - 1)),
        reasons: s.reasons.slice(0, 3),
      };
    });
}
