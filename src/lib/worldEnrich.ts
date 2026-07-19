import { fetchWorldDay, type WorldMatch } from "./sofascore";
import { buildPlayerIndex, matchAnyName } from "./nameMatch";
import { players } from "./ratings";
import { blendedRating, devig, expectedProb, type Surface } from "./elo";

/** Gruba procena podloge iz imena turnira — dovoljno za sezonski raspored. */
export function surfaceGuess(tournament: string): Surface {
  const t = tournament.toLowerCase();
  if (t.includes("roland") || t.includes("madrid") || t.includes("rome") || t.includes("monte carlo") || t.includes("hamburg") || t.includes("bastad") || t.includes("nordea") || t.includes("umag") || t.includes("kitzbuhel") || t.includes("gstaad") || t.includes("cordenons") || t.includes("pozoblanco") || t.includes("san marino") || t.includes("verona") || t.includes("todi") || t.includes("trieste") || t.includes("estoril") || t.includes("tampere") || t.includes("zug") || t.includes("bunschoten") || t.includes("amersfoort") || t.includes("segovia") || t.includes("liberec")) return "Clay";
  if (t.includes("wimbledon") || t.includes("halle") || t.includes("queen") || t.includes("newport") || t.includes("eastbourne")) return "Grass";
  return "Hard";
}

export type EnrichedWorldMatch = WorldMatch & {
  surface: Surface;
  homeElo: string | null; // naše ime iz baze ako je igrač prepoznat
  awayElo: string | null;
  modelHomePct: number | null;
  probSource: "elo" | "kvote" | null; // odakle je šansa: naš model ili kvote kladionica (de-vig)
};

/** Dodaje podlogu, prepoznata imena iz Elo baze i šansu (model, ili kvote kad igrača nema u bazi). */
export function enrichWorld(matches: WorldMatch[]): EnrichedWorldMatch[] {
  const index = buildPlayerIndex(players);
  return matches.map((m) => {
    const surface = surfaceGuess(m.tournament);
    const a = matchAnyName(m.home.name, index);
    const b = matchAnyName(m.away.name, index);
    let modelHomePct: number | null = null;
    let probSource: EnrichedWorldMatch["probSource"] = null;
    if (a && b) {
      modelHomePct = Math.round(expectedProb(blendedRating(a, surface), blendedRating(b, surface)) * 100);
      probSource = "elo";
    } else if (m.odds && m.odds.home > 1 && m.odds.away > 1) {
      modelHomePct = Math.round(devig(m.odds.home, m.odds.away).pA * 100);
      probSource = "kvote";
    }
    return { ...m, surface, homeElo: a?.name ?? null, awayElo: b?.name ?? null, modelHomePct, probSource };
  });
}

/** Normalizovano prezime ("Maximus Hulme" i "Hulme M." -> "hulme"). */
function lastNameKey(n: string): string {
  return n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/(\s+[a-z]\.)+$/, "")
    .trim().split(/\s+/).pop() ?? "";
}

/** Prenese TennisExplorer kvote na Sofascore mečeve (lokalna putanja) da i tamo bude predloga. */
function mergeTeOdds(matches: WorldMatch[], te: WorldMatch[]): void {
  const byKey = new Map<string, { home: number; away: number; homeLast: string }>();
  for (const t of te) {
    if (!t.odds) continue;
    const key = [lastNameKey(t.home.name), lastNameKey(t.away.name)].sort().join("|");
    byKey.set(key, { ...t.odds, homeLast: lastNameKey(t.home.name) });
  }
  for (const m of matches) {
    if (m.odds) continue;
    const key = [lastNameKey(m.home.name), lastNameKey(m.away.name)].sort().join("|");
    const hit = byKey.get(key);
    if (!hit) continue;
    // Isti par može biti obrnut između izvora — poravnaj strane po prezimenu domaćeg.
    m.odds = lastNameKey(m.home.name) === hit.homeLast ? { home: hit.home, away: hit.away } : { home: hit.away, away: hit.home };
  }
}

export type WorldDayResult = {
  matches: EnrichedWorldMatch[];
  source: "sofascore" | "espn" | "espn+te" | "te";
};

/**
 * Sofascore prvo (pun program: ATP + Challenger). Kad je blokiran (Vercel/datacentar):
 * ESPN za glavni ATP tur + TennisExplorer za challengere — zajedno skoro pun program.
 */
export async function fetchEnrichedWorldDay(dateStr: string): Promise<WorldDayResult> {
  try {
    const sofa = await fetchWorldDay(dateStr);
    // TE kvote dopunjuju i lokalni prikaz (predlozi za igrače van Elo baze); sme da padne.
    try {
      const { fetchTeChallengerDay } = await import("./tennisExplorer");
      mergeTeOdds(sofa, await fetchTeChallengerDay(dateStr));
    } catch {}
    return { matches: enrichWorld(sofa), source: "sofascore" };
  } catch (sofaErr) {
    const [{ fetchEspnWorldDay }, { fetchTeChallengerDay }] = await Promise.all([import("./espn"), import("./tennisExplorer")]);
    const [espnRes, teRes] = await Promise.allSettled([fetchEspnWorldDay(dateStr), fetchTeChallengerDay(dateStr)]);
    const espn = espnRes.status === "fulfilled" ? espnRes.value : [];
    const te = teRes.status === "fulfilled" ? teRes.value : [];
    const all = [...espn, ...te];
    if (all.length === 0) throw sofaErr; // originalna poruka je korisnija od rezervnih grešaka
    const source = te.length > 0 ? (espn.length > 0 ? "espn+te" : "te") : "espn";
    return { matches: enrichWorld(all), source };
  }
}
