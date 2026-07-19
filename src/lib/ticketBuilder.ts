import type { Player, Surface } from "./elo";
import { blendedRating, expectedProb } from "./elo";
import { marketsForMatch, type MarketOption } from "./markets";

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
  kind: "siguran" | "srednji" | "rizican";
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
  if (kind === "siguran") {
    warning = `Prolaznosti su iz ~9.500 stvarnih mečeva — istorijski najprolazniji tipovi, ali kvota je mala. Tikete sa setovima/gemovima obeležavaš ručno.`;
  } else if (kind === "srednji") {
    warning = `Šansa da CEO tiket prođe je ${Math.round(hitProb * 100)}% — pada u ${Math.round((1 - hitProb) * 100)}% slučajeva. Backtest: kombinacije 4+ para dugoročno gube više od singlova — igraj umeren ulog.`;
  } else if (kind === "rizican") {
    warning = `Šansa da prođe je samo ${Math.round(hitProb * 100)}% — očekuj da najčešće padne. Ovo je lutrija sa razlogom iza sebe, ne plan: samo mali ulog.`;
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

/** Nogu iz kandidata prebaci na drugi tip igre (set/gemovi) sa istorijskom prolaznošću. */
function marketLeg(l: CandidateLeg, o: MarketOption): CandidateLeg {
  return { ...l, pick: o.pickText, prob: o.passPct / 100, odds: o.estOdds };
}

const roundStake = (v: number) => Math.max(0, Math.round(v / 10) * 10);

/**
 * Tri predloga za dan — kako je traženo:
 *  1. Siguran (tiket dana): 1–2 najjača para na najprolazniji tip, veći ulog.
 *  2. Srednji: 5–6 parova, miks igara (1/2 kod jakih favorita, setovi kod ostalih).
 *  3. Rizičan: velika kvota (cilj ~15) — svesno mala šansa, minimalan ulog.
 */
export function buildTicketsOfDay(
  matches: { matchId: number; tournament: string; startTime: string; surface: Surface; a: Player; b: Player }[],
  bankroll: number
): { tickets: BuiltTicket[]; notes: string[] } {
  const all = buildCandidateLegs(matches);
  const tickets: BuiltTicket[] = [];
  const notes: string[] = [];

  // Jedinstveni favoriti po meču, najjači prvi.
  const favs = all
    .filter((l) => l.prob >= 0.5)
    .sort((x, y) => y.prob - x.prob)
    .reduce<CandidateLeg[]>((acc, l) => {
      if (!acc.some((x) => x.matchId === l.matchId)) acc.push(l);
      return acc;
    }, []);

  // 1) SIGURAN — tiket dana: 1–2 najjača favorita, najprolazniji tip (obično "uzima set").
  const safeBase = favs.filter((l) => l.prob >= 0.62).slice(0, 2);
  if (safeBase.length >= 1) {
    const legs = safeBase.map((l) => {
      // Najprolazniji tip čija kvota ima smisla (>=1.12) — kvota 1.01 ne doprinosi ničemu.
      const opts = marketsForMatch(l.prob, l.pick, l.opponent);
      return marketLeg(l, opts.find((o) => o.estOdds >= 1.12) ?? opts[0]);
    });
    tickets.push(assemble("siguran", `Tiket dana — siguran (${legs.length} ${legs.length === 1 ? "par" : "para"})`, legs, roundStake(bankroll * 0.03)));
  } else {
    notes.push("Siguran tiket danas ne može — nema favorita preko 62% u našoj bazi.");
  }

  // 2) SREDNJI — 5–6 parova: jak favorit ide na 1/2, ostali na sigurniji tip (set/gemovi).
  const midBase = favs.filter((l) => l.prob >= 0.55).slice(0, 6);
  if (midBase.length >= 5) {
    const legs = midBase.map((l) => {
      const opts = marketsForMatch(l.prob, l.pick, l.opponent);
      const win = opts.find((o) => o.id === "win")!;
      return win.passPct >= 72 ? l : marketLeg(l, opts[0]); // opts[0] = najsigurniji tip
    });
    tickets.push(assemble("srednji", `Srednji — ${legs.length} parova, miks igara`, legs, roundStake(bankroll * 0.01)));
  } else {
    notes.push(`Srednji tiket (5–6 parova) danas ne može — u bazi ima samo ${midBase.length} favorita preko 55%.`);
  }

  // 3) RIZIČAN — velika kvota: i autsajderi sa realnom šansom, cilj ukupna kvota ~15.
  const riskPool = all
    .filter((l) => l.prob >= 0.3 && l.prob <= 0.85)
    .sort((x, y) => y.prob * y.odds - x.prob * x.odds) // najbolji odnos šansa×kvota
    .slice(0, 12);
  const risky = bestCombo(riskPool, 15.0, [4, 5, 6]);
  if (risky && risky.length >= 4) {
    tickets.push(assemble("rizican", "Rizičan — gađamo veliku kvotu (~15)", risky, roundStake(bankroll * 0.005)));
  } else {
    notes.push("Rizičan tiket ne može da se sastavi — nema dovoljno mečeva iz naše baze danas.");
  }

  return { tickets, notes };
}
