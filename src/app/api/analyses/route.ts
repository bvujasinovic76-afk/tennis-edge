import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Arhiva prijavljenog korisnika — poslednjih 20 analiza (RLS: vidi samo svoje). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });

  const { data, error } = await supabase
    .from("analyses")
    .select("id, kind, player_a, player_b, surface, payload, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ analyses: data ?? [] });
}
