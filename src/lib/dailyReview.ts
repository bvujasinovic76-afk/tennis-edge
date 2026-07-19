import type { Surface } from "./elo";
import { marketsForMatch, type MarketId } from "./markets";
import type { EnrichedWorldMatch } from "./worldEnrich";

/**
 * Dnevna retro-analiza: za svaki ZAVRŠEN meč (gde su oba igrača u našoj bazi) proverimo
 * kako bi prošao svaki tip igre — 1/2, favorit/autsajder uzima set, preko/ispod 21.5 gemova —
 * pa vidimo koja igra je taj dan stvarno najviše prolazila i koje kombinacije bi prošle.
 * Nisu procene: čita se stvarni rezultat po setovima.
 */

export const MARKET_LABEL: Record<MarketId, string> = {
  win: "Favorit pobeđuje (1/2)",
  favset: "Favorit uzima bar set",
  dogset: "Autsajder uzima bar set",
  over215: "Preko 21.5 gemova",
  under215: "Ispod 21.5 gemova",
};

export type EvaluatedMatch = {
  tournament: string;
  tier: string;
  surface: Surface;
  favName: string;
  dogName: string;
  pFav: number; // model šansa favorita (0.5–1)
  outcomes: Partial<Record<MarketId, boolean>>; // true = tip bi prošao
  safestId: MarketId;
  estOdds: Record<MarketId, number>;
  histPct: Record<MarketId, number>;
};

export type MarketAgg = {
  id: MarketId;
  label: string;
  hits: number;
  total: number;
  pct: number; // stvarna prolaznost tog dana
  histPct: number; // prosečna istorijska prolaznost za iste mečeve (poređenje)
};

export type ComboRetro = {
  title: string;
  legs: { text: string; hit: boolean }[];
  passed: boolean;
  estOdds: number;
};

const RETIRED_RE = /(retired|walkover|w\.o\.|abandoned)/i;

/** Kompletni setovi iz rezultata (6:4, 7:6…); prekinuti set (npr. 3:1) se ne broji. */
function readSets(m: EnrichedWorldMatch, favIsHome: boolean) {
  if (!m.score) return null;
  const h = m.score.home, a = m.score.away;
  let favSets = 0, dogSets = 0, games = 0, sets = 0;
  for (const k of ["period1", "period2", "period3"] as const) {
    const hv = h[k], av = a[k];
    if (hv == null || av == null) continue;
    const winnerGames = Math.max(hv, av);
    if (winnerGames < 6 || hv === av) continue; // nedovršen set
    sets += 1;
    games += hv + av;
    const homeWonSet = hv > av;
    if (homeWonSet === favIsHome) favSets += 1;
    else dogSets += 1;
  }
  return sets >= 2 ? { favSets, dogSets, games, sets } : null;
}

/** Evaluira sve završene mečeve dana na kojima je model uopšte birao. */
export function evaluateDay(matches: EnrichedWorldMatch[]): EvaluatedMatch[] {
  const out: EvaluatedMatch[] = [];
  for (const m of matches) {
    if (m.statusType !== "finished" || m.winner == null || m.modelHomePct == null) continue;
    if (!m.homeElo || !m.awayElo) continue;
    if (RETIRED_RE.test(m.status)) continue; // predaje/w.o. — kladionice različito tretiraju, izostavljamo pošteno

    const pHome = m.modelHomePct / 100;
    const favIsHome = pHome >= 0.5;
    const pFav = favIsHome ? pHome : 1 - pHome;
    const favName = favIsHome ? m.homeElo : m.awayElo;
    const dogName = favIsHome ? m.awayElo : m.homeElo;

    const options = marketsForMatch(pFav, favName, dogName);
    const estOdds = {} as Record<MarketId, number>;
    const histPct = {} as Record<MarketId, number>;
    for (const o of options) {
      estOdds[o.id] = o.estOdds;
      histPct[o.id] = o.passPct;
    }

    const outcomes: Partial<Record<MarketId, boolean>> = {
      win: (m.winner === "home") === favIsHome,
    };
    const sets = readSets(m, favIsHome);
    if (sets) {
      outcomes.favset = sets.favSets >= 1;
      outcomes.dogset = sets.dogSets >= 1;
      outcomes.over215 = sets.games > 21.5;
      outcomes.under215 = sets.games < 21.5;
    }

    out.push({
      tournament: m.tournament,
      tier: m.tier,
      surface: m.surface,
      favName,
      dogName,
      pFav,
      outcomes,
      safestId: options[0].id,
      estOdds,
      histPct,
    });
  }
  return out;
}

