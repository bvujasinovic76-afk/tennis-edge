export type ResearchAgentId = "povrede" | "kvote" | "forumi";

export type ResearchAgent = {
  id: ResearchAgentId;
  name: string;
  model: string;
  maxResults: number;
  buildPrompt: (playerA: string, playerB: string, surface: string, tournament: string) => string;
  systemPrompt: string;
};

const COMMON = `Pretraži internet za AKTUELNE informacije. Odgovaraj na srpskom. Budi kratak i konkretan — maksimum 5-6 rečenica. Ako ne nađeš pouzdanu informaciju, jasno reci "nema pouzdanih informacija" umesto da nagađaš. Uvek se oslanjaj na ono što nađeš u pretrazi, ne na staro znanje.`;

export const RESEARCH_AGENTS: ResearchAgent[] = [
  {
    id: "povrede",
    name: "Agent za povrede i vesti",
    model: "anthropic/claude-sonnet-5",
    maxResults: 5,
    systemPrompt: `Ti si skaut za povrede i vesti u tenisu. Tvoj zadatak je da nađeš najnovije informacije o fizičkom stanju, povredama, odustajanjima, umoru i skorašnjoj formi oba igrača. ${COMMON}`,
    buildPrompt: (a, b, surface, tournament) =>
      `Nađi najnovije vesti (poslednjih 2-3 nedelje) o povredama, fizičkom stanju i formi ova dva teniser pred meč na turniru "${tournament}" (podloga: ${surface}): ${a} i ${b}. Za svakog navedi da li ima signala o povredi/umoru/lošoj formi ili je sve u redu.`,
  },
  {
    id: "kvote",
    name: "Agent za srpske kvote i tržište",
    model: "x-ai/grok-4.5",
    maxResults: 5,
    systemPrompt: `Ti si analitičar kladioničarskog tržišta specijalizovan za srpske kladionice (Mozzart, Meridian, Maxbet, Soccerbet, Admiralbet, Balkanbet, Pinnbet, 1xBet). Tvoj zadatak je da nađeš aktuelne kvote za meč i uočiš kretanje linije i razlike među kladionicama. ${COMMON}`,
    buildPrompt: (a, b, _surface, tournament) =>
      `Nađi aktuelne kvote za tenis meč ${a} protiv ${b} na turniru "${tournament}", pre svega na srpskim kladionicama (Mozzart, Meridian, Maxbet, Soccerbet, Admiralbet). Navedi kvote koje nađeš, ko je favorit po tržištu, i da li ima primetnog kretanja/razlike među kladionicama.`,
  },
  {
    id: "forumi",
    name: "Agent za forume i sentiment",
    model: "perplexity/sonar", // purpose-built for live web search; Gemini returned empty content on this task
    maxResults: 5,
    systemPrompt: `Ti si istraživač tenis zajednica i foruma (Reddit r/tennis, betting forumi, tipster zajednice, Twitter/X). Tvoj zadatak je da uhvatiš sentiment i uglove koje statistika ne vidi — insajderske komentare, H2H utiske, kako igraču leži protivnik. ${COMMON}`,
    buildPrompt: (a, b, surface, tournament) =>
      `Pretraži tenis forume, Reddit i betting zajednice za meč ${a} protiv ${b} (${tournament}, ${surface}). Šta zajednica misli — ko je favorit, ima li nekog ugla ili upozorenja (npr. jednom igraču ne leži ova podloga ili stil protivnika), kakav je opšti sentiment?`,
  },
];

export const RESEARCH_SYNTH_MODEL = "anthropic/claude-opus-4.8";

export const RESEARCH_SYNTH_SYSTEM = `Ti si glavni istraživač koji spaja izveštaje tri agenta (povrede/vesti, srpske kvote/tržište, forumi/sentiment) u jedan kratak dnevni brifing za meč. Odgovaraš ISKLJUČIVO validnim JSON objektom: {"headline": "jedna rečenica — ključni zaključak", "signals": ["kratka konkretna tačka", ...] (2-5 stavki), "risk": "low" | "medium" | "high", "recommendation": "2-3 rečenice: da li istraživanje podržava ili osporava kladenje na ovaj meč i zašto"}. Budi trezven — ako agenti nisu našli ništa konkretno, reci to i stavi risk na "high".`;
