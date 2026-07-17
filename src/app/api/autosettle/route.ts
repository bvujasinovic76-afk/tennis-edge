import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFixturesSmart } from "@/lib/fixturesSmart";
import { buildPlayerIndex, matchFullName } from "@/lib/nameMatch";
import { players } from "@/lib/ratings";

/**
 * Automatsko obeležavanje tiketa: povuče završene ATP mečeve (ESPN) i za svaki
 * tvoj tiket "u toku" proveri da li je meč gotov — pa ga sam obeleži kao dobitak/gubitak.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });

  const { data: pending, error } = await supabase
    .from("bets")
    .select("id, match_label, pick, legs")
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending || pending.length === 0) {
    return NextResponse.json({ settled: [], message: "Nema tiketa u toku." });
  }

  let finished;
  try {
    ({ finished } = await fetchFixturesSmart());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Izvor rezultata nedostupan." }, { status: 502 });
  }
  if (finished.length === 0) {
    return NextResponse.json({ settled: [], message: "Trenutno nema završenih mečeva u feed-u (pokriva aktuelne turnire)." });
  }

  // Prevedi ESPN puna imena ("Jannik Sinner") u naš "Sinner J." format.
  const index = buildPlayerIndex(players);
  const finishedMapped = finished
    .map((m) => ({
      home: matchFullName(m.homeName, index)?.name ?? null,
      away: matchFullName(m.awayName, index)?.name ?? null,
      winner: matchFullName(m.winnerName, index)?.name ?? null,
      tournament: m.tournament,
    }))
    .filter((m) => m.home && m.away && m.winner);

  /** Nađi pobednika za "Igrač A vs Igrač B" ili "Igrač A - Igrač B" (sa slike). */
  function winnerOf(label: string): string | null {
    const m = label.match(/^(.+?)\s+(?:vs|-)\s+(.+?)(?:\s*\(|$)/);
    if (!m) return null;
    const a = m[1].trim();
    const b = m[2].trim().replace(/\s*·.*$/, "");
    const f = finishedMapped.find((x) => (x.home === a && x.away === b) || (x.home === b && x.away === a));
    return f?.winner ?? null;
  }

  const settled: { id: string; pick: string; matchLabel: string; result: "won" | "lost" }[] = [];

  for (const bet of pending) {
    const legs = Array.isArray(bet.legs) ? (bet.legs as { match: string; pick: string; odds: number; result?: string }[]) : null;

    // --- KOMBINACIJA: tiket pada ako BILO KOJI par padne; prolazi tek kad SVI parovi prođu. ---
    if (legs && legs.length >= 2) {
      const resolved = legs.map((l) => {
        const w = winnerOf(l.match);
        if (!w) return { ...l, result: "pending" as const };
        return { ...l, result: (w === l.pick ? "won" : "lost") as "won" | "lost" };
      });
      const anyLost = resolved.some((l) => l.result === "lost");
      const allWon = resolved.every((l) => l.result === "won");
      if (!anyLost && !allWon) {
        // Bar jedan par još nije odigran — samo upiši međurezultate parova.
        await supabase.from("bets").update({ legs: resolved }).eq("id", bet.id).eq("user_id", user.id);
        continue;
      }
      const result: "won" | "lost" = anyLost ? "lost" : "won";
      const { error: upErr } = await supabase
        .from("bets")
        .update({ status: result, legs: resolved, settled_at: new Date().toISOString() })
        .eq("id", bet.id)
        .eq("user_id", user.id);
      if (!upErr) settled.push({ id: bet.id, pick: bet.pick, matchLabel: bet.match_label, result });
      continue;
    }

    // --- SINGL tiket ---
    const w = winnerOf(bet.match_label);
    if (!w) continue;
    const result: "won" | "lost" = w === bet.pick ? "won" : "lost";
    const { error: upErr } = await supabase
      .from("bets")
      .update({ status: result, settled_at: new Date().toISOString() })
      .eq("id", bet.id)
      .eq("user_id", user.id);
    if (!upErr) settled.push({ id: bet.id, pick: bet.pick, matchLabel: bet.match_label, result });
  }

  return NextResponse.json({
    settled,
    checkedPending: pending.length,
    finishedAvailable: finishedMapped.length,
    message:
      settled.length > 0
        ? `Obeleženo ${settled.length} od ${pending.length} tiketa.`
        : `Nijedan od ${pending.length} tiketa u toku se ne poklapa sa završenim mečevima (feed pokriva aktuelne turnire).`,
  });
}
