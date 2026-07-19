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

/** Matches a "Last F." (TennisExplorer-style, same format as our DB) name directly. */
export function matchShortName(shortName: string, index: PlayerIndex): Player | null {
  const name = shortName.trim();
  if (!/\s[A-Z]\.(\s[A-Z]\.)*$/.test(name)) return null; // nije kratki format
  const last = lastNameOf(name);
  const initial = firstInitialOf(name);
  const exact = index.byLastAndInitial.get(`${last}|${initial}`);
  if (exact) return exact;
  const candidates = index.byLastOnly.get(last);
  return candidates && candidates.length === 1 ? candidates[0] : null;
}

/** Proba oba formata: "First Last" (Sofascore/ESPN) pa "Last F." (TennisExplorer). */
export function matchAnyName(name: string, index: PlayerIndex): Player | null {
  return matchShortName(name, index) ?? matchFullName(name, index);
}

/** Matches a "First Last" (Sofascore/ESPN-style) name against our "Last F." rating database. */
export function matchFullName(fullName: string, index: PlayerIndex): Player | null {
  const name = fullName.trim();
  if (!name || /^TBD$/i.test(name)) return null; // ESPN koristi "TBD" za još neodređene protivnike
  const tokens = name.split(/\s+/);
  if (tokens.length < 2) return null;
  const firstInitial = normalize(tokens[0]).charAt(0);

  // Kandidati za prezime: sve posle imena ("Adolfo Daniel Vallejo" -> "daniel vallejo"),
  // pa samo poslednja reč ("vallejo") — kod trodelnih imena baza obično nosi samo poslednju.
  const lastCandidates = [normalize(tokens.slice(1).join(" "))];
  if (tokens.length > 2) lastCandidates.push(normalize(tokens[tokens.length - 1]));

  for (const last of lastCandidates) {
    const exact = index.byLastAndInitial.get(`${last}|${firstInitial}`);
    if (exact) return exact;
  }
  for (const last of lastCandidates) {
    const candidates = index.byLastOnly.get(last);
    if (candidates && candidates.length === 1) return candidates[0];
  }
  return null;
}
