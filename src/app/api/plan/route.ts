import { NextResponse } from "next/server";
import { fetchAtpFixtures, fetchEventOdds, type FixtureMatch } from "@/lib/sofascore";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";
import { blendedRating, devig, expectedProb, EDGE_THRESHOLD_PCT, type Surface } from "@/lib/elo";
import { DEFAULT_STATE, computeStats, suggestStake } from "@/lib/bankroll";
import { createClient } from "@/lib/supabase/server";
import { loadState } from "@/lib/bankrollDb";

function surfaceGuess(tournament: string): Surface {
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

export type PlanPlay = {
  matchId: number;
  matchLabel: string;
  tournament: string;
  round: string;
  startTime: string;
  surface: Surface;
  pick: string;
  opponent: string;
  modelProb: number;
  marketProb: number;
  odds: number;
  edgePct: number;
  recommendedStake: number;
  kellyPct: number;
};

export async function GET() {
  try {
    const { upcoming } = await fetchAtpFixtures();
    const index = buildPlayerIndex(players);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const state = user ? await loadState(supabase, user.id) : { ...DEFAULT_STATE, bets: [] };
    const stats = computeStats(state);

    const matched = upcoming
      .map((m) => ({ m, home: matchFullName(m.home.name, index), away: matchFullName(m.away.name, index) }))
      .filter((x) => x.home && x.away)
      .slice(0, 24); // cap odds requests

    const plays: PlanPlay[] = [];
    for (const { m, home, away } of matched) {
      const surface = surfaceGuess(m.tournament);
      const modelPHome = expectedProb(blendedRating(home!, surface), blendedRating(away!, surface));
      const odds = await fetchEventOdds(m.id);
      if (!odds) continue;

      const { pA: marketPHome, pB: marketPAway } = devig(odds.home, odds.away);
      const edgeHome = (modelPHome - marketPHome) * 100;
      const edgeAway = (1 - modelPHome - marketPAway) * 100;

      const pickHome = edgeHome >= edgeAway;
      const edgePct = pickHome ? edgeHome : edgeAway;
      if (edgePct <= EDGE_THRESHOLD_PCT) continue;

      const pickOdds = pickHome ? odds.home : odds.away;
      const pickProb = pickHome ? modelPHome : 1 - modelPHome;
      const marketProb = pickHome ? marketPHome : marketPAway;
      const stake = suggestStake(pickProb, pickOdds, stats.currentBankroll, state.kellyMultiplier);
      if (stake.stakeAmount <= 0) continue;

      plays.push({
        matchId: m.id,
        matchLabel: `${home!.name} vs ${away!.name} (${surface})`,
        tournament: m.tournament,
        round: m.round,
        startTime: m.startTime,
        surface,
        pick: pickHome ? home!.name : away!.name,
        opponent: pickHome ? away!.name : home!.name,
        modelProb: pickProb,
        marketProb,
        odds: pickOdds,
        edgePct,
        recommendedStake: stake.stakeAmount,
        kellyPct: stake.fractionUsed * 100,
      });
    }

    plays.sort((a, b) => b.edgePct - a.edgePct);

    return NextResponse.json({
      asOf: new Date().toISOString(),
      currency: state.currency,
      currentBankroll: stats.currentBankroll,
      kellyMultiplier: state.kellyMultiplier,
      totalMatchesScanned: upcoming.length,
      matchedWithModel: matched.length,
      plays,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Greška pri generisanju plana." }, { status: 502 });
  }
}
