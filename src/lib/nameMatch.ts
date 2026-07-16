import type { Player } from "./elo";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "Sinner J." / "Etcheverry T. M." / "De Minaur A." -> "sinner" / "etcheverry" / "de minaur" */
function lastNameOf(storedName: string): string {
  return normalize(storedName.replace(/(\s+[A-Z]\.)+$/, "").trim());
}

/** First captured initial after the last name, e.g. "Etcheverry T. M." -> "t" */
function firstInitialOf(storedName: string): string {
  const m = storedName.match(/\s+([A-Z])\.(?:\s+[A-Z]\.)*$/);
  return m ? m[1].toLowerCase() : "";
}

export type PlayerIndex = {
  byLastAndInitial: Map<string, Player>;
  byLastOnly: Map<string, Player[]>;
};

export function buildPlayerIndex(players: Player[]): PlayerIndex {
  const byLastAndInitial = new Map<string, Player>();
  const byLastOnly = new Map<string, Player[]>();
  for (const p of players) {
    const last = lastNameOf(p.name);
    const initial = firstInitialOf(p.name);
    byLastAndInitial.set(`${last}|${initial}`, p);
    const list = byLastOnly.get(last) ?? [];
    list.push(p);
    byLastOnly.set(last, list);
  }
  return { byLastAndInitial, byLastOnly };
}

/** Matches a "First Last" (Sofascore-style) name against our "Last F." rating database. */
export function matchFullName(fullName: string, index: PlayerIndex): Player | null {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const sofaFirstInitial = normalize(tokens[0]).charAt(0);
  const sofaLast = normalize(tokens.slice(1).join(" "));

  const exact = index.byLastAndInitial.get(`${sofaLast}|${sofaFirstInitial}`);
  if (exact) return exact;

  const candidates = index.byLastOnly.get(sofaLast);
  if (candidates && candidates.length === 1) return candidates[0];

  return null;
}
