import { NextRequest, NextResponse } from "next/server";
import { callModelWeb, callModelJson, OpenRouterError, type Citation } from "@/lib/openrouter";
import { RESEARCH_AGENTS, RESEARCH_SYNTH_MODEL, RESEARCH_SYNTH_SYSTEM, type ResearchAgentId } from "@/lib/researchAgents";
import { findCached, saveAnalysis } from "@/lib/analysesCache";
import { createClient } from "@/lib/supabase/server";

export type ResearchAgentResult = {
  id: ResearchAgentId;
  name: string;
  model: string;
  content: string;
  citations: Citation[];
  error?: string;
};

export type ResearchSynth = {
  headline: string;
  signals: string[];
  risk: "low" | "medium" | "high";
  recommendation: string;
  error?: string;
};

export async function POST(req: NextRequest) {
  let body: { playerA?: string; playerB?: string; surface?: string; tournament?: string; agents?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON." }, { status: 400 });
  }
  const { playerA, playerB, surface = "Hard", tournament = "" } = body;
  // Izbor agenata: ako je prosleđena lista, pretražuje samo ona (svaka pretraga košta).
  const wanted = Array.isArray(body.agents) && body.agents.length > 0 ? body.agents : null;
  const activeAgents = wanted ? RESEARCH_AGENTS.filter((a) => wanted.includes(a.id)) : RESEARCH_AGENTS;
  const partial = activeAgents.length !== RESEARCH_AGENTS.length;
  if (!playerA || !playerB) return NextResponse.json({ error: "Nedostaju imena igrača." }, { status: 400 });
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY nije podešen na serveru." }, { status: 503 });
  }

  // Keš: samo za pun set agenata — delimičan izbor se uvek radi iznova.
  if (!partial) {
    const cached = await findCached("research", playerA, playerB, surface);
    if (cached) {
      return NextResponse.json({ ...(cached.payload as object), cached: true, cachedAt: cached.createdAt });
    }
  }

  const agents: ResearchAgentResult[] = await Promise.all(
    activeAgents.map(async (agent) => {
      try {
        const { content, citations } = await callModelWeb({
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          userPrompt: agent.buildPrompt(playerA, playerB, surface, tournament),
          maxResults: agent.maxResults,
        });
        return { id: agent.id, name: agent.name, model: agent.model, content, citations };
      } catch (err) {
        return {
          id: agent.id,
          name: agent.name,
          model: agent.model,
          content: "",
          citations: [],
          error: err instanceof OpenRouterError ? err.message : "Nepoznata greška.",
        };
      }
    })
  );

  const usable = agents.filter((a) => !a.error && a.content);
  const synthPrompt = `Meč: ${playerA} vs ${playerB} (${surface}${tournament ? `, ${tournament}` : ""}).\n\nIzveštaji agenata:\n${usable
    .map((a) => `### ${a.name}\n${a.content}`)
    .join("\n\n")}`;

  // Sinteza spaja više izveštaja — sa jednim agentom nema šta da se spaja, pa se preskače.
  let synth: ResearchSynth = { headline: "", signals: [], risk: "medium", recommendation: "" };
  if (usable.length >= 2) {
    try {
      synth = await callModelJson<ResearchSynth>({
        model: RESEARCH_SYNTH_MODEL,
        systemPrompt: RESEARCH_SYNTH_SYSTEM,
        userPrompt: synthPrompt,
        temperature: 0.3,
      });
    } catch (err) {
      synth = {
        headline: "",
        signals: [],
        risk: "high",
        recommendation: "",
        error: err instanceof OpenRouterError ? err.message : "Nepoznata greška.",
      };
    }
  } else if (usable.length === 1) {
    synth = {
      headline: `Izveštaj samo od jednog agenta (${usable[0].name}) — bez unakrsne provere.`,
      signals: [],
      risk: "medium",
      recommendation: "Pokreni i ostale agente ako ti treba potpuna slika.",
    };
  }

  const response = { playerA, playerB, surface, agents, synth };

  // U arhivu ide samo pun set agenata — delimičan izbor ne sme da zatruje keš.
  if (!partial && !synth.error && usable.length > 0) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await saveAnalysis("research", playerA, playerB, surface, response, user?.id ?? null).catch(() => {});
  }

  return NextResponse.json(response);
}
