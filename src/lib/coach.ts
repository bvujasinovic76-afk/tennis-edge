import type { Bet } from "./bankroll";
import { betPnl } from "./bankroll";

// Analiza sopstvenih tiketa — gde se gubi i šta bi drugačije donelo bolji ishod.
// Sve se računa lokalno iz istorije (0 API kredita), i uvek se kaže koliko je uzorak mali.

export type Severity = "high" | "medium" | "info";

export type Finding = {
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
};

export type LegGroup = {
  legs: number;       // 1 = singl, 2, 3, 4+
  label: string;
  count: number;
  won: number;
  winRatePct: number;
  staked: number;
  pnl: number;
};

export type Counterfactual = {
  tickets: number;      // koliko kombinacija je moglo da se uporedi
  comboPnl: number;     // stvaran rezultat kombinacija
  singlesPnl: number;   // rezultat da su isti parovi igrani kao zasebni singlovi
  difference: number;   // singlesPnl - comboPnl (pozitivno = singlovi bolji)
  legsWon: number;
  legsTotal: number;
};

export type CoachReport = {
  settledCount: number;
  totalStaked: number;
  pnl: number;
  roiPct: number;
  avgOdds: number;
  avgStake: number;
  impliedWinRatePct: number; // šta kvote kažu koliko treba da prolazi
  actualWinRatePct: number;
  byLegCount: LegGroup[];
  counterfactual: Counterfactual | null;
  findings: Finding[];
  sampleWarning: string | null;
};

const legLabel = (n: number) => (n === 1 ? "Singl (1 par)" : n >= 4 ? "4+ para" : `Kombinacija ${n} para`);

