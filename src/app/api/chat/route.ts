import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeStats } from "@/lib/bankroll";
import { loadState } from "@/lib/bankrollDb";
import { systemBacktest } from "@/lib/systemBacktest";

// Jeftin model sa podrškom za alate — chat se koristi često, pa cena mora biti niska.
const CHAT_MODEL = "deepseek/deepseek-v4-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOOL_ROUNDS = 5;

type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "dohvati_plan",
      description: "Vraća današnji dnevni listić — parove koje app predlaže za danas, sa kvotama i ulozima.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "dohvati_bankroll",
      description: "Vraća trenutni bankroll, profit/gubitak, ROI i listu aktivnih (nezavršenih) tiketa.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "dodaj_tiket",
      description: "Upisuje tiket koji je korisnik odigrao. Za kombinaciju prosledi legs (svi parovi) — kombinacija je JEDAN tiket i pada ako bilo koji par padne.",
      parameters: {
        type: "object",
        properties: {
          opis: { type: "string", description: "Npr. 'Rublev A. vs Baez S. (Clay)' ili 'Kombinacija 3 para'" },
          pick: { type: "string", description: "Na koga/šta je igrao" },
          kvota: { type: "number", description: "Ukupna kvota tiketa" },
          ulog: { type: "number", description: "Ulog u RSD" },
          ishod: { type: "string", enum: ["pending", "won", "lost"], description: "pending ako meč još nije odigran" },
          legs: {
            type: "array",
            description: "Samo za kombinacije: lista parova",
            items: {
              type: "object",
              properties: { match: { type: "string" }, pick: { type: "string" }, odds: { type: "number" } },
              required: ["match", "pick", "odds"],
            },
          },
        },
        required: ["opis", "pick", "kvota", "ulog"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obelezi_tiket",
      description: "Označava aktivan tiket kao dobitak ili gubitak. Prvo pozovi dohvati_bankroll da vidiš id-jeve.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "id tiketa iz dohvati_bankroll" },
          ishod: { type: "string", enum: ["won", "lost", "void"] },
        },
        required: ["id", "ishod"],
      },
    },
  },
];

