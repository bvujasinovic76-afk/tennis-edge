import { fetchAtpFixtures as fetchSofascore, type FixtureMatch } from "./sofascore";
import { fetchEspnFixtures, type FinishedMatch } from "./espn";

export type SmartFixtures = {
  live: FixtureMatch[];
  upcoming: FixtureMatch[];
  finished: FinishedMatch[];
  source: "sofascore" | "espn";
};

type CacheEntry = { data: SmartFixtures; expiresAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = 3 * 60 * 1000;

/**
 * Pametni izvor mečeva: Sofascore prvi (bogatiji — ATP rang + kvote po meču; radi lokalno preko curl-a),
 * ESPN kao fallback (radi svuda, i na Vercelu, ali bez kvota/ranga). Završeni mečevi uvek iz ESPN-a
 * jer ih Sofascore live feed ne nosi — potrebni su za auto-obeležavanje tiketa.
 */
export async function fetchFixturesSmart(): Promise<SmartFixtures & { fromCache: boolean }> {
  if (cache && cache.expiresAt > Date.now()) return { ...cache.data, fromCache: true };

  let finished: FinishedMatch[] = [];
  let espn: Awaited<ReturnType<typeof fetchEspnFixtures>> | null = null;
  try {
    espn = await fetchEspnFixtures();
    finished = espn.finished;
  } catch {
    // ESPN nedostupan — finished ostaje prazan.
  }

  let data: SmartFixtures;
  try {
    const sofa = await fetchSofascore();
    data = { live: sofa.live, upcoming: sofa.upcoming, finished, source: "sofascore" };
  } catch {
    if (!espn) throw new Error("Ni Sofascore ni ESPN trenutno nisu dostupni.");
    data = { live: espn.live, upcoming: espn.upcoming, finished, source: "espn" };
  }

  cache = { data, expiresAt: Date.now() + TTL_MS };
  return { ...data, fromCache: false };
}
