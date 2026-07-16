import { NextResponse } from "next/server";
import { fetchAtpFixtures, type FixtureMatch } from "@/lib/sofascore";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";
import { blendedRating, expectedProb, type Surface } from "@/lib/elo";

function surfaceGuess(tournament: string): Surface {
  // Sofascore doesn't expose surface on this endpoint tier — infer conservatively; "Hard" is the ATP modal surface.
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

function enrich(m: FixtureMatch, index: ReturnType<typeof buildPlayerIndex>) {
  const homeMatch = matchFullName(m.home.name, index);
  const awayMatch = matchFullName(m.away.name, index);
  let model: { homeWinPct: number; awayWinPct: number; surfaceUsed: Surface } | null = null;
  if (homeMatch && awayMatch) {
    const surface = surfaceGuess(m.tournament);
    const ra = blendedRating(homeMatch, surface);
    const rb = blendedRating(awayMatch, surface);
    const p = expectedProb(ra, rb);
    model = { homeWinPct: Math.round(p * 1000) / 10, awayWinPct: Math.round((1 - p) * 1000) / 10, surfaceUsed: surface };
  }
  return {
    ...m,
    home: { ...m.home, eloName: homeMatch?.name ?? null, elo: homeMatch?.elo ?? null },
    away: { ...m.away, eloName: awayMatch?.name ?? null, elo: awayMatch?.elo ?? null },
    model,
  };
}

export async function GET() {
  try {
    const { live, upcoming, fromCache } = await fetchAtpFixtures();
    const index = buildPlayerIndex(players);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      fromCache,
      live: live.map((m) => enrich(m, index)),
      upcoming: upcoming.map((m) => enrich(m, index)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Nepoznata greška pri dohvatanju mečeva." },
      { status: 502 }
    );
  }
}
