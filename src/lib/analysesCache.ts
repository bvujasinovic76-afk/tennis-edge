import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

// Keš AI analiza u Supabase — servisni klijent (server-only) da keš važi globalno,
// pa se isti meč ne plaća dvaput bez obzira na to ko ga je prvi pokrenuo.
const CACHE_TTL_HOURS = 24;

let service: SupabaseClient | null = null;

function getService(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!service) service = createServiceClient(url, key, { auth: { persistSession: false } });
  return service;
}

export type AnalysisKind = "council" | "research";

/** Vraća svežu keširanu analizu za isti par (bilo koji redosled) + podlogu, ili null. */
export async function findCached(kind: AnalysisKind, playerA: string, playerB: string, surface: string): Promise<{ payload: unknown; createdAt: string } | null> {
  const sb = getService();
  if (!sb) return null;
  const since = new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString();
  const { data } = await sb
    .from("analyses")
    .select("payload, created_at")
    .eq("kind", kind)
    .eq("surface", surface)
    .gte("created_at", since)
    .or(`and(player_a.eq.${playerA},player_b.eq.${playerB}),and(player_a.eq.${playerB},player_b.eq.${playerA})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { payload: data.payload, createdAt: data.created_at };
}

/** Snima uspešnu analizu u arhivu (user_id opciono — i anonimne pune globalni keš). */
export async function saveAnalysis(kind: AnalysisKind, playerA: string, playerB: string, surface: string, payload: unknown, userId: string | null): Promise<void> {
  const sb = getService();
  if (!sb) return;
  await sb.from("analyses").insert({ kind, player_a: playerA, player_b: playerB, surface, payload, user_id: userId });
}
