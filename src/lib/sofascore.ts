import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const BASE = "https://api.sofascore.com/api/v1";

/**
 * Sofascore's bot-detection returns 403 to Node's native fetch/undici (TLS/HTTP2 fingerprint) even with a
 * browser User-Agent header, but allows plain `curl` from the same machine. Locally we shell out to curl;
 * on serverless hosts (Vercel) there is no reliable curl binary AND datacenter IPs are often blocked, so
 * we try native fetch as a fallback and surface a clean error if both fail. The app degrades gracefully:
 * fixtures / daily plan show a "trenutno nedostupno" message, everything else keeps working. Replacing this
 * with a proper fixtures API (RapidAPI/API-Tennis) is the tracked next step for full online support.
 */
async function sofaFetch<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;

  // Preferred path (works locally): curl, which Sofascore accepts.
  try {
    const { stdout } = await execFileAsync("curl", ["-s", "-m", "12", "-A", UA, url], { maxBuffer: 20 * 1024 * 1024 });
    if (stdout && stdout.trim().startsWith("{")) return JSON.parse(stdout) as T;
  } catch {
    // curl missing (serverless) or failed — fall through to fetch.
  }

  // Fallback (may 403 on serverless): native fetch with browser-like headers.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.sofascore.com/" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    throw new Error(`Sofascore trenutno nedostupan (${err instanceof Error ? err.message : "greška"}).`);
  } finally {
    clearTimeout(timeout);
  }
}

type SofaTeam = { name: string; ranking?: number };
type SofaScore = { current?: number; display?: number; period1?: number; period2?: number; period3?: number; point?: string };
type SofaEvent = {
  id: number;
  tournament: { name: string; category: { slug: string }; uniqueTournament: { id: number }; id: number };
  season?: { id: number };
  roundInfo?: { name: string };
  status: { code: number; description: string; type: string };
  startTimestamp: number;
  homeTeam: SofaTeam;
  awayTeam: SofaTeam;
  homeScore?: SofaScore;
  awayScore?: SofaScore;
};

export type FixtureMatch = {
  id: number;
  tournament: string;
  round: string;
  status: string;
  statusType: string;
  startTime: string;
  home: { name: string; ranking: number | null };
  away: { name: string; ranking: number | null };
  score?: { home: SofaScore; away: SofaScore };
};

function isAtpSingles(e: SofaEvent): boolean {
  return e.tournament.category.slug === "atp" && !e.tournament.name.toLowerCase().includes("doubles");
}

function toFixture(e: SofaEvent): FixtureMatch {
  return {
    id: e.id,
    tournament: e.tournament.name,
    round: e.roundInfo?.name ?? "",
    status: e.status.description,
    statusType: e.status.type,
    startTime: new Date(e.startTimestamp * 1000).toISOString(),
    home: { name: e.homeTeam.name, ranking: e.homeTeam.ranking ?? null },
    away: { name: e.awayTeam.name, ranking: e.awayTeam.ranking ?? null },
    score: e.homeScore && e.awayScore ? { home: e.homeScore, away: e.awayScore } : undefined,
  };
}

function fractionalToDecimal(fractional: string): number | null {
  const m = fractional.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const den = parseInt(m[2], 10);
  if (den === 0) return null;
  return 1 + num / den;
}

type OddsMarket = {
  marketName?: string;
  marketGroup?: string;
  isLive?: boolean;
  choices?: { name: string; fractionalValue?: string }[];
};

/** Sofascore match-winner odds (their odds provider — a real independent market line, not our model). */
export async function fetchEventOdds(eventId: number): Promise<{ home: number; away: number } | null> {
  try {
    const res = await sofaFetch<{ markets: OddsMarket[] }>(`/event/${eventId}/odds/1/all`);
    const markets = res.markets ?? [];
    const fullTime = markets
      .filter((m) => m.marketName === "Full time" && m.marketGroup === "Home/Away" && m.choices?.length === 2)
      .sort((a, b) => Number(a.isLive) - Number(b.isLive)); // prefer pre-match over live
    const market = fullTime[0];
    if (!market?.choices) return null;
    const home = market.choices.find((c) => c.name === "1")?.fractionalValue;
    const away = market.choices.find((c) => c.name === "2")?.fractionalValue;
    const hd = home ? fractionalToDecimal(home) : null;
    const ad = away ? fractionalToDecimal(away) : null;
    if (hd == null || ad == null) return null;
    return { home: hd, away: ad };
  } catch {
    return null;
  }
}

type CacheEntry = { data: { live: FixtureMatch[]; upcoming: FixtureMatch[] }; expiresAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = 3 * 60 * 1000;

export async function fetchAtpFixtures(): Promise<{ live: FixtureMatch[]; upcoming: FixtureMatch[]; fromCache: boolean }> {
  if (cache && cache.expiresAt > Date.now()) {
    return { ...cache.data, fromCache: true };
  }

  const liveRes = await sofaFetch<{ events: SofaEvent[] }>("/sport/tennis/events/live");
  const liveAtp = liveRes.events.filter(isAtpSingles);
  const live = liveAtp.map(toFixture);

  const tournamentKeys = new Map<string, { id: number; seasonId: number }>();
  for (const e of liveAtp) {
    if (!e.season) continue;
    const key = `${e.tournament.uniqueTournament.id}:${e.season.id}`;
    tournamentKeys.set(key, { id: e.tournament.uniqueTournament.id, seasonId: e.season.id });
  }

  const upcomingLists = await Promise.all(
    [...tournamentKeys.values()].map(async ({ id, seasonId }) => {
      try {
        const res = await sofaFetch<{ events: SofaEvent[] }>(`/unique-tournament/${id}/season/${seasonId}/events/next/0`);
        return res.events.filter((e) => isAtpSingles(e) && e.status.type === "notstarted").map(toFixture);
      } catch {
        return [];
      }
    })
  );

  const upcoming = upcomingLists
    .flat()
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 60);

  const data = { live, upcoming };
  cache = { data, expiresAt: Date.now() + TTL_MS };
  return { ...data, fromCache: false };
}
