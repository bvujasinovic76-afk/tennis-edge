import type { FixtureMatch } from "./sofascore";

// ESPN-ov javni scoreboard — radi sa native fetch-om i iz datacentara (Vercel),
// za razliku od Sofascore-a. Nema kvote ni ATP rang, ali daje live/upcoming/finished.
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard";

type EspnCompetitor = {
  athlete?: { displayName?: string };
  winner?: boolean;
  linescores?: { value?: number }[];
};

type EspnCompetition = {
  id: string;
  date: string;
  round?: { displayName?: string };
  status?: { type?: { state?: string; description?: string; completed?: boolean } };
  competitors?: EspnCompetitor[];
};

type EspnEvent = {
  name: string;
  groupings?: { grouping?: { displayName?: string }; competitions?: EspnCompetition[] }[];
  competitions?: EspnCompetition[];
};

export type FinishedMatch = {
  tournament: string;
  startTime: string;
  homeName: string;
  awayName: string;
  winnerName: string;
};

function lineScores(c?: EspnCompetitor) {
  const vals = (c?.linescores ?? []).map((l) => l.value).filter((v): v is number => v != null);
  return { period1: vals[0], period2: vals[1], period3: vals[2] } as { period1?: number; period2?: number; period3?: number };
}

export async function fetchEspnFixtures(): Promise<{ live: FixtureMatch[]; upcoming: FixtureMatch[]; finished: FinishedMatch[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(SCOREBOARD, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
    const data = (await res.json()) as { events?: EspnEvent[] };

    const live: FixtureMatch[] = [];
    const upcoming: FixtureMatch[] = [];
    const finished: FinishedMatch[] = [];

    for (const ev of data.events ?? []) {
      const groups = ev.groupings?.length ? ev.groupings : [{ grouping: { displayName: "Singles" }, competitions: ev.competitions ?? [] }];
      for (const g of groups) {
        const label = g.grouping?.displayName ?? "";
        if (!/men's singles|^singles$/i.test(label)) continue; // ATP pojedinačno
        for (const c of g.competitions ?? []) {
          const [h, a] = c.competitors ?? [];
          const homeName = h?.athlete?.displayName;
          const awayName = a?.athlete?.displayName;
          if (!homeName || !awayName) continue;
          const state = c.status?.type?.state ?? "pre";
          const base: FixtureMatch = {
            id: Number(c.id) || Math.abs(hash(`${ev.name}${c.date}${homeName}`)),
            tournament: ev.name,
            round: c.round?.displayName ?? "",
            status: c.status?.type?.description ?? "",
            statusType: state === "in" ? "inprogress" : state === "post" ? "finished" : "notstarted",
            startTime: new Date(c.date).toISOString(),
            home: { name: homeName, ranking: null },
            away: { name: awayName, ranking: null },
            score: state !== "pre" ? { home: lineScores(h), away: lineScores(a) } : undefined,
          };
          if (state === "in") live.push(base);
          else if (state === "pre") upcoming.push(base);
          else if (c.status?.type?.completed) {
            const winner = h?.winner ? homeName : a?.winner ? awayName : null;
            if (winner) finished.push({ tournament: ev.name, startTime: base.startTime, homeName, awayName, winnerName: winner });
          }
        }
      }
    }

    upcoming.sort((x, y) => new Date(x.startTime).getTime() - new Date(y.startTime).getTime());
    return { live, upcoming: upcoming.slice(0, 60), finished };
  } finally {
    clearTimeout(timeout);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
