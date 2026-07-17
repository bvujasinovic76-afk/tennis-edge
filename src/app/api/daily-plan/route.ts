import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEspnFixtures } from "@/lib/espn";
import { fetchFixturesSmart } from "@/lib/fixturesSmart";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";
import { computeStats } from "@/lib/bankroll";
import { loadState } from "@/lib/bankrollDb";
import { selectDailyPicks, type PlanPick } from "@/lib/dailyPlan";
import type { Surface } from "@/lib/elo";

function surfaceGuess(tournament: string): Surface {
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("nordea") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

/** Beogradski dan (UTC+2 leti) — plan se vezuje za lokalni datum, ne UTC. */
function belgradeDate(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);
}

const MIN_PICKS = 5;

/**
 * Za listić nam treba raspored kroz VIŠE dana — ESPN ga daje (i lokalno i na hostingu),
 * dok Sofascore vraća samo par najbližih mečeva. Sofascore ostaje fallback.
 */
async function fetchSchedule() {
  try {
    const { upcoming } = await fetchEspnFixtures();
    if (upcoming.length > 0) return upcoming;
  } catch {
    /* pada na fallback ispod */
  }
  const { upcoming } = await fetchFixturesSmart();
  return upcoming;
}

async function buildPicksFor(dateStr: string, bankroll: number): Promise<PlanPick[]> {
  const upcoming = await fetchSchedule();
  const index = buildPlayerIndex(players);
  const day = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(new Date(iso));

  const mapped = upcoming
    .map((m) => {
      const a = matchFullName(m.home.name, index);
      const b = matchFullName(m.away.name, index);
      if (!a || !b) return null;
      return { matchId: m.id, tournament: m.tournament, startTime: m.startTime, surface: surfaceGuess(m.tournament), a, b };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((x, y) => new Date(x.startTime).getTime() - new Date(y.startTime).getTime());

  const sameDay = mapped.filter((m) => day(m.startTime) === dateStr);
  let picks = selectDailyPicks(sameDay, bankroll, MIN_PICKS);

  // Kad taj dan nema dovoljno mečeva (kasno je ili je slab raspored), dopuni iz narednih dana —
  // UI prikazuje datum uz svaki pick, tako da se uvek zna šta je za kada.
  if (picks.length < MIN_PICKS) {
    const later = mapped.filter((m) => day(m.startTime) > dateStr);
    const fill = selectDailyPicks(later, bankroll, MIN_PICKS - picks.length);
    picks = [...picks, ...fill];
  }
  return picks;
}

/** GET ?date=YYYY-MM-DD — vrati sačuvan plan za dan; ako ga nema i dan je danas/sutra, generiši i zaključaj. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });

  const dateStr = req.nextUrl.searchParams.get("date") || belgradeDate();
  const today = belgradeDate();
  const isPast = dateStr < today;

  const { data: existing } = await supabase
    .from("daily_plans")
    .select("plan_date, generated_at, bankroll_at_gen, picks")
    .eq("user_id", user.id)
    .eq("plan_date", dateStr)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ date: dateStr, locked: true, generatedAt: existing.generated_at, bankrollAtGen: Number(existing.bankroll_at_gen), picks: existing.picks });
  }
  if (isPast) {
    return NextResponse.json({ date: dateStr, locked: false, picks: [], message: "Za taj dan nije sačuvan plan." });
  }

  // Nema plana — generiši i zaključaj za taj dan.
  const state = await loadState(supabase, user.id);
  const stats = computeStats(state);
  let picks: PlanPick[] = [];
  try {
    picks = await buildPicksFor(dateStr, stats.currentBankroll);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feed mečeva nedostupan." }, { status: 502 });
  }

  const { data: saved } = await supabase
    .from("daily_plans")
    .upsert({ user_id: user.id, plan_date: dateStr, picks, bankroll_at_gen: stats.currentBankroll, generated_at: new Date().toISOString() }, { onConflict: "user_id,plan_date" })
    .select("generated_at")
    .maybeSingle();

  return NextResponse.json({ date: dateStr, locked: true, generatedAt: saved?.generated_at ?? new Date().toISOString(), bankrollAtGen: stats.currentBankroll, picks });
}

/** POST — ručno regenerisanje plana za dan (npr. posle promene bankrolla). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });

  let body: { date?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* prazno telo je ok */
  }
  const dateStr = body.date || belgradeDate();

  const state = await loadState(supabase, user.id);
  const stats = computeStats(state);
  let picks: PlanPick[];
  try {
    picks = await buildPicksFor(dateStr, stats.currentBankroll);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feed mečeva nedostupan." }, { status: 502 });
  }

  await supabase
    .from("daily_plans")
    .upsert({ user_id: user.id, plan_date: dateStr, picks, bankroll_at_gen: stats.currentBankroll, generated_at: new Date().toISOString() }, { onConflict: "user_id,plan_date" });

  return NextResponse.json({ date: dateStr, locked: true, generatedAt: new Date().toISOString(), bankrollAtGen: stats.currentBankroll, picks });
}
