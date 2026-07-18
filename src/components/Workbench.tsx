"use client";

import { useState } from "react";
import type { Player, Surface } from "@/lib/elo";
import { BankrollProvider } from "./BankrollContext";
import Dashboard from "./Dashboard";
import ChatAssistant from "./ChatAssistant";
import DailyPlanCalendar from "./DailyPlanCalendar";
import TicketsOfDay from "./TicketsOfDay";
import TicketScan from "./TicketScan";
import Tabs from "./Tabs";
import BankrollPanel from "./BankrollPanel";
import Fixtures from "./Fixtures";
import MatchAnalysis from "./MatchAnalysis";
import Strategies from "./Strategies";
import Calculator from "./Calculator";
import Research from "./Research";
import AiCouncil from "./AiCouncil";
import ArchiveList from "./ArchiveList";
import Coach from "./Coach";
import SystemsBacktest from "./SystemsBacktest";
import PlayerDirectory from "./PlayerDirectory";

export default function Workbench({ players }: { players: Player[] }) {
  const [pick, setPick] = useState<{ a: string; b: string; surface: Surface } | null>(null);
  const [pickKey, setPickKey] = useState(0);
  const [tab, setTab] = useState("greske");

  function handlePick(a: string, b: string, surface: Surface) {
    setPick({ a, b, surface });
    setPickKey((k) => k + 1);
    setTab("analiza");
    document.getElementById("alati")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const intro = (text: string) => <p className="text-ink-soft max-w-[68ch] mb-5 text-sm">{text}</p>;

  return (
    <BankrollProvider>
      <section className="py-8 space-y-6">
        <Dashboard players={players} onAnalyze={handlePick} />
        <ChatAssistant />
        <TicketsOfDay onAnalyze={handlePick} />
        <DailyPlanCalendar onAnalyze={handlePick} />
        <TicketScan />
      </section>

      <section id="alati" className="py-8 border-t border-line">
        <h2 className="font-display font-bold text-2xl text-ink mb-1" style={{ fontStretch: "85%" }}>
          Alati — dublja analiza
        </h2>
        <p className="text-sm text-muted mb-5">Sve ostalo je ovde, po tabovima — otvori samo ono što ti treba.</p>

        <Tabs
          key={tab}
          initial={tab}
          tabs={[
            {
              id: "greske",
              label: "🔍 Gde grešim",
              content: (
                <>
                  {intro("Ubaci tikete koje si već odigrao (slikaj gore ili unesi ručno) — pa ti tačno pokažem gde gubiš i šta bi drugačije donelo bolji ishod. Računa se iz tvoje istorije, bez AI kredita.")}
                  <Coach />
                </>
              ),
            },
            {
              id: "sistemi",
              label: "📊 Koji sistem radi",
              content: (
                <>
                  {intro("Simulacija na 2.928 stvarnih mečeva sa stvarnim kvotama: kako bi prošao da si igrao 1 singl, 2 singla, kombinaciju 2/3/4 para… Isti novac u igri, jedina razlika je forma tiketa.")}
                  <SystemsBacktest />
                </>
              ),
            },
            {
              id: "analiza",
              label: "Analiza meča",
              content: (
                <>
                  {intro("Analiza ljudskim jezikom — ko je favorit i zašto, forma, podloga, rang, i gde je value ako uneseš kvote.")}
                  <MatchAnalysis key={`an-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                </>
              ),
            },
            {
              id: "strategije",
              label: "Strategije",
              content: (
                <>
                  {intro("U procentima koliko svaka strategija pristaje meču. Najbolja je označena, ali ti biraš.")}
                  <Strategies key={`st-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                </>
              ),
            },
            {
              id: "kalkulator",
              label: "Kalkulator",
              content: (
                <>
                  {intro(`Elo verovatnoća, de-vig tržišna verovatnoća, edge i Kelly ulog — pretraga po svih ${players.length} igrača.`)}
                  <Calculator key={`ca-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                </>
              ),
            },
            {
              id: "istrazivanje",
              label: "Istraživanje uživo",
              content: (
                <>
                  {intro("Tri agenta pretražuju internet: povrede i vesti, srpske kladionice i kretanje kvota, forumi i sentiment.")}
                  <Research key={`re-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                </>
              ),
            },
            {
              id: "konzilijum",
              label: "AI konzilijum",
              content: (
                <>
                  {intro("Pet AI analitičara (svaki drugi model i karakter), sudija ih ocenjuje, glavni analitičar daje finalni plan.")}
                  <AiCouncil key={`co-${pickKey}`} players={players} initialA={pick?.a} initialB={pick?.b} initialSurface={pick?.surface} />
                </>
              ),
            },
            {
              id: "mecevi",
              label: "Svi mečevi",
              content: (
                <>
                  {intro("Uživo i nadolazeći ATP mečevi. Klikni „Analiziraj” da meč pošalješ u alate.")}
                  <Fixtures onPick={handlePick} />
                </>
              ),
            },
            {
              id: "bankroll",
              label: "Bankroll i istorija",
              content: (
                <>
                  {intro("Podesi ukupan ulog i Kelly opreznost; ispod je cela istorija tiketa i grafik kretanja.")}
                  <BankrollPanel />
                </>
              ),
            },
            {
              id: "arhiva",
              label: "Arhiva analiza",
              content: (
                <>
                  {intro("Svaka AI analiza se čuva — a ako je isti meč analiziran u zadnjih 24h, dobijaš je besplatno iz arhive.")}
                  <ArchiveList />
                </>
              ),
            },
            {
              id: "baza",
              label: `Baza igrača (${players.length})`,
              content: (
                <>
                  {intro("Svi igrači iz 2022–2026 podataka, sa ATP rangom, formom i procentom pobeda po podlozi.")}
                  <PlayerDirectory players={players} />
                </>
              ),
            },
          ]}
        />
      </section>
    </BankrollProvider>
  );
}
