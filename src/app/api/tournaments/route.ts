import { NextRequest, NextResponse } from "next/server";
import { fetchWorldDay, type WorldMatch } from "@/lib/sofascore";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";
import { blendedRating, expectedProb, type Surface } from "@/lib/elo";

function surfaceGuess(tournament: string): Surface {
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("nordea") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad") || t.includes("cordenons") || t.includes("pozoblanco") || t.includes("san marino") || t.includes("verona") || t.includes("todi") || t.includes("trieste")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

const belgrade = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);

type OutMatch = WorldMatch & {
  surface: Surface;
  homeElo: string | null; // naše ime iz baze ako je prepoznat
  awayElo: string | null;
  modelHomePct: number | null;
};

export async function GET(req: NextRequest) {
  const dateStr = req.nextUrl.searchParams.get("date") || belgrade(new Date());

  let matches: WorldMatch[];
  try {
    matches = await fetchWorldDay(dateStr);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Izvor nedostupan.", hint: "Svetski pregled (Sofascore) radi u lokalnoj verziji — hosting servera je blokiran od strane izvora." },
      { status: 502 }
    );
  }

  const index = buildPlayerIndex(players);
  const enriched: OutMatch[] = matches.map((m) => {
    const surface = surfaceGuess(m.tournament);
    const a = matchFullName(m.home.name, index);
    const b = matchFullName(m.away.name, index);
    let modelHomePct: number | null = null;
    if (a && b) {
      modelHomePct = Math.round(expectedProb(blendedRating(a, surface), blendedRating(b, surface)) * 100);
    }
    return { ...m, surface, homeElo: a?.name ?? null, awayElo: b?.name ?? null, modelHomePct };
  });

  // Grupisanje po turniru — Grand Slam/Masters prvi, pa ATP, pa Challengeri.
  const order: Record<string, number> = { "Grand Slam": 0, Masters: 1, ATP: 2, Challenger: 3 };
  const byTournament = new Map<string, { tournament: string; tier: WorldMatch["tier"]; category: string; matches: OutMatch[] }>();
  for (const m of enriched) {
    const g = byTournament.get(m.tournament) ?? { tournament: m.tournament, tier: m.tier, category: m.category, matches: [] };
    g.matches.push(m);
    byTournament.set(m.tournament, g);
  }
  const groups = [...byTournament.values()].sort((x, y) => order[x.tier] - order[y.tier] || x.tournament.localeCompare(y.tournament));

  return NextResponse.json({
    date: dateStr,
    totalMatches: enriched.length,
    totalTournaments: groups.length,
    live: enriched.filter((m) => m.statusType === "inprogress").length,
    groups,
  });
}
