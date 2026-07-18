import { NextRequest, NextResponse } from "next/server";
import { players } from "@/lib/ratings";
import { blendedRating, devig, expectedProb } from "@/lib/elo";
import { PERSONAS, JUDGE_MODEL, JUDGE_SYSTEM_PROMPT, SYNTHESIZER_MODEL, SYNTHESIZER_SYSTEM_PROMPT } from "@/lib/personas";
import { callModelJson, OpenRouterError } from "@/lib/openrouter";
import { findCached, saveAnalysis } from "@/lib/analysesCache";
import { createClient } from "@/lib/supabase/server";
import type { PredictRequest, PredictResponse, PersonaResult, JudgeResult, FinalVerdict } from "@/lib/predictTypes";

export async function POST(req: NextRequest) {
  let body: PredictRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON u telu zahteva." }, { status: 400 });
  }

  const { playerAName, playerBName, surface, oddsA, oddsB } = body;
  // Izbor agenata: ako je prosleđena lista, zovemo samo njih (jeftinije i brže).
  const wanted = Array.isArray((body as { personas?: string[] }).personas) ? (body as { personas?: string[] }).personas! : null;
  const activePersonas = wanted && wanted.length > 0 ? PERSONAS.filter((p) => wanted.includes(p.id)) : PERSONAS;
  const partial = activePersonas.length !== PERSONAS.length;
  const playerA = players.find((p) => p.name === playerAName);
  const playerB = players.find((p) => p.name === playerBName);
  if (!playerA || !playerB) {
    return NextResponse.json({ error: "Igrač nije pronađen u bazi rejtinga." }, { status: 400 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY nije podešen na serveru. Dodaj ga u .env.local i restartuj dev server." },
      { status: 503 }
    );
  }

  // Keš: samo za pun konzilijum — delimičan izbor agenata se uvek računa iznova.
  if (!partial) {
    const cached = await findCached("council", playerA.name, playerB.name, surface);
    if (cached) {
      return NextResponse.json({ ...(cached.payload as PredictResponse), cached: true, cachedAt: cached.createdAt });
    }
  }

  const ra = blendedRating(playerA, surface);
  const rb = blendedRating(playerB, surface);
  const modelPA = expectedProb(ra, rb);

  let marketNote = "Kvote nisu unete — nema tržišnog poređenja.";
  if (oddsA && oddsB && oddsA > 1 && oddsB > 1) {
    const { pA, pB, overroundPct } = devig(oddsA, oddsB);
    marketNote = `Unete kvote: ${playerA.name} @ ${oddsA}, ${playerB.name} @ ${oddsB}. De-vig tržišna verovatnoća: ${playerA.name} ${(pA * 100).toFixed(1)}%, ${playerB.name} ${(pB * 100).toFixed(1)}% (marža kladionice ${overroundPct.toFixed(2)}%).`;
  }

  const matchContext = `MEČ: ${playerA.name} (A) protiv ${playerB.name} (B), podloga: ${surface}.

Elo rejtinzi (naš sopstveni model, treniran na ~12.300 stvarnih ATP mečeva 2022-2026):
- ${playerA.name}: ukupno ${playerA.elo}, ${surface} ${playerA.surfaceElo[surface] ?? "N/A"}, odigrano ${playerA.matches} mečeva u periodu.
- ${playerB.name}: ukupno ${playerB.elo}, ${surface} ${playerB.surfaceElo[surface] ?? "N/A"}, odigrano ${playerB.matches} mečeva u periodu.
- Blendovani (50% ukupno + 50% podloga) Elo model daje: ${playerA.name} ${(modelPA * 100).toFixed(1)}% šanse za pobedu, ${playerB.name} ${((1 - modelPA) * 100).toFixed(1)}%.

${marketNote}

VAŽNO — realan track record ovog Elo modela: u walk-forward backtestu protiv Pinnacle zatvarajućih kvota, model bira favorita sa ~64% tačnošću ali gubi ROI protiv tržišta (nema dokazan edge u trenutnoj verziji). Uzmi ovo u obzir — ne tretiraj Elo brojeve kao nepogrešive.`;

  try {
    const personaResults: PersonaResult[] = await Promise.all(
      activePersonas.map(async (persona) => {
        try {
          const parsed = await callModelJson<{ pick: "A" | "B"; confidence: number; stake: PersonaResult["stake"]; reasoning: string }>({
            model: persona.model,
            systemPrompt: persona.systemPrompt,
            userPrompt: matchContext,
            temperature: persona.temperature,
          });
          return { id: persona.id, name: persona.name, model: persona.model, ...parsed };
        } catch (err) {
          return {
            id: persona.id,
            name: persona.name,
            model: persona.model,
            pick: "A" as const,
            confidence: 0,
            stake: "none" as const,
            reasoning: "",
            error: err instanceof OpenRouterError ? err.message : "Nepoznata greška.",
          };
        }
      })
    );

    const usablePersonas = personaResults.filter((p) => !p.error);
    const judgeUserPrompt = `${matchContext}\n\nMišljenja analitičara:\n${usablePersonas
      .map((p) => `- ${p.name} (${p.model}): pick ${p.pick === "A" ? playerA.name : playerB.name}, poverenje ${p.confidence}%, ulog "${p.stake}". Obrazloženje: ${p.reasoning}`)
      .join("\n")}`;

    // Sudija i finale imaju smisla tek kad ima šta da se poredi — sa jednim agentom se preskaču
    // (nema kontradikcija ni vaganja mišljenja), pa se ne troši kredit bez potrebe.
    const needsJudging = usablePersonas.length >= 2;

    let judge: JudgeResult = { scores: [], contradictions: [] };
    if (needsJudging) {
      try {
        judge = await callModelJson<JudgeResult>({
          model: JUDGE_MODEL,
          systemPrompt: JUDGE_SYSTEM_PROMPT,
          userPrompt: judgeUserPrompt,
          temperature: 0.2,
        });
      } catch (err) {
        judge = { scores: [], contradictions: [], error: err instanceof OpenRouterError ? err.message : "Nepoznata greška." };
      }
    }

    const synthesizerUserPrompt = `${judgeUserPrompt}\n\nOcene sudije:\n${JSON.stringify(judge)}`;

    let final: FinalVerdict;
    if (!needsJudging) {
      // Jedan agent = njegov stav JE zaključak; ne izmišljamo "sintezu" jednog mišljenja.
      const only = usablePersonas[0];
      final = only
        ? {
            finalPick: only.pick,
            confidence: only.confidence,
            staking: only.stake,
            keyFactors: [`Mišljenje samo jednog analitičara (${only.name}) — nema unakrsne provere.`],
            narrative: only.reasoning,
          }
        : { finalPick: "A", confidence: 0, staking: "none", keyFactors: [], narrative: "", error: "Nijedan agent nije uspeo." };
    } else {
      try {
        final = await callModelJson<FinalVerdict>({
          model: SYNTHESIZER_MODEL,
          systemPrompt: SYNTHESIZER_SYSTEM_PROMPT,
          userPrompt: synthesizerUserPrompt,
          temperature: 0.4,
        });
      } catch (err) {
        final = {
          finalPick: "A",
          confidence: 0,
          staking: "none",
          keyFactors: [],
          narrative: "",
          error: err instanceof OpenRouterError ? err.message : "Nepoznata greška.",
        };
      }
    }

    const response: PredictResponse = { playerA: playerA.name, playerB: playerB.name, personas: personaResults, judge, final };

    // U arhivu ide samo pun konzilijum — delimičan izbor ne sme da zatruje keš.
    if (!partial && !final.error && personaResults.some((p) => !p.error)) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      await saveAnalysis("council", playerA.name, playerB.name, surface, response, user?.id ?? null).catch(() => {});
    }

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Nepoznata greška." }, { status: 500 });
  }
}
