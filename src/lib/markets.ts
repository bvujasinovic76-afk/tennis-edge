import raw from "../../data/market_stats.json";

// Tipovi (marketi) sa STVARNOM istorijskom prolaznošću — izračunato iz ~9.500 Bo3
// mečeva, grupisano po jačini favorita po našem modelu. Nisu procene, nego frekvencije.

type Band = {
  lo: number;
  hi: number;
  n: number;
  favWinPct: number;
  favSetPct: number;
  dogSetPct: number;
  over215Pct: number;
  over225Pct: number;
  avgGames: number;
};

const BANDS = (raw as { bands: Band[] }).bands;

// Marže za procenu kvote: sporedni tipovi nose veću maržu od 1/2.
const MARGIN_MAIN = 0.05;
const MARGIN_SIDE = 0.08;

export type MarketId = "win" | "favset" | "dogset" | "over215" | "under215";

export type MarketOption = {
  id: MarketId;
  label: string; // sa imenom igrača
  pickText: string; // šta se upisuje u tiket
  passPct: number; // stvarna istorijska prolaznost
  estOdds: number; // procena kvote (fer minus marža)
  sample: number; // koliko mečeva stoji iza broja
  safest: boolean;
};

function bandFor(pFav: number): Band {
  const p = Math.max(0.5, Math.min(0.999, pFav));
  return BANDS.find((b) => p >= b.lo && p < b.hi) ?? BANDS[BANDS.length - 1];
}

function estOdds(passPct: number, margin: number): number {
  const p = Math.max(0.02, Math.min(0.98, passPct / 100));
  return Math.max(1.01, Math.round((1 / p) * (1 - margin) * 100) / 100);
}

/**
 * Tipovi za meč: pFav = model šansa favorita, favName/dogName imena.
 * Vraća opcije sortirane po prolaznosti (najsigurniji prvi) + oznaku safest.
 */
export function marketsForMatch(pFav: number, favName: string, dogName: string): MarketOption[] {
  const b = bandFor(pFav);
  const under215 = Math.round((100 - b.over215Pct) * 10) / 10;

  const options: Omit<MarketOption, "safest">[] = [
    {
      id: "favset",
      label: `${favName} uzima bar set`,
      pickText: `${favName} uzima set`,
      passPct: b.favSetPct,
      estOdds: estOdds(b.favSetPct, MARGIN_SIDE),
      sample: b.n,
    },
    {
      id: "win",
      label: `${favName} pobeđuje`,
      pickText: favName,
      passPct: b.favWinPct,
      estOdds: estOdds(b.favWinPct, MARGIN_MAIN),
      sample: b.n,
    },
    {
      id: "dogset",
      label: `${dogName} uzima bar set`,
      pickText: `${dogName} uzima set`,
      passPct: b.dogSetPct,
      estOdds: estOdds(b.dogSetPct, MARGIN_SIDE),
      sample: b.n,
    },
    {
      id: "over215",
      label: "Preko 21.5 gemova",
      pickText: "Preko 21.5 gemova",
      passPct: b.over215Pct,
      estOdds: estOdds(b.over215Pct, MARGIN_SIDE),
      sample: b.n,
    },
    {
      id: "under215",
      label: "Ispod 21.5 gemova",
      pickText: "Ispod 21.5 gemova",
      passPct: under215,
      estOdds: estOdds(under215, MARGIN_SIDE),
      sample: b.n,
    },
  ];

  const sorted = [...options].sort((a, x) => x.passPct - a.passPct);
  const safestId = sorted[0].id;
  return sorted.map((o) => ({ ...o, safest: o.id === safestId }));
}

/** Najsigurniji tip za meč — po istorijskoj prolaznosti (obično "favorit uzima set"). */
export function safestMarket(pFav: number, favName: string, dogName: string): MarketOption {
  return marketsForMatch(pFav, favName, dogName)[0];
}
