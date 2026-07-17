import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFixturesSmart } from "@/lib/fixturesSmart";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";
import { computeStats } from "@/lib/bankroll";
import { loadState } from "@/lib/bankrollDb";
import { buildTicketsOfDay } from "@/lib/ticketBuilder";
import type { Surface } from "@/lib/elo";

function surfaceGuess(tournament: string): Surface {
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("nordea") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

const belgrade = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });

  const dateStr = req.nextUrl.searchParams.get("date") || belgrade(new Date());

  let upcoming;
  try {
    ({ upcoming } = await fetchFixturesSmart());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feed nedostupan." }, { status: 502 });
  }

  const index = buildPlayerIndex(players);
  const matches = upcoming
    .filter((m) => belgrade(new Date(m.startTime)) === dateStr)
    .map((m) => {
      const a = matchFullName(m.home.name, index);
      const b = matchFullName(m.away.name, index);
      if (!a || !b) return null;
      return { matchId: m.id, tournament: m.tournament, startTime: m.startTime, surface: surfaceGuess(m.tournament), a, b };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const state = await loadState(supabase, user.id);
  const stats = computeStats(state);
  const { tickets, notes } = buildTicketsOfDay(matches, stats.currentBankroll);

  return NextResponse.json({
    date: dateStr,
    currency: state.currency,
    bankroll: stats.currentBankroll,
    matchesAvailable: matches.length,
    tickets,
    notes,
  });
}
