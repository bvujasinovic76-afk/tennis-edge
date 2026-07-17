import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-3.1-pro-preview"; // vision + dobar na tabelarnim/odsečenim tekstom

export type ScannedLeg = { match: string; pick: string; odds: number | null };
export type ScannedTicket = {
  bookmaker: string | null;
  legs: ScannedLeg[];
  stake: number | null;
  totalOdds: number | null;
  potentialPayout: number | null;
  currency: string | null;
  notes: string | null;
};

const SYSTEM = `Ti čitaš fotografiju tiketa sa kladionice (najčešće srpske: Mozzart, Meridian, Maxbet, Soccerbet, Admiralbet, Balkanbet, Pinnbet).
Izvuci podatke tačno onako kako pišu na tiketu. Odgovaraš ISKLJUČIVO validnim JSON objektom, bez markdown ograde:
{"bookmaker": string|null, "legs": [{"match": "Igrač 1 - Igrač 2", "pick": "ime igrača ili tip koji je odigran", "odds": broj|null}], "stake": broj|null, "totalOdds": broj|null, "potentialPayout": broj|null, "currency": string|null, "notes": string|null}
Pravila:
- "legs" je lista svih parova sa tiketa (za singl tiket biće jedan).
- Brojeve vraćaj kao brojeve (1.85, ne "1,85") — decimalni zarez pretvori u tačku.
- Ako nešto ne vidiš jasno, stavi null umesto da izmišljaš. U "notes" kratko napiši šta nije bilo čitljivo.
- Ako slika NIJE tiket, vrati {"bookmaker":null,"legs":[],"stake":null,"totalOdds":null,"potentialPayout":null,"currency":null,"notes":"Slika ne izgleda kao tiket."}`;

/** Model uprkos uputstvu ume da vrati brojeve kao stringove ("1,45" / "500.00") — svodimo na brojeve. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalize(raw: unknown): ScannedTicket {
  const r = (raw ?? {}) as Record<string, unknown>;
  const legsRaw = Array.isArray(r.legs) ? r.legs : [];
  const legs: ScannedLeg[] = legsRaw
    .map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      const match = str(o.match);
      let pick = str(o.pick);
      // Model ume da vrati "Konacan ishod: Rublev A." — nama treba samo izbor.
      if (pick && pick.includes(":")) pick = pick.split(":").pop()!.trim();
      if (!match || !pick) return null;
      return { match, pick, odds: num(o.odds) };
    })
    .filter((x): x is ScannedLeg => x !== null);

  return {
    bookmaker: str(r.bookmaker),
    legs,
    stake: num(r.stake),
    totalOdds: num(r.totalOdds),
    potentialPayout: num(r.potentialPayout),
    currency: str(r.currency),
    notes: str(r.notes),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nisi prijavljen." }, { status: 401 });
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY nije podešen na serveru." }, { status: 503 });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON." }, { status: 400 });
  }
  const image = body.image;
  if (!image || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Nedostaje slika (data URL)." }, { status: 400 });
  }
  // ~7MB data URL limit — veće slike odbijamo pre nego što potroše kredit.
  if (image.length > 7_000_000) {
    return NextResponse.json({ error: "Slika je prevelika — smanji je (do ~5MB)." }, { status: 413 });
  }

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tennis-edge-woad.vercel.app",
        // Samo ASCII — HTTP header vrednosti su ByteString (em-dash ovde ruši zahtev).
        "X-Title": "EDGE Tenis - ticket scanner",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Pročitaj ovaj tiket i vrati JSON." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `Vision model greška ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Model nije vratio sadržaj." }, { status: 502 });

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: "Ne mogu da pročitam odgovor modela." }, { status: 502 });
      raw = JSON.parse(m[0]);
    }

    return NextResponse.json({ ticket: normalize(raw) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Greška pri čitanju tiketa." }, { status: 500 });
  }
}
