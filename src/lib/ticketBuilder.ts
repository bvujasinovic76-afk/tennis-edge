import type { Player, Surface } from "./elo";
import { blendedRating, expectedProb } from "./elo";
import { safestMarket } from "./markets";

// Gradi "tiket dana" — kombinaciju parova koja pogađa ciljanu ukupnu kvotu.
// Ključno: uz svaki tiket ide POŠTENA šansa da prođe (proizvod verovatnoća svih parova),
// jer kombinacije brzo obaraju šansu: 3 para po 75% = 42%, ne 75%.

const MARGIN = 0.05; // tipična marža kladionice — koristi se za PROCENU kvote

export type CandidateLeg = {
  matchId: number;
  match: string;      // "Igrač A vs Igrač B"
  tournament: string;
  startTime: string;
  surface: Surface;
  pick: string;
  opponent: string;
  prob: number;       // model verovatnoća da pick prođe
  odds: number;       // procenjena kvota
};

export type BuiltTicket = {
  kind: "duplas" | "rizican" | "pet" | "setovi";
  title: string;
  legs: CandidateLeg[];
  totalOdds: number;
  hitProb: number;       // šansa da CEO tiket prođe
  stake: number;
  potentialReturn: number; // ulog * kvota (ukupna isplata)
  potentialProfit: number;
  evPct: number;         // očekivana vrednost u % uloga (negativno = gubitaš dugoročno)
  warning: string | null;
};

function estOdds(prob: number): number {
  return Math.max(1.01, Math.round((1 / prob) * (1 - MARGIN) * 100) / 100);
}

/** Sve opcije za dan: za svaki meč i favorit i autsajder (autsajder nosi veću kvotu). */
export function buildCandidateLegs(
  matches: { matchId: number; tournament: string; startTime: string; surface: Surface; a: Player; b: Player }[]
): CandidateLeg[] {
  const out: CandidateLeg[] = [];
  for (const m of matches) {
    const pA = expectedProb(blendedRating(m.a, m.surface), blendedRating(m.b, m.surface));
    const label = `${m.a.name} vs ${m.b.name}`;
    const base = { matchId: m.matchId, match: label, tournament: m.tournament, startTime: m.startTime, surface: m.surface };
    out.push({ ...base, pick: m.a.name, opponent: m.b.name, prob: pA, odds: estOdds(pA) });
    out.push({ ...base, pick: m.b.name, opponent: m.a.name, prob: 1 - pA, odds: estOdds(1 - pA) });
  }
  return out;
}

function combos<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [head, ...rest] = arr;
  return [...combos(rest, size - 1).map((c) => [head, ...c]), ...combos(rest, size)];
}

/** Nađi kombinaciju čiji je proizvod kvota najbliži cilju, uz najveću šansu da prođe. */
function bestCombo(pool: CandidateLeg[], target: number, sizes: number[]): CandidateLeg[] | null {
  let best: { legs: CandidateLeg[]; score: number } | null = null;
  for (const size of sizes) {
    for (const c of combos(pool, size)) {
      // Jedan meč sme da uđe samo jednom (ne možeš igrati oba igrača istog meča).
      const ids = new Set(c.map((l) => l.matchId));
      if (ids.size !== c.length) continue;
      const total = c.reduce((a, l) => a * l.odds, 1);
      const prob = c.reduce((a, l) => a * l.prob, 1);
      // Kazna za promašaj cilja + nagrada za veću šansu prolaza.
      const score = Math.abs(total - target) / target - prob * 0.5;
      if (!best || score < best.score) best = { legs: c, score };
    }
  }
  return best?.legs ?? null;
}

function assemble(kind: BuiltTicket["kind"], title: string, legs: CandidateLeg[], stake: number): BuiltTicket {
  const totalOdds = Math.round(legs.reduce((a, l) => a * l.odds, 1) * 100) / 100;
  const hitProb = legs.reduce((a, l) => a * l.prob, 1);
  const potentialReturn = Math.round(stake * totalOdds);
  const ev = hitProb * totalOdds - 1; // po dinaru uloga

  let warning: string | null = null;
  if (kind === "setovi") {
    warning = `Prolaznosti su iz ~9.500 stvarnih mečeva — ovo je istorijski najprolazniji tip forme, ali kvote su male pa je i dobitak mali. Tikete sa setovima obeležavaš ručno.`;
  } else if (kind === "pet") {
    warning = `Šansa da prođe je ${Math.round(hitProb * 100)}% — pada u ${Math.round((1 - hitProb) * 100)}% slučajeva. Backtest na 2.928 mečeva: kombinacije 4+ para daju oko −23% ROI (isti pickovi kao singlovi: −2.4%). Ovo je tvoj izbor, ali podaci su protiv njega.`;
  } else if (hitProb < 0.5 && kind === "duplas") {
    warning = `Šansa da prođe je ${Math.round(hitProb * 100)}% — kombinacija obara šansu, ovo NIJE siguran duplaš.`;
  } else if (kind === "rizican") {
    warning = `Šansa da prođe je samo ${Math.round(hitProb * 100)}% — očekuj da najčešće padne. Igraj mali ulog.`;
  }

  return {
    kind,
    title,
    legs,
    totalOdds,
    hitProb,
    stake,
    potentialReturn,
    potentialProfit: potentialReturn - stake,
    evPct: Math.round(ev * 1000) / 10,
    warning,
  };
}

