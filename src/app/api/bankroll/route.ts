import { NextRequest, NextResponse } from "next/server";
import { computeStats } from "@/lib/bankroll";
import { createClient } from "@/lib/supabase/server";
import { loadState } from "@/lib/bankrollDb";

async function stateResponse(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const state = await loadState(supabase, userId);
  return NextResponse.json({ state, stats: computeStats(state) });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });
  return stateResponse(supabase, user.id);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON." }, { status: 400 });
  }

  const action = body.action as string;
  try {
    switch (action) {
      case "setBankroll": {
        const amount = Number(body.startingBankroll);
        if (!(amount > 0)) return NextResponse.json({ error: "Bankroll mora biti pozitivan broj." }, { status: 400 });
        const patch: Record<string, unknown> = { id: user.id, starting_bankroll: amount };
        if (body.kellyMultiplier != null) patch.kelly_multiplier = Number(body.kellyMultiplier);
        const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "id" });
        if (error) throw error;
        break;
      }
      case "addBet": {
        const { matchLabel, pick, odds, stake, modelProb } = body as {
          matchLabel: string; pick: string; odds: number; stake: number; modelProb: number;
        };
        if (!matchLabel || !pick || !(Number(odds) > 1) || !(Number(stake) > 0)) {
          return NextResponse.json({ error: "Nedostaju validni podaci o tiketu (par, pick, kvota > 1, ulog > 0)." }, { status: 400 });
        }
        const { error } = await supabase.from("bets").insert({
          user_id: user.id,
          match_label: matchLabel,
          pick,
          odds: Number(odds),
          stake: Number(stake),
          model_prob: Number(modelProb) || 0,
        });
        if (error) throw error;
        break;
      }
      case "settleBet": {
        const status = body.status as "won" | "lost" | "void";
        if (!["won", "lost", "void"].includes(status)) return NextResponse.json({ error: "Nepoznat status." }, { status: 400 });
        const { error } = await supabase.from("bets").update({ status, settled_at: new Date().toISOString() }).eq("id", String(body.id)).eq("user_id", user.id);
        if (error) throw error;
        break;
      }
      case "deleteBet": {
        const { error } = await supabase.from("bets").delete().eq("id", String(body.id)).eq("user_id", user.id);
        if (error) throw error;
        break;
      }
      case "reset": {
        const { error: e1 } = await supabase.from("bets").delete().eq("user_id", user.id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("profiles").upsert({ id: user.id, starting_bankroll: 10000, kelly_multiplier: 0.25, currency: "RSD" }, { onConflict: "id" });
        if (e2) throw e2;
        break;
      }
      default:
        return NextResponse.json({ error: "Nepoznata akcija." }, { status: 400 });
    }
    return stateResponse(supabase, user.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Greška." }, { status: 500 });
  }
}
