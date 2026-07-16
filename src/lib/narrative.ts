import type { Player, Surface } from "./elo";
import { blendedRating, expectedProb, devig } from "./elo";

// Deterministički generator analize na srpskom — čita se kao ljudski analitičar,
// a računa se lokalno iz podataka koje već imamo (0 API kredita, radi i na Vercelu).

const SURFACE_LOC: Record<Surface, string> = { Hard: "tvrdoj podlozi", Clay: "šljaci", Grass: "travi" };

export type ComparisonRow = { label: string; a: string; b: string; better: "A" | "B" | null };

export type MatchNarrative = {
  paragraphs: string[];
  verdict: string;
  favSide: "A" | "B";
  pFav: number;
  rows: ComparisonRow[];
};

/** Opis forme bez imena — rečenica se sklapa u buildNarrative da red reči ostane prirodan. */
function formPhrase(p: Player): string | null {
  const t = p.form?.total ?? 0;
  if (t === 0) return null;
  const w = p.form.wins;
  const rec = `${w}-${t - w} u poslednjih ${t}`;
  if (w >= 8) return `u sjajnoj formi (${rec})`;
  if (w >= 6) return `u dobroj formi (${rec})`;
  if (w >= 4) return `u promenljivoj formi (${rec})`;
  return `u padu forme (${rec})`;
}

function surfaceDesc(p: Player, surface: Surface): string {
  const rec = p.surfaceRecord?.[surface];
  if (!rec || rec.wins + rec.losses === 0) return `${p.name} nema istoriju na ovoj podlozi u bazi`;
  let s = `${p.name} na ${SURFACE_LOC[surface]} beleži ${rec.wins}-${rec.losses} (${rec.pct}%)`;

  // Da li mu je ovo najjača/najslabija podloga — poredimo % pobeda između NJEGOVIH podloga
  // (surface Elo vs ukupni Elo nije fer poređenje jer surface Elo raste sporije).
  const entries = Object.entries(p.surfaceRecord ?? {}).filter(([, r]) => r.wins + r.losses >= 10);
  if (entries.length >= 2 && rec.wins + rec.losses >= 10) {
    const best = Math.max(...entries.map(([, r]) => r.pct));
    const worst = Math.min(...entries.map(([, r]) => r.pct));
    if (rec.pct === best && best - worst >= 5) s += " — statistički mu je ovo najjača podloga";
    else if (rec.pct === worst && best - worst >= 5) s += " — istorijski mu najslabija podloga";
  }
  return s;
}

function fmtForm(p: Player): string {
  const t = p.form?.total ?? 0;
  return t ? `${p.form.wins}-${t - p.form.wins}` : "—";
}

function fmtSurfacePct(p: Player, surface: Surface): string {
  const rec = p.surfaceRecord?.[surface];
  if (!rec || rec.wins + rec.losses === 0) return "—";
  return `${rec.pct}% (${rec.wins}-${rec.losses})`;
}