/**
 * Dva predloga za dan:
 *  - "duplaš": kombinacija najjačih favorita sa ukupnom kvotom ~2.0 (cilj: dupliranje uloga)
 *  - "rizičan": kombinacija za veliku kvotu (~8), svesno mala šansa
 */
export function buildTicketsOfDay(
  matches: { matchId: number; tournament: string; startTime: string; surface: Surface; a: Player; b: Player }[],
  bankroll: number
): { tickets: BuiltTicket[]; notes: string[] } {
  const all = buildCandidateLegs(matches);
  const tickets: BuiltTicket[] = [];
  const notes: string[] = [];

  // Duplaš: favoriti (>=55%), 2–3 para, ciljamo ukupnu kvotu ~2.0.
  const favPool = all
    .filter((l) => l.prob >= 0.55)
    .sort((x, y) => y.prob - x.prob)
    .slice(0, 8);
  const dup = bestCombo(favPool, 2.0, [2, 3]);
  if (dup && dup.length >= 2) {
    tickets.push(assemble("duplas", "Duplaš — cilj kvota ~2.0", dup, Math.max(0, Math.round((bankroll * 0.02) / 10) * 10)));
  } else {
    notes.push(
      `Duplaš danas ne može da se sastavi — treba bar 2 favorita iznad 55%, a danas ih ima ${favPool.length}. Bolje preskočiti nego forsirati loš tiket.`
    );
  }

  // Rizičan: dozvoljeni i autsajderi, ali sa realnom šansom (>=25%); 3–4 para, cilj ~8.0.
  const riskPool = all
    .filter((l) => l.prob >= 0.25)
    .sort((x, y) => y.prob * y.odds - x.prob * x.odds) // najbolji odnos šansa×kvota
    .slice(0, 9);
  const risky = bestCombo(riskPool, 8.0, [3, 4]);
  if (risky && risky.length >= 3) {
    tickets.push(assemble("rizican", "Rizičan — gađamo veliku kvotu", risky, Math.max(0, Math.round((bankroll * 0.005) / 10) * 10)));
  } else {
    notes.push("Rizičan tiket ne može da se sastavi — nema dovoljno mečeva iz naše baze danas.");
  }

  // "Sigurniji — setovi": 2-3 najjača favorita, ali tip je "uzima bar set" umesto pobede.
  // Istorijski NAJPROLAZNIJA forma (fav uzima set prolazi 73-95% zavisno od jačine).
  const setPool = all
    .filter((l) => l.prob >= 0.62)
    .sort((x, y) => y.prob - x.prob)
    .reduce<CandidateLeg[]>((acc, l) => {
      if (!acc.some((x) => x.matchId === l.matchId)) acc.push(l);
      return acc;
    }, [])
    .slice(0, 3);
  if (setPool.length >= 2) {
    const setLegs: CandidateLeg[] = setPool.map((l) => {
      const m = safestMarket(l.prob, l.pick, l.opponent);
      // safestMarket za jake favorite vraća "uzima set"; prob = istorijska prolaznost
      return { ...l, pick: m.pickText, prob: m.passPct / 100, odds: m.estOdds };
    });
    tickets.push(assemble("setovi", "Sigurniji — favoriti uzimaju set", setLegs, Math.max(0, Math.round((bankroll * 0.02) / 10) * 10)));
  } else {
    notes.push("Set-tiket ne može danas — treba bar 2 favorita preko 62% u našoj bazi.");
  }

  // Tiket od 5 parova — tražen izričito. Biramo 5 najverovatnijih favorita (najveća moguća šansa
  // za tu formu), ali šansa i dalje pada jer svih 5 mora proći.
  const petPool = all
    .filter((l) => l.prob >= 0.5)
    .sort((x, y) => y.prob - x.prob)
    .reduce<CandidateLeg[]>((acc, l) => {
      if (!acc.some((x) => x.matchId === l.matchId)) acc.push(l); // jedan meč = jedan par
      return acc;
    }, [])
    .slice(0, 5);
  if (petPool.length === 5) {
    tickets.push(assemble("pet", "5 parova — kako si tražio", petPool, Math.max(0, Math.round((bankroll * 0.005) / 10) * 10)));
  } else {
    notes.push(`Tiket od 5 parova ne može danas — u našoj bazi ima samo ${petPool.length} ${petPool.length === 1 ? "meč" : "mečeva"} sa favoritom preko 50%.`);
  }

  return { tickets, notes };
}