function systemPrompt(): string {
  const bt = systemBacktest;
  const best = [...bt.systems].sort((a, b) => b.roiPct - a.roiPct)[0];
  const k3 = bt.systems.find((s) => s.legs === 3 && s.kind === "kombo");
  return `Ti si lični asistent u aplikaciji EDGE Tenis. Pričaš srpski, kratko i ljudski — kao drug koji se razume u brojeve, ne kao robot.

ŠTA RADIŠ:
- Kad te pitaju "šta danas igramo", pozovi dohvati_plan i predstavi parove jasno i kratko.
- Kad korisnik kaže da je odigrao tiket, pozovi dodaj_tiket i potvrdi mu šta si upisao.
- Kad kaže da je tiket prošao/pao, pozovi dohvati_bankroll da nađeš id pa obelezi_tiket.
- Sam pitaj: "jesi odigrao?", "kako je prošlo?" — ti vodiš računa o evidenciji.
- Za bankroll/profit pozovi dohvati_bankroll.

ŠTA ZNAŠ (i moraš reći iskreno kad je bitno):
- Model nema dokazan edge. Backtest na ${bt.picksTested} stvarnih mečeva: najbolji sistem "${best.name}" daje ${best.roiPct}% ROI — dakle i najbolji gubi, samo najsporije.
- Kombinacije su ubica: ${k3 ? `3 para = ${k3.roiPct}% ROI (od 10.000 ostane ${k3.finalBankroll})` : "što više parova, to gore"}, dok isti pickovi kao singlovi gube samo oko 2.4%.
- Kombinacija je JEDAN tiket: padne li jedan par, pada ceo tiket. Šansa se množi (3 para po 70% = 34%), ne sabira.
- Kvote u planu su procena dok korisnik ne unese pravu kvotu sa kladionice.

PRAVILA:
- Nikad ne obećavaj dobitak i ne kaži "siguran tiket". Ako te pita za siguran tiket, reci pošteno da ne postoji.
- Ako predlaže kombinaciju od više parova, reci mu šansu i podsetiti ga na brojke — ali ne drži pridike, on odlučuje.
- Budi kratak: 2-4 rečenice, bez markdown tabela. Koristi brojke, ne prazne fraze.
- 18+, klađenje je njegova odgovornost.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });
  if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: "OPENROUTER_API_KEY nije podešen." }, { status: 503 });

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON." }, { status: 400 });
  }
  const history = (body.messages ?? []).slice(-12); // kratka memorija = niža cena

  const origin = req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";

  // --- Alati ---
  async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === "dohvati_plan") {
      const r = await fetch(`${origin}/api/daily-plan`, { headers: { cookie } });
      const j = await r.json();
      if (j.error) return { greska: j.error };
      return {
        datum: j.date,
        parovi: (j.picks ?? []).map((p: Record<string, unknown>) => ({
          mec: `${p.playerA} vs ${p.playerB}`,
          igramo: p.pick,
          model: `${Math.round(Number(p.modelProb) * 100)}%`,
          kvota_procena: p.estOdds,
          ulog: p.stake,
          kvalitet: p.tier,
          preporuceno: p.recommended,
          pocetak: p.startTime,
        })),
      };
    }
    if (name === "dohvati_bankroll") {
      const state = await loadState(supabase, user!.id);
      const stats = computeStats(state);
      return {
        bankroll: Math.round(stats.currentBankroll),
        valuta: state.currency,
        profit: Math.round(stats.realizedPnl),
        roi: `${stats.roiPct.toFixed(1)}%`,
        odigrano: stats.settledBets,
        dobitaka: stats.wins,
        gubitaka: stats.losses,
        aktivni_tiketi: state.bets
          .filter((b) => b.status === "pending")
          .map((b) => ({ id: b.id, opis: b.matchLabel, pick: b.pick, kvota: b.odds, ulog: b.stake })),
      };
    }
    if (name === "dodaj_tiket") {
      const legs = Array.isArray(args.legs) ? (args.legs as { match: string; pick: string; odds: number }[]) : undefined;
      const r = await fetch(`${origin}/api/bankroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({
          action: "addBet",
          matchLabel: String(args.opis),
          pick: String(args.pick),
          odds: Number(args.kvota),
          stake: Number(args.ulog),
          modelProb: 0,
          source: "chat",
          status: args.ishod ?? "pending",
          legs: legs && legs.length >= 2 ? legs : undefined,
        }),
      });
      const j = await r.json();
      return j.error ? { greska: j.error } : { upisano: true, bankroll: Math.round(j.stats.currentBankroll) };
    }
    if (name === "obelezi_tiket") {
      const r = await fetch(`${origin}/api/bankroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ action: "settleBet", id: String(args.id), status: String(args.ishod) }),
      });
      const j = await r.json();
      return j.error ? { greska: j.error } : { obelezeno: true, bankroll: Math.round(j.stats.currentBankroll), profit: Math.round(j.stats.realizedPnl) };
    }
    return { greska: "Nepoznat alat." };
  }

  const messages: ChatMsg[] = [{ role: "system", content: systemPrompt() }, ...history.map((m) => ({ role: m.role as ChatMsg["role"], content: m.content }))];
  const actions: string[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tennis-edge-woad.vercel.app",
          "X-Title": "EDGE Tenis - chat",
        },
        body: JSON.stringify({ model: CHAT_MODEL, temperature: 0.4, messages, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return NextResponse.json({ error: `Model greška ${res.status}: ${t.slice(0, 160)}` }, { status: 502 });
      }
      const data = await res.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) return NextResponse.json({ error: "Model nije vratio odgovor." }, { status: 502 });

      const calls: ToolCall[] = msg.tool_calls ?? [];
      if (calls.length === 0) {
        return NextResponse.json({ reply: msg.content ?? "", actions });
      }

      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || "{}");
        } catch {
          /* prazni argumenti su ok za alate bez parametara */
        }
        const result = await runTool(c.function.name, args);
        if (c.function.name === "dodaj_tiket" && !(result as { greska?: string }).greska) actions.push(`Upisan tiket: ${args.pick} @ ${args.kvota}`);
        if (c.function.name === "obelezi_tiket" && !(result as { greska?: string }).greska) actions.push(`Tiket obeležen kao ${args.ishod === "won" ? "dobitak" : "gubitak"}`);
        messages.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: JSON.stringify(result) });
      }
    }
    return NextResponse.json({ reply: "Zapetljao sam se — probaj da pitaš jednostavnije.", actions });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Greška." }, { status: 500 });
  }
}