export function buildNarrative(a: Player, b: Player, surface: Surface, oddsA?: number, oddsB?: number): MatchNarrative {
  const ra = blendedRating(a, surface);
  const rb = blendedRating(b, surface);
  const favIsA = ra >= rb;
  const fav = favIsA ? a : b;
  const dog = favIsA ? b : a;
  const pFav = favIsA ? expectedProb(ra, rb) : expectedProb(rb, ra);
  const pct = Math.round(pFav * 100);

  const paragraphs: string[] = [];

  // 1) Uvod — ko je favorit i koliko.
  if (pFav >= 0.75) {
    paragraphs.push(`${fav.name} ulazi u meč kao ubedljivi favorit — model mu daje ${pct}% šanse protiv ${dog.name} na ${SURFACE_LOC[surface]}.`);
  } else if (pFav >= 0.62) {
    paragraphs.push(`${fav.name} je jasan favorit: model mu daje ${pct}% šanse protiv ${dog.name} na ${SURFACE_LOC[surface]}.`);
  } else if (pFav >= 0.55) {
    paragraphs.push(`${fav.name} je blagi favorit (${pct}% : ${100 - pct}%) — razlika je mala i meč je otvoren.`);
  } else {
    paragraphs.push(`Meč bez jasnog favorita: model ga gleda ${pct}% : ${100 - pct}% — praktično bacanje novčića.`);
  }

  // 2) Forma.
  const phraseA = formPhrase(a);
  const phraseB = formPhrase(b);
  let formP: string;
  if (phraseA && phraseB) formP = `${a.name} je ${phraseA}, dok je ${b.name} ${phraseB}.`;
  else if (phraseA) formP = `${a.name} je ${phraseA}; za ${b.name} nemamo skorašnje mečeve u bazi.`;
  else if (phraseB) formP = `${b.name} je ${phraseB}; za ${a.name} nemamo skorašnje mečeve u bazi.`;
  else formP = `Za oba igrača nemamo skorašnje mečeve u bazi — formu proveri kroz Istraživanje.`;
  const favFormW = fav.form?.total ? fav.form.wins : null;
  const dogFormW = dog.form?.total ? dog.form.wins : null;
  if (favFormW != null && dogFormW != null && dogFormW - favFormW >= 2) {
    formP += ` Upozorenje: baš favorit je taj koji dolazi u slabijoj formi.`;
  }
  paragraphs.push(formP);

  // 3) Podloga.
  paragraphs.push(`${surfaceDesc(a, surface)}. ${surfaceDesc(b, surface)}.`);

  // 4) Rang.
  if (a.atpRank != null && b.atpRank != null) {
    const gap = Math.abs(a.atpRank - b.atpRank);
    let rankP = `Na ATP listi ih deli ${gap} ${gap === 1 ? "mesto" : "mesta"} (#${a.atpRank} protiv #${b.atpRank}).`;
    if (gap >= 50) rankP += " Toliki jaz obično znači i realnu razliku u klasi.";
    else if (gap <= 10) rankP += " Po rangu su praktično ravnopravni.";
    paragraphs.push(rankP);
  }

  // 5) Tržište (samo ako su unete kvote).
  if (oddsA && oddsB && oddsA > 1 && oddsB > 1) {
    const { pA: mA } = devig(oddsA, oddsB);
    const marketPFav = favIsA ? mA : 1 - mA;
    const edge = (pFav - marketPFav) * 100;
    const mPct = Math.round(marketPFav * 100);
    if (Math.abs(edge) <= 2) {
      paragraphs.push(`Kvote se skoro poklapaju sa modelom (tržište: ${mPct}%, model: ${pct}%) — nema value-a ni na jednoj strani.`);
    } else if (edge > 2) {
      paragraphs.push(`Tržište daje ${fav.name} ${mPct}%, a model ${pct}% — value je na favoritu (+${edge.toFixed(1)}pp).`);
    } else {
      paragraphs.push(`Kladionice precenjuju favorita: model mu daje ${pct}%, a kvota implicira ${mPct}%. Ako se igra, matematika kaže ${dog.name} (+${Math.abs(edge).toFixed(1)}pp).`);
    }
  }

  // Zaključak — koliko se signala poklapa za favorita.
  let signals = 0;
  if (pFav >= 0.68) signals++;
  if (favFormW != null && (fav.form?.total ?? 0) >= 5 && favFormW >= 8) signals++;
  const favSurf = fav.surfaceRecord?.[surface];
  if (favSurf && favSurf.wins + favSurf.losses >= 10 && favSurf.pct >= 70) signals++;
  if (a.atpRank != null && b.atpRank != null && Math.abs(a.atpRank - b.atpRank) >= 50) signals++;

  let verdict: string;
  if (pFav < 0.58) {
    verdict = `Zaključak: previše neizvesnosti — ovo je meč za preskočiti, ili minimalni ulog ako baš mora.`;
  } else if (signals >= 3) {
    verdict = `Zaključak: gotovo sve se poklapa za ${fav.name} — klasa, forma i podloga pričaju istu priču. Pitanje nije "ko", nego da li kvota nudi vrednost.`;
  } else if (signals === 2) {
    verdict = `Zaključak: većina signala je na strani ${fav.name}, ali ne svi — umeren pristup i manji ulog imaju smisla.`;
  } else {
    verdict = `Zaključak: ${fav.name} jeste favorit po brojevima, ali signali se ne poklapaju dovoljno (forma/podloga/rang) — oprez.`;
  }

  // Uporedna tabela.
  const surfA = a.surfaceRecord?.[surface];
  const surfB = b.surfaceRecord?.[surface];
  const rows: ComparisonRow[] = [
    {
      label: "ATP rang",
      a: a.atpRank != null ? `#${a.atpRank}` : "—",
      b: b.atpRank != null ? `#${b.atpRank}` : "—",
      better: a.atpRank != null && b.atpRank != null ? (a.atpRank < b.atpRank ? "A" : a.atpRank > b.atpRank ? "B" : null) : null,
    },
    { label: "Elo (ukupno)", a: String(a.elo), b: String(b.elo), better: a.elo > b.elo ? "A" : a.elo < b.elo ? "B" : null },
    {
      label: "Elo na podlozi",
      a: a.surfaceElo[surface] != null ? String(a.surfaceElo[surface]) : "—",
      b: b.surfaceElo[surface] != null ? String(b.surfaceElo[surface]) : "—",
      better:
        a.surfaceElo[surface] != null && b.surfaceElo[surface] != null
          ? a.surfaceElo[surface] > b.surfaceElo[surface] ? "A" : a.surfaceElo[surface] < b.surfaceElo[surface] ? "B" : null
          : null,
    },
    {
      label: "% pobeda na podlozi",
      a: fmtSurfacePct(a, surface),
      b: fmtSurfacePct(b, surface),
      better: surfA && surfB ? (surfA.pct > surfB.pct ? "A" : surfA.pct < surfB.pct ? "B" : null) : null,
    },
    {
      label: "Forma (poslednjih 10)",
      a: fmtForm(a),
      b: fmtForm(b),
      better:
        (a.form?.total ?? 0) > 0 && (b.form?.total ?? 0) > 0
          ? a.form.wins > b.form.wins ? "A" : a.form.wins < b.form.wins ? "B" : null
          : null,
    },
    { label: "Mečeva u bazi", a: String(a.matches), b: String(b.matches), better: null },
  ];

  return { paragraphs, verdict, favSide: favIsA ? "A" : "B", pFav, rows };
}
