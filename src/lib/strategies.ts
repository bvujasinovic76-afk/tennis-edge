import type { Player, Surface } from "./elo";
import { blendedRating, expectedProb, devig } from "./elo";

export type StrategyFamily = "pre-match" | "value" | "akumulator" | "live" | "trejding";
export type Variance = "low" | "medium" | "high";
export type CriterionStatus = "pass" | "fail" | "unknown";

export type Criterion = { label: string; status: CriterionStatus; detail: string };

export type SupportedStrategyId = "sistem88" | "value" | "sistem20" | "skip";

export type StrategyEval = {
  id: SupportedStrategyId;
  name: string;
  family: StrategyFamily;
  market: string; // šta se konkretno igra
  typicalOdds: string;
  variance: Variance;
  suitability: number; // 0..100 — koliko meč odgovara ovoj strategiji
  side: "A" | "B" | null; // koga se igra (null = ne igraj)
  pickName: string | null;
  rationale: string;
  criteria: Criterion[];
  needsOdds: boolean;
};

export type UnsupportedStrategy = {
  name: string;
  family: StrategyFamily;
  market: string;
  reason: string; // zašto nije podržano
  needs: string; // šta bi trebalo dodati
};

export type StrategyScore = {
  supported: StrategyEval[]; // sortirano po suitability desc
  recommendedId: SupportedStrategyId;
  unsupported: UnsupportedStrategy[];
  features: {
    pFav: number;
    favSide: "A" | "B";
    favName: string;
    dogName: string;
    eloGap: number;
    rankGap: number | null;
    favSurfaceElo: number | null;
    edgeFavPct: number | null; // + znači model voli favorita više od tržišta
  };
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function scoreStrategies(
  a: Player,
  b: Player,
  surface: Surface,
  oddsA?: number,
  oddsB?: number
): StrategyScore {
  const ra = blendedRating(a, surface);
  const rb = blendedRating(b, surface);
  const favIsA = ra >= rb;
  const fav = favIsA ? a : b;
  const dog = favIsA ? b : a;
  const favSide: "A" | "B" = favIsA ? "A" : "B";
  const pFav = favIsA ? expectedProb(ra, rb) : expectedProb(rb, ra);
  const eloGap = Math.abs(ra - rb);
  const rankGap = a.atpRank != null && b.atpRank != null ? Math.abs(a.atpRank - b.atpRank) : null;
  const favSurfaceElo = fav.surfaceElo[surface] ?? null;

  const hasOdds = !!(oddsA && oddsB && oddsA > 1 && oddsB > 1);
  let edgeFav: number | null = null; // model - market on favorite (fraction)
  if (hasOdds) {
    const { pA: marketPA } = devig(oddsA!, oddsB!);
    const marketPFav = favIsA ? marketPA : 1 - marketPA;
    edgeFav = pFav - marketPFav;
  }

  // --- Sistem 88%: favorit 2:0 u setovima. Sada sa PRAVOM formom i % pobeda po podlozi (faza 2) ---
  const favSurfacePct = fav.surfaceRecord?.[surface]?.pct ?? null;
  const favSurfaceMatches = fav.surfaceRecord?.[surface] ? fav.surfaceRecord[surface].wins + fav.surfaceRecord[surface].losses : 0;
  const favFormWins = fav.form?.total ? fav.form.wins : null;
  const favFormTotal = fav.form?.total ?? 0;

  const rankComponent = rankGap != null ? clamp01(rankGap / 60) : clamp01(eloGap / 250);
  const favComponent = clamp01((pFav - 0.68) / 0.22);
  const surfaceComponent = favSurfacePct != null && favSurfaceMatches >= 10 ? clamp01((favSurfacePct - 65) / 25) : 0.4;
  const formComponent = favFormWins != null && favFormTotal >= 5 ? clamp01((favFormWins - 6) / 4) : 0.4;
  const sistem88Suit =
    clamp01(0.28 * favComponent + 0.24 * rankComponent + 0.24 * surfaceComponent + 0.24 * formComponent) *
    (pFav < 0.62 ? 0.15 : 1);
  const sistem88: StrategyEval = {
    id: "sistem88",
    name: "Sistem 88% — favorit 2:0 u setovima",
    family: "pre-match",
    market: "Tačan rezultat u setovima 2:0 (3:0 na GS)",
    typicalOdds: "1.55–2.00",
    variance: "medium",
    suitability: Math.round(sistem88Suit * 100),
    side: favSide,
    pickName: fav.name,
    rationale:
      pFav < 0.62
        ? "Nema dovoljno jasnog favorita — sistem zahteva ubedljivu razliku, ovaj meč je pretesan."
        : `Favorit ${fav.name} (model ${(pFav * 100).toFixed(0)}%)${rankGap != null ? `, rang jaz ${rankGap}` : ""}${favFormWins != null ? `, forma ${favFormWins}/${favFormTotal}` : ""}${favSurfacePct != null ? `, ${surface} ${favSurfacePct}%` : ""} — sistem traži da preseče set bez preokreta.`,
    criteria: [
      {
        label: "Rang jaz ≥ 50 mesta",
        status: rankGap == null ? "unknown" : rankGap >= 50 ? "pass" : "fail",
        detail: rankGap == null ? "nemamo oba ATP ranga" : `trenutno ${rankGap}`,
      },
      {
        label: "Dominacija na podlozi (≥70% pobeda)",
        status: favSurfacePct == null || favSurfaceMatches < 10 ? "unknown" : favSurfacePct >= 70 ? "pass" : "fail",
        detail:
          favSurfacePct == null
            ? "nema mečeva na ovoj podlozi"
            : favSurfaceMatches < 10
            ? `samo ${favSurfaceMatches} mečeva (${favSurfacePct}%)`
            : `${favSurfacePct}% (${fav.surfaceRecord[surface].wins}-${fav.surfaceRecord[surface].losses})`,
      },
      {
        label: "Forma ≥ 8 pobeda u poslednjih 10",
        status: favFormWins == null || favFormTotal < 5 ? "unknown" : favFormWins >= 8 ? "pass" : "fail",
        detail: favFormWins == null ? "nema skorašnjih mečeva" : `${favFormWins}/${favFormTotal} pobeda`,
      },
      {
        label: "Kvota daje edge (model > tržište)",
        status: edgeFav == null ? "unknown" : edgeFav > 0 ? "pass" : "fail",
        detail: edgeFav == null ? "unesi kvote" : `${edgeFav > 0 ? "+" : ""}${(edgeFav * 100).toFixed(1)}pp na meč-pobednika`,
      },
    ],
    needsOdds: false,
  };

  // --- Top-Down Value (de-vig + Kelly): naša osnovna strategija, traži kvote ---
  const valueSuit = hasOdds ? clamp01(Math.abs(edgeFav!) / 0.08) : 0.12;
  const valueSide: "A" | "B" = edgeFav != null && edgeFav < 0 ? (favIsA ? "B" : "A") : favSide;
  const valuePick = valueSide === "A" ? a : b;
  const value: StrategyEval = {
    id: "value",
    name: "Top-Down Value (de-vig + Kelly)",
    family: "value",
    market: "Pobednik meča (value na stranu sa edge-om)",
    typicalOdds: "bilo koja sa +EV",
    variance: "high",
    suitability: Math.round(valueSuit * 100),
    side: hasOdds ? valueSide : null,
    pickName: hasOdds ? valuePick.name : null,
    rationale: hasOdds
      ? `Model vidi edge od ${Math.abs(edgeFav! * 100).toFixed(1)}pp na ${valuePick.name} u odnosu na de-vig tržišnu kvotu.`
      : "Unesi kvote sa kladionice — ova strategija je čista matematika edge-a i bez kvota ne može da se izračuna.",
    criteria: [
      { label: "Unete kvote (za de-vig fer kvotu)", status: hasOdds ? "pass" : "fail", detail: hasOdds ? "da" : "nedostaju" },
      {
        label: "Pozitivan EV (edge > 2pp)",
        status: edgeFav == null ? "unknown" : Math.abs(edgeFav) * 100 > 2 ? "pass" : "fail",
        detail: edgeFav == null ? "unesi kvote" : `edge ${(Math.abs(edgeFav) * 100).toFixed(1)}pp`,
      },
      { label: "Ulog po ¼-Kelly", status: "pass", detail: "računa se iz bankrolla" },
    ],
    needsOdds: true,
  };

  // --- Sistem 20.0: bar jedan set + prvi set Over 7.5 gemova (niska varijansa banker) ---
  const sistem20Suit = clamp01((pFav - 0.58) / 0.3);
  const sistem20: StrategyEval = {
    id: "sistem20",
    name: "Sistem 20.0 — bar jedan set + prvi set Over 7.5",
    family: "akumulator",
    market: "Favorit osvaja bar 1 set + prvi set preko 7.5 gemova",
    typicalOdds: "1.19–1.27 × ~1.05 (kombinacija)",
    variance: "low",
    suitability: Math.round(sistem20Suit * 100),
    side: favSide,
    pickName: fav.name,
    rationale: `„${fav.name} osvaja bar 1 set" je vrlo verovatno kad postoji jasan favorit (model ${(pFav * 100).toFixed(0)}%); „prvi set Over 7.5 gemova" je skoro uvek prolazan. Niska varijansa, mala kvota.`,
    criteria: [
      {
        label: "Postoji jasan favorit (za bar 1 set)",
        status: pFav >= 0.6 ? "pass" : pFav >= 0.52 ? "unknown" : "fail",
        detail: `model ${(pFav * 100).toFixed(0)}%`,
      },
      { label: "Prvi set Over 7.5 gemova (bazno ~95%+)", status: "pass", detail: "statistički skoro uvek prolazi" },
    ],
    needsOdds: false,
  };

  // --- Preskoči meč: najbolje kad nema jasnog favorita ni edge-a ---
  const coin = clamp01(1 - Math.abs(pFav - 0.5) / 0.14);
  const noEdge = hasOdds ? clamp01(1 - Math.abs(edgeFav!) / 0.05) : 0.7;
  const skipSuit = clamp01(coin * noEdge);
  const skip: StrategyEval = {
    id: "skip",
    name: "Preskoči meč — sačuvaj ulog",
    family: "value",
    market: "Ne igraj ništa",
    typicalOdds: "—",
    variance: "low",
    suitability: Math.round(skipSuit * 100),
    side: null,
    pickName: null,
    rationale:
      skipSuit > 0.5
        ? "Meč je blizu bacanja novčića i bez jasnog edge-a — disciplinovano je preskočiti. Bolje ništa nego loš tiket."
        : "Postoji ugao za igru; preskakanje nije prioritet ovde.",
    criteria: [
      { label: "Meč blizu 50/50", status: coin > 0.5 ? "pass" : "fail", detail: `model favorit ${(pFav * 100).toFixed(0)}%` },
      { label: "Nema jasnog edge-a", status: hasOdds ? (Math.abs(edgeFav!) * 100 < 3 ? "pass" : "fail") : "unknown", detail: hasOdds ? `${(Math.abs(edgeFav!) * 100).toFixed(1)}pp` : "unesi kvote" },
    ],
    needsOdds: false,
  };

  const supported = [sistem88, value, sistem20, skip].sort((x, y) => y.suitability - x.suitability);
  const recommendedId = supported[0].id;

  const unsupported: UnsupportedStrategy[] = [
    {
      name: "WTA treći set — Under 9.5 gemova (live)",
      family: "live",
      market: "Treći set Under 9.5 gemova (uživo)",
      reason: "Traži WTA meč i live praćenje po gemu (mi pokrivamo ATP pojedinačno, pre-match).",
      needs: "WTA feed + live rezultat po gemu",
    },
    {
      name: "Betfair trejding — skalping / greening up",
      family: "trejding",
      market: "Back/Lay na Betfair berzi u toku meča",
      reason: "Traži Betfair berzu i poen-po-poen live tok za zaključavanje profita.",
      needs: "Betfair Exchange API + live point-by-point",
    },
    {
      name: "BODMAS — stoni tenis (Over/Under poena)",
      family: "pre-match",
      market: "Ukupno poena Over/Under (stoni tenis)",
      reason: "Drugi sport — mi imamo tenis, ne stoni tenis.",
      needs: "podaci za stoni tenis (prosek poena, H2H, setovi)",
    },
  ];

  return {
    supported,
    recommendedId,
    unsupported,
    features: {
      pFav,
      favSide,
      favName: fav.name,
      dogName: dog.name,
      eloGap: Math.round(eloGap),
      rankGap,
      favSurfaceElo,
      edgeFavPct: edgeFav != null ? edgeFav * 100 : null,
    },
  };
}
