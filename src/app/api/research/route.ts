import { NextRequest, NextResponse } from "next/server";
import { callModelWeb, callModelJson, OpenRouterError, type Citation } from "@/lib/openrouter";
import { RESEARCH_AGENTS, RESEARCH_SYNTH_MODEL, RESEARCH_SYNTH_SYSTEM, type ResearchAgentId } from "@/lib/researchAgents";

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
  let body: { playerA?: string; playerB?: string; surface?: string; tournament?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON." }, { status: 400 });
  }
  const { playerA, playerB, surface = "Hard", tournament = "" } = body;
  if (!playerA || !playerB) return NextResponse.json({ error: "Nedostaju imena igrača." }, { status: 400 });
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY nije podešen na serveru." }, { status: 503 });
  }

  const agents: ResearchAgentResult[] = await Promise.all(
    RESEARCH_AGENTS.map(async (agent) => {
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

  let synth: ResearchSynth;
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

  return NextResponse.json({ playerA, playerB, agents, synth });
}
