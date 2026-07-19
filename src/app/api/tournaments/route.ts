import { NextRequest, NextResponse } from "next/server";
import type { WorldMatch } from "@/lib/sofascore";
import { fetchEnrichedWorldDay, type EnrichedWorldMatch } from "@/lib/worldEnrich";

const belgrade = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);

const ESPN_NOTE = "Prikaz preko ESPN rezerve — samo glavni ATP tur. Challengeri su trenutno nedostupni sa ovog servera (Sofascore blokira hosting).";

export async function GET(req: NextRequest) {
  const dateStr = req.nextUrl.searchParams.get("date") || belgrade(new Date());

  let enriched: EnrichedWorldMatch[];
  let source: "sofascore" | "espn";
  try {
    const r = await fetchEnrichedWorldDay(dateStr);
    enriched = r.matches;
    source = r.source;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Izvor nedostupan.", hint: "Svetski pregled (Sofascore) radi u lokalnoj verziji — hosting servera je blokiran od strane izvora." },
      { status: 502 }
    );
  }

  // Grupisanje po turniru — Grand Slam/Masters prvi, pa ATP, pa Challengeri.
  const order: Record<string, number> = { "Grand Slam": 0, Masters: 1, ATP: 2, Challenger: 3 };
  const byTournament = new Map<string, { tournament: string; tier: WorldMatch["tier"]; category: string; matches: EnrichedWorldMatch[] }>();
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
    source,
    note: source === "espn" ? ESPN_NOTE : undefined,
    groups,
  });
}
