import { NextRequest, NextResponse } from "next/server";
import { fetchEnrichedWorldDay, type EnrichedWorldMatch } from "@/lib/worldEnrich";
import { evaluateDay, aggregateMarkets, retroCombos } from "@/lib/dailyReview";
import { safestMarket } from "@/lib/markets";
import { tournamentWeather, conditionNotes, type TournamentWeather } from "@/lib/conditions";
import { players } from "@/lib/ratings";
import type { Player, Surface } from "@/lib/elo";

const belgrade = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade" }).format(d);

type PlayerFit = { name: string; pct: number };
type TournamentReview = {
  tournament: string;
  tier: string;
  surface: Surface;
  // retro (završeni mečevi)
  winHits: number;
  winTotal: number;
  safeHits: number;
  safeTotal: number;
  // unapred (mečevi koji tek dolaze taj dan)
  upcomingKnown: number;
  expectedSafePct: number | null; // prosečna istorijska prolaznost najsigurnijeg tipa
  // uslovi i igrači
  weather: TournamentWeather | null;
  notes: string[];
  suits: PlayerFit[]; // kome podloga prija (visok % pobeda na njoj)
  suitsNot: PlayerFit[]; // kome ne prija
};

const MIN_SURFACE_MATCHES = 10;

function playerFits(names: string[], surface: Surface, byName: Map<string, Player>) {
  const suits: PlayerFit[] = [];
  const suitsNot: PlayerFit[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    const p = byName.get(n);
    const rec = p?.surfaceRecord?.[surface];
    if (!rec || rec.wins + rec.losses < MIN_SURFACE_MATCHES) continue;
    if (rec.pct >= 62) suits.push({ name: n, pct: Math.round(rec.pct) });
    else if (rec.pct <= 42) suitsNot.push({ name: n, pct: Math.round(rec.pct) });
  }
  suits.sort((a, b) => b.pct - a.pct);
  suitsNot.sort((a, b) => a.pct - b.pct);
  return { suits: suits.slice(0, 3), suitsNot: suitsNot.slice(0, 3) };
}

export async function GET(req: NextRequest) {
  const dateStr = req.nextUrl.searchParams.get("date") || belgrade(new Date());

  let matches: EnrichedWorldMatch[];
  try {
    matches = await fetchEnrichedWorldDay(dateStr);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Izvor nedostupan.", hint: "Dnevna analiza koristi isti izvor rezultata kao svetski pregled — trenutno nedostupan sa ovog servera." },
      { status: 502 }
    );
  }

  const evaluated = evaluateDay(matches);
  const markets = aggregateMarkets(evaluated);
  const combos = retroCombos(evaluated);

  // --- po turnirima: retro pogoci + očekivanja + igrači kojima uslovi prijaju ---
  const byName = new Map(players.map((p) => [p.name, p]));
  const byT = new Map<string, TournamentReview>();

  for (const m of matches) {
    let t = byT.get(m.tournament);
    if (!t) {
      t = { tournament: m.tournament, tier: m.tier, surface: m.surface, winHits: 0, winTotal: 0, safeHits: 0, safeTotal: 0, upcomingKnown: 0, expectedSafePct: null, weather: null, notes: [], suits: [], suitsNot: [] };
      byT.set(m.tournament, t);
    }
    if (m.statusType === "notstarted" && m.modelHomePct != null && m.homeElo && m.awayElo) {
      t.upcomingKnown += 1;
      const pHome = m.modelHomePct / 100;
      const pFav = Math.max(pHome, 1 - pHome);
      const fav = pHome >= 0.5 ? m.homeElo : m.awayElo;
      const dog = pHome >= 0.5 ? m.awayElo : m.homeElo;
      const safe = safestMarket(pFav, fav, dog);
      t.expectedSafePct = t.expectedSafePct == null ? safe.passPct : t.expectedSafePct + safe.passPct; // zbir, prosek posle
    }
  }
  for (const e of evaluated) {
    const t = byT.get(e.tournament);
    if (!t) continue;
    if (e.outcomes.win != null) {
      t.winTotal += 1;
      if (e.outcomes.win) t.winHits += 1;
    }
    if (e.outcomes[e.safestId] != null) {
      t.safeTotal += 1;
      if (e.outcomes[e.safestId]) t.safeHits += 1;
    }
  }
  for (const t of byT.values()) {
    if (t.upcomingKnown > 0 && t.expectedSafePct != null) t.expectedSafePct = Math.round(t.expectedSafePct / t.upcomingKnown);
    const names = matches.filter((m) => m.tournament === t.tournament).flatMap((m) => [m.homeElo, m.awayElo]).filter((n): n is string => n != null);
    const fits = playerFits(names, t.surface, byName);
    t.suits = fits.suits;
    t.suitsNot = fits.suitsNot;
  }

  // Vreme povlačimo samo za turnire gde model ima šta da kaže (poznati igrači), max 14 gradova.
  const relevant = [...byT.values()]
    .filter((t) => t.winTotal > 0 || t.upcomingKnown > 0)
    .sort((a, b) => b.winTotal + b.upcomingKnown - (a.winTotal + a.upcomingKnown))
    .slice(0, 14);
  await Promise.all(
    relevant.map(async (t) => {
      t.weather = await tournamentWeather(t.tournament, dateStr);
      t.notes = conditionNotes(t.surface, t.weather);
    })
  );

  // Rang: prvo stvarni pogoci najsigurnijeg tipa — Laplace ((h+1)/(n+2)) da 1/1 ne preskoči 5/6 — pa očekivana prolaznost.
  const tournaments = relevant.sort((a, b) => {
    const aReal = a.safeTotal > 0 ? (a.safeHits + 1) / (a.safeTotal + 2) : -1;
    const bReal = b.safeTotal > 0 ? (b.safeHits + 1) / (b.safeTotal + 2) : -1;
    if (aReal !== bReal) return bReal - aReal;
    return (b.expectedSafePct ?? 0) - (a.expectedSafePct ?? 0);
  });

  return NextResponse.json({
    date: dateStr,
    evaluatedCount: evaluated.length,
    markets,
    combos,
    tournaments,
  });
}
