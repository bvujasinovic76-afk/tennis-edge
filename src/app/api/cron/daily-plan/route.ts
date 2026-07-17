import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { fetchFixturesSmart } from "@/lib/fixturesSmart";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";
import { computeStats, type Bet } from "@/lib/bankroll";
import { selectDailyPicks } from "@/lib/dailyPlan";
import type { Surface } from "@/lib/elo";

function surfaceGuess(tournament: string): Surface {
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("nordea") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

const belgrade = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);

/**
 * Vercel cron (09:00 po Beogradu): unapred napravi današnji listić za svakog korisnika,
 * da plan čeka spreman kad otvoriš app. Ako cron ne prođe, plan se svejedno pravi lenjo
 * pri prvom otvaranju tog dana — ovo je samo da bude gotov ranije.
 */
export async function GET(req: NextRequest) {
  // Vercel cron šalje Authorization: Bearer $CRON_SECRET kad je secret podešen.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neautorizovano." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase nije konfigurisan." }, { status: 503 });
  const sb = createServiceClient(url, key, { auth: { persistSession: false } });

  const today = belgrade(new Date());

  let upcoming;
  try {
    ({ upcoming } = await fetchFixturesSmart());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feed nedostupan." }, { status: 502 });
  }

  const index = buildPlayerIndex(players);
  const candidates = upcoming
    .filter((m) => belgrade(new Date(m.startTime)) === today)
    .map((m) => {
      const a = matchFullName(m.home.name, index);
      const b = matchFullName(m.away.name, index);
      if (!a || !b) return null;
      return { matchId: m.id, tournament: m.tournament, startTime: m.startTime, surface: surfaceGuess(m.tournament), a, b };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const { data: profiles } = await sb.from("profiles").select("id, starting_bankroll");
  let created = 0;

  for (const p of profiles ?? []) {
    const { data: existing } = await sb.from("daily_plans").select("id").eq("user_id", p.id).eq("plan_date", today).maybeSingle();
    if (existing) continue;

    // Bankroll korisnika = start + realizovani P/L (isti račun kao u aplikaciji).
    const { data: bets } = await sb.from("bets").select("odds, stake, status").eq("user_id", p.id);
    const asBets = (bets ?? []).map((b) => ({ odds: Number(b.odds), stake: Number(b.stake), status: b.status })) as Bet[];
    const stats = computeStats({ currency: "RSD", startingBankroll: Number(p.starting_bankroll), kellyMultiplier: 0.25, bets: asBets });

    const picks = selectDailyPicks(candidates, stats.currentBankroll);
    await sb.from("daily_plans").upsert(
      { user_id: p.id, plan_date: today, picks, bankroll_at_gen: stats.currentBankroll, generated_at: new Date().toISOString() },
      { onConflict: "user_id,plan_date" }
    );
    created += 1;
  }

  return NextResponse.json({ date: today, candidates: candidates.length, plansCreated: created });
}
