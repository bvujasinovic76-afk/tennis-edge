import type { WorldMatch } from "./sofascore";

/**
 * TennisExplorer kao online izvor za CHALLENGER mečeve: Sofascore blokira hosting
 * servere (Vercel), a ESPN nema challengere — TennisExplorer radi i sa datacentra.
 * Parsiramo dnevnu stranicu mečeva (muški singl): turnir-headere pa parove u po
 * dva <tr> reda (igrač + setovi + kvota).
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type TeCache = { key: string; data: WorldMatch[]; expiresAt: number };
let cache: TeCache | null = null;
const TTL_MS = 3 * 60 * 1000;

/** "GMT+02:00" ofset Beograda za dati datum (letnje/zimsko računanje). */
function belgradeOffset(dateStr: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Belgrade", timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value; // npr. "GMT+02:00"
  const m = part?.match(/([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+01:00";
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

type Half = { name: string; result: number | null; scores: (number | null)[] };

function parseHalf(seg: string): Half | null {
  const name = seg.match(/\/player\/[^"]+"\s*>([^<]+)<\/a>/)?.[1]?.trim();
  if (!name) return null;
  const result = seg.match(/class="result">(\d*)/)?.[1];
  const scores = [...seg.matchAll(/class="score">(?:<[^>]+>)?(\d*)/g)].map((m) => (m[1] === "" ? null : Number(m[1])));
  return { name, result: result ? Number(result) : null, scores: scores.slice(0, 5) };
}

/** Svi muški singl CHALLENGER mečevi za dan sa TennisExplorera. */
export async function fetchTeChallengerDay(dateStr: string): Promise<WorldMatch[]> {
  if (cache && cache.key === dateStr && cache.expiresAt > Date.now()) return cache.data;

  const [y, mo, d] = dateStr.split("-");
  const url = `https://www.tennisexplorer.com/matches/?type=atp-single&year=${y}&month=${mo}&day=${d}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let html: string;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: controller.signal });
    if (!res.ok) throw new Error(`TennisExplorer HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const off = belgradeOffset(dateStr);
  const rows = html.split(/<tr\b/).slice(1);
  const out: WorldMatch[] = [];
  const seen = new Set<number>();

  let tournament: { name: string; isChallenger: boolean } | null = null;
  let pending: { id: number; time: string; home: Half; odds: { home: number; away: number } | null } | null = null;

  for (const row of rows) {
    const seg = row.slice(0, row.indexOf("</tr>") === -1 ? undefined : row.indexOf("</tr>"));

    // Turnir-header: <tr class="head flags"><td class="t-name" ...><a href="/winnipeg-challenger/2026/atp-men/">Winnipeg challenger</a>
    if (/class="head/.test(seg)) {
      const t = seg.match(/href="\/([^"]+?)\/\d{4}\/atp-men\/"[^>]*>(?:<[^>]+>|&nbsp;|\s)*([^<]+)</);
      if (t) {
        const raw = t[2].trim();
        tournament = {
          name: titleCase(raw.replace(/\s*challenger\s*$/i, "").trim()),
          isChallenger: /challenger/i.test(t[1]) || /challenger/i.test(raw),
        };
      }
      pending = null;
      continue;
    }

    const idm = seg.match(/id="r(\d+)(b?)"/);
    if (!idm || !tournament?.isChallenger) continue;

    if (idm[2] !== "b") {
      const half = parseHalf(seg);
      const time = seg.match(/class="first time"[^>]*>\s*([\d]{1,2}:[\d]{2})/)?.[1] ?? "12:00";
      const detailId = seg.match(/match-detail\/\?id=(\d+)/)?.[1];
      // Kvote: kolone H i A u prvom redu (class "coursew"/"course"), redom home pa away.
      const oddsVals = [...seg.matchAll(/class="course(?:w)?"[^>]*>\s*([\d.]+)/g)].map((m) => Number(m[1]));
      const odds = oddsVals.length >= 2 && oddsVals[0] > 1 && oddsVals[1] > 1 ? { home: oddsVals[0], away: oddsVals[1] } : null;
      if (half && detailId) pending = { id: Number(detailId), time, home: half, odds };
      else pending = null;
    } else if (pending) {
      const away = parseHalf(seg);
      const { id, time, home, odds } = pending;
      pending = null;
      if (!away || seen.has(id)) continue;
      if (home.name.includes("/") || away.name.includes("/")) continue; // dubl
      seen.add(id);

      const played = home.scores.some((s) => s != null) || away.scores.some((s) => s != null);
      const finished = played && ((home.result ?? 0) >= 2 || (away.result ?? 0) >= 2);
      const winner = finished ? ((home.result ?? 0) >= 2 ? ("home" as const) : ("away" as const)) : null;
      const score = played
        ? {
            home: { period1: home.scores[0] ?? undefined, period2: home.scores[1] ?? undefined, period3: home.scores[2] ?? undefined },
            away: { period1: away.scores[0] ?? undefined, period2: away.scores[1] ?? undefined, period3: away.scores[2] ?? undefined },
          }
        : undefined;

      out.push({
        id,
        tournament: `${tournament.name} (Challenger)`,
        round: "",
        status: finished ? "Ended" : played ? "In progress" : "Not started",
        statusType: finished ? "finished" : played ? "inprogress" : "notstarted",
        startTime: new Date(`${dateStr}T${time.padStart(5, "0")}:00${off}`).toISOString(),
        home: { name: home.name, ranking: null },
        away: { name: away.name, ranking: null },
        score,
        category: "Challenger",
        tier: "Challenger",
        winner,
        odds,
      });
    }
  }

  cache = { key: dateStr, data: out, expiresAt: Date.now() + TTL_MS };
  return out;
}