/** Prolaznost po tipu igre za ceo dan, sortirano od najprolaznije. */
export function aggregateMarkets(evaluated: EvaluatedMatch[]): MarketAgg[] {
  const ids = Object.keys(MARKET_LABEL) as MarketId[];
  const rows: MarketAgg[] = [];
  for (const id of ids) {
    const withOutcome = evaluated.filter((e) => e.outcomes[id] != null);
    if (withOutcome.length === 0) continue;
    const hits = withOutcome.filter((e) => e.outcomes[id]).length;
    const histAvg = withOutcome.reduce((s, e) => s + e.histPct[id], 0) / withOutcome.length;
    rows.push({
      id,
      label: MARKET_LABEL[id],
      hits,
      total: withOutcome.length,
      pct: Math.round((hits / withOutcome.length) * 100),
      histPct: Math.round(histAvg),
    });
  }
  return rows.sort((a, b) => b.pct - a.pct || b.total - a.total);
}

function comboFrom(title: string, legs: { e: EvaluatedMatch; id: MarketId }[]): ComboRetro | null {
  if (legs.length === 0) return null;
  const legRows = legs.map(({ e, id }) => ({
    text: id === "win" ? e.favName
      : id === "favset" ? `${e.favName} uzima set`
      : id === "dogset" ? `${e.dogName} uzima set`
      : id === "over215" ? `${e.favName}–${e.dogName} preko 21.5`
      : `${e.favName}–${e.dogName} ispod 21.5`,
    hit: e.outcomes[id] === true,
  }));
  const estOdds = legs.reduce((s, { e, id }) => s * e.estOdds[id], 1);
  return { title, legs: legRows, passed: legRows.every((l) => l.hit), estOdds: Math.round(estOdds * 100) / 100 };
}

/**
 * "Da si juče igrao ovako" — iste najjače parove ukrstimo kroz različite igre,
 * pa se vidi koja kombinacija bi stvarno prošla i po kojoj kvoti.
 */
export function retroCombos(evaluated: EvaluatedMatch[]): ComboRetro[] {
  const byConfidence = [...evaluated].sort((a, b) => b.pFav - a.pFav);
  const withSets = byConfidence.filter((e) => e.outcomes.favset != null);
  const combos: (ComboRetro | null)[] = [];

  const top3 = byConfidence.slice(0, 3);
  if (top3.length === 3) {
    combos.push(comboFrom("3 najjača favorita — na pobedu (1/2)", top3.map((e) => ({ e, id: "win" as MarketId }))));
  }
  const top3Sets = withSets.slice(0, 3);
  if (top3Sets.length === 3) {
    combos.push(comboFrom("Ista 3 favorita — svaki uzima bar set", top3Sets.map((e) => ({ e, id: "favset" as MarketId }))));
  }
  const top5Sets = withSets.slice(0, 5);
  if (top5Sets.length === 5) {
    combos.push(comboFrom("5 favorita — svaki uzima bar set", top5Sets.map((e) => ({ e, id: "favset" as MarketId }))));
  }
  const top4Mix = byConfidence.filter((e) => e.outcomes[e.safestId] != null).slice(0, 4);
  if (top4Mix.length >= 3) {
    combos.push(comboFrom("Miks — najsigurniji tip svakog meča", top4Mix.map((e) => ({ e, id: e.safestId }))));
  }

  return combos.filter((c): c is ComboRetro => c != null);
}
