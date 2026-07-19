import type { Surface } from "./elo";

/**
 * Klimatski uslovi po turniru — besplatno preko Open-Meteo (bez API ključa):
 * 1) ime turnira (Sofascore ga daje kao grad: "Bastad", "Gstaad", "Los Cabos"…) → geokodiranje,
 * 2) prognoza/istorija za taj dan (temperatura, vetar, kiša) + nadmorska visina.
 * Sve se kešira u memoriji da ne gađamo servis na svako osvežavanje.
 */

export type TournamentWeather = {
  city: string;
  country: string | null;
  elevation: number | null; // m nadmorske visine
  tMax: number | null; // °C
  windMax: number | null; // km/h
  rainProb: number | null; // % (samo za današnje/buduće dane)
  rainSum: number | null; // mm (radi i za prošle dane)
};

type Geo = { lat: number; lon: number; country: string | null; elevation: number | null };

const geoCache = new Map<string, Geo | null>();
const wxCache = new Map<string, { data: TournamentWeather | null; expiresAt: number }>();
const WX_TTL_MS = 30 * 60 * 1000;

/** "Bastad, Qualifying" -> "Bastad"; "Los Cabos" -> "Los Cabos". */
export function cityOfTournament(tournament: string): string {
  return tournament
    .replace(/,?\s*(qualifying|doubles|men|singles)\b.*$/i, "")
    .split(",")[0]
    .trim();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocode(city: string): Promise<Geo | null> {
  if (geoCache.has(city)) return geoCache.get(city) ?? null;
  const j = await fetchJson<{ results?: { latitude: number; longitude: number; country?: string; elevation?: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`
  );
  const r = j?.results?.[0];
  const geo: Geo | null = r ? { lat: r.latitude, lon: r.longitude, country: r.country ?? null, elevation: r.elevation ?? null } : null;
  geoCache.set(city, geo);
  return geo;
}

/** Vreme (i visina) za turnir na dati dan. Vraća null ako grad nije prepoznat ili je servis pao. */
export async function tournamentWeather(tournament: string, dateStr: string): Promise<TournamentWeather | null> {
  const city = cityOfTournament(tournament);
  if (!city) return null;
  const key = `${city}|${dateStr}`;
  const cached = wxCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const geo = await geocode(city);
  if (!geo) {
    wxCache.set(key, { data: null, expiresAt: Date.now() + WX_TTL_MS });
    return null;
  }

  type Daily = { temperature_2m_max?: (number | null)[]; wind_speed_10m_max?: (number | null)[]; precipitation_probability_max?: (number | null)[]; precipitation_sum?: (number | null)[] };
  const j = await fetchJson<{ elevation?: number; daily?: Daily }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&daily=temperature_2m_max,wind_speed_10m_max,precipitation_probability_max,precipitation_sum` +
      `&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`
  );

  const d = j?.daily;
  const data: TournamentWeather | null = j
    ? {
        city,
        country: geo.country,
        elevation: j.elevation ?? geo.elevation,
        tMax: d?.temperature_2m_max?.[0] ?? null,
        windMax: d?.wind_speed_10m_max?.[0] ?? null,
        rainProb: d?.precipitation_probability_max?.[0] ?? null,
        rainSum: d?.precipitation_sum?.[0] ?? null,
      }
    : null;
  wxCache.set(key, { data, expiresAt: Date.now() + WX_TTL_MS });
  return data;
}

/** Kratke, konkretne napomene šta uslovi znače za igru — samo kad stvarno ima šta da se kaže. */
export function conditionNotes(surface: Surface, w: TournamentWeather | null): string[] {
  const out: string[] = [];
  if (w?.elevation != null && w.elevation >= 750) {
    out.push(`⛰️ ~${Math.round(w.elevation)} m visine — ređi vazduh, lopta leti, servis dobija na značaju`);
  }
  if (w?.tMax != null) {
    if (w.tMax >= 32) out.push(`🌡️ vrućina ${Math.round(w.tMax)}° — brži uslovi, kondicija i izdržljivost presudne`);
    else if (w.tMax >= 28) out.push(`🌡️ toplo ${Math.round(w.tMax)}° — življa lopta, servis prolazi lakše`);
    else if (w.tMax <= 15) out.push(`🥶 hladno ${Math.round(w.tMax)}° — spora lopta, duži poeni, teže za servere`);
  }
  if (w?.windMax != null && w.windMax >= 28) {
    out.push(`💨 vetar do ${Math.round(w.windMax)} km/h — više duplih grešaka i brejkova, favoriti manje sigurni`);
  }
  const rain = (w?.rainProb != null && w.rainProb >= 50) || (w?.rainSum != null && w.rainSum >= 2);
  if (rain) out.push("🌧️ moguća kiša — prekidi lome ritam, oprez sa live klađenjem");
  if (surface === "Clay" && out.length === 0) out.push("🟠 šljaka — duži poeni, autsajderi češće uzmu set");
  return out;
}