export function analyzeBets(bets: Bet[], currentBankroll: number): CoachReport {
  const settled = bets.filter((b) => b.status === "won" || b.status === "lost");

  const totalStaked = settled.reduce((s, b) => s + b.stake, 0);
  const pnl = settled.reduce((s, b) => s + betPnl(b), 0);
  const wonCount = settled.filter((b) => b.status === "won").length;
  const avgOdds = settled.length ? settled.reduce((s, b) => s + b.odds, 0) / settled.length : 0;
  const avgStake = settled.length ? totalStaked / settled.length : 0;
  // Kvota 4.0 znači da tržište očekuje ~25% prolaza (bez skidanja marže).
  const impliedWinRate = settled.length ? settled.reduce((s, b) => s + 1 / b.odds, 0) / settled.length : 0;
  const actualWinRate = settled.length ? wonCount / settled.length : 0;

  // --- Po broju parova ---
  const groups = new Map<number, LegGroup>();
  for (const b of settled) {
    const n = Math.min(b.legs?.length ?? 1, 4);
    const g = groups.get(n) ?? { legs: n, label: legLabel(n), count: 0, won: 0, winRatePct: 0, staked: 0, pnl: 0 };
    g.count += 1;
    if (b.status === "won") g.won += 1;
    g.staked += b.stake;
    g.pnl += betPnl(b);
    groups.set(n, g);
  }
  const byLegCount = [...groups.values()]
    .map((g) => ({ ...g, winRatePct: g.count ? (g.won / g.count) * 100 : 0 }))
    .sort((a, b) => a.legs - b.legs);

  // --- Kontrafaktual: isti parovi kao zasebni singlovi ---
  // Radi samo za kombinacije kod kojih znamo ishod svakog para.
  const combos = settled.filter((b) => (b.legs?.length ?? 0) >= 2 && b.legs!.every((l) => l.result === "won" || l.result === "lost"));
  let counterfactual: Counterfactual | null = null;
  if (combos.length > 0) {
    let comboPnl = 0;
    let singlesPnl = 0;
    let legsWon = 0;
    let legsTotal = 0;
    for (const b of combos) {
      comboPnl += betPnl(b);
      const legs = b.legs!;
      const per = b.stake / legs.length; // isti ukupan ulog, podeljen na singlove
      for (const l of legs) {
        legsTotal += 1;
        if (l.result === "won") {
          legsWon += 1;
          singlesPnl += per * (l.odds - 1);
        } else {
          singlesPnl -= per;
        }
      }
    }
    counterfactual = {
      tickets: combos.length,
      comboPnl: Math.round(comboPnl),
      singlesPnl: Math.round(singlesPnl),
      difference: Math.round(singlesPnl - comboPnl),
      legsWon,
      legsTotal,
    };
  }

  // --- Nalazi ---
  const findings: Finding[] = [];

  if (counterfactual && counterfactual.difference > 0) {
    findings.push({
      severity: "high",
      title: "Kombinacije te koštaju — singlovi bi bili bolji",
      detail: `Na ${counterfactual.tickets} ${counterfactual.tickets === 1 ? "kombinaciji" : "kombinacija"} pogodio si ${counterfactual.legsWon} od ${counterfactual.legsTotal} parova (${Math.round((counterfactual.legsWon / counterfactual.legsTotal) * 100)}%) — što je solidno. Ali kombinacija traži da SVI prođu, pa je rezultat ${counterfactual.comboPnl >= 0 ? "+" : ""}${counterfactual.comboPnl}. Da si iste te parove igrao kao zasebne singlove sa istim ukupnim ulogom, bio bi ${counterfactual.singlesPnl >= 0 ? "+" : ""}${counterfactual.singlesPnl} — razlika od ${counterfactual.difference}.`,
      fix: "Igraj singlove ili maksimalno 2 para. Tvoji pickovi nisu problem — problem je što kombinacija množi kvotu, ali DELI šansu.",
    });
  }

  const combosGroup = byLegCount.filter((g) => g.legs >= 3);
  const combosCount = combosGroup.reduce((s, g) => s + g.count, 0);
  const combosPnl = combosGroup.reduce((s, g) => s + g.pnl, 0);
  if (combosCount >= 2 && combosPnl < 0) {
    findings.push({
      severity: "high",
      title: "Tiketi sa 3+ para su ti u minusu",
      detail: `Odigrao si ${combosCount} ${combosCount === 1 ? "tiket" : "tiketa"} sa 3 ili više parova, ukupno ${combosPnl} rezultat.`,
      fix: "Ograniči se na 1–2 para po tiketu. Svaki dodatni par množi šansu da ceo tiket padne.",
    });
  }

  if (settled.length >= 3 && actualWinRate < impliedWinRate - 0.1) {
    findings.push({
      severity: "medium",
      title: "Prolaziš ređe nego što kvote nalažu",
      detail: `Kvote na kojima igraš impliciraju ~${Math.round(impliedWinRate * 100)}% prolaza, a tvoj stvarni prolaz je ${Math.round(actualWinRate * 100)}%.`,
      fix: "Ili je uzorak još mali (varijansa), ili biraš tikete čija je stvarna šansa manja od one koju kvota plaća. Pre svakog tiketa pogledaj šansu prolaza koju ti app računa.",
    });
  }

  if (avgStake > 0 && currentBankroll > 0) {
    const pct = (avgStake / currentBankroll) * 100;
    if (pct > 8) {
      findings.push({
        severity: "high",
        title: "Ulog ti je prevelik u odnosu na bankroll",
        detail: `Prosečan ulog ti je ${Math.round(avgStake)} (${pct.toFixed(1)}% bankrolla). Na tom nivou te i kratak niz gubitaka izbaci iz igre.`,
        fix: "Drži ulog na 1–3% bankrolla po tiketu. Cilj je preživeti loš niz, ne pogoditi jedan veliki.",
      });
    }
  }

  const bigOdds = settled.filter((b) => b.odds >= 4);
  if (bigOdds.length >= 2) {
    const bigPnl = bigOdds.reduce((s, b) => s + betPnl(b), 0);
    if (bigPnl < 0) {
      findings.push({
        severity: "medium",
        title: "Velike kvote (4.00+) ti odnose novac",
        detail: `Na ${bigOdds.length} tiketa sa kvotom 4.00+ rezultat ti je ${Math.round(bigPnl)}.`,
        fix: "Velika kvota znači malu šansu — to nije prilika nego cena. Ako ih igraš, neka bude sitan ulog i retko.",
      });
    }
  }

  if (findings.length === 0 && settled.length > 0) {
    findings.push({
      severity: "info",
      title: "Za sada nema očiglednih grešaka u obrascu",
      detail: "Iz onoga što je do sada odigrano ne vidim jasan sistemski propust.",
      fix: "Nastavi da unosiš tikete — što više podataka, to tačnija analiza.",
    });
  }

  let sampleWarning: string | null = null;
  if (settled.length === 0) sampleWarning = "Još nema završenih tiketa — unesi one koje si već odigrao pa da vidimo obrazac.";
  else if (settled.length < 10)
    sampleWarning = `Imaš samo ${settled.length} ${settled.length === 1 ? "završen tiket" : "završena tiketa"} — premalo za tvrde zaključke. Treba bar 10–20. Ono što piše ispod je nagoveštaj, ne dokaz.`;

  return {
    settledCount: settled.length,
    totalStaked: Math.round(totalStaked),
    pnl: Math.round(pnl),
    roiPct: totalStaked > 0 ? (pnl / totalStaked) * 100 : 0,
    avgOdds,
    avgStake,
    impliedWinRatePct: impliedWinRate * 100,
    actualWinRatePct: actualWinRate * 100,
    byLegCount,
    counterfactual,
    findings,
    sampleWarning,
  };
}
